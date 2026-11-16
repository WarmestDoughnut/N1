"""
N1 Hub backend — FastAPI (CLAUDE.md §4, CONTRACT.md).

Loads the demo data package at startup, seeds the plan store, and serves the full API:
devices, patients + scope-enforced series, plans + status machine + simulate-complete,
schedule preview, and results (the stats in app/stats.py).

Run: uvicorn app.main:app --reload --port 8000
"""
import os
from datetime import date, timedelta


def _load_dotenv():
    """Load backend/.env (KEY=VALUE lines) without overriding real env vars. No dependency, and
    no shell expansion — so passwords with $ / * survive intact. The container host sets real env
    vars instead, so this is a local-dev convenience only."""
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(path):
        return
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ and "PASTE_" not in val:
            os.environ[key] = val.strip()


_load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import assistant as assistant_mod
from app import data_loader, stats
from app.model import fit_risk_model
from app.schedule import generate_schedule, smallest_possible_p
from app.store import Store, build_patient_summary, _now

CONTRACT_VERSION = "1.7"

app = FastAPI(title="N1 Hub API", version=CONTRACT_VERSION)
# Local dev by default; ALLOWED_ORIGINS (comma-separated) overrides. Any *.vercel.app deploy
# (preview or prod) is allowed via regex so the hosted frontend works without reconfiguring.
_origins = os.environ.get("ALLOWED_ORIGINS")
ALLOWED_ORIGINS = ([o.strip() for o in _origins.split(",") if o.strip()]
                   if _origins else ["http://localhost:5173", "http://127.0.0.1:5173"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- loaded at import (so tests/tools can import app state too) ----
DAILY = data_loader.load_daily()
PATIENTS = data_loader.load_patients(DAILY)
DEVICES = data_loader.load_devices()
DEVICE_NAME = {d["id"]: d["name"] for d in DEVICES}
DEVICE_SIGNALS = {d["id"]: set(d.get("signals", [])) for d in DEVICES}

SEED_PLANS = data_loader.load_seed_plans(DAILY)
for _p in SEED_PLANS:
    _p["seeded"] = True   # mark the recorded demo plans so the wizard needn't key off the id prefix

STORE = Store()
STORE.load()
STORE.seed(SEED_PLANS)
STORE.seed_auth(PATIENTS)
STORE.seed_symptoms(PATIENTS)

# statuses in which a plan's data may be read / results exist
SCOPE_OK = {"active", "paused", "stopped", "complete"}


def err(status, code):
    return JSONResponse(status_code=status, content={"error": code})


def current_account(request: Request):
    """Resolve the caller from `Authorization: Bearer <token>` (token = account id). None if absent/invalid."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    return STORE.get_account(auth.split(" ", 1)[1].strip())


def _allowed_patient_ids(account):
    """Patient ids the caller may see, or None for 'no restriction' (no/!valid token)."""
    if account is None:
        return None
    if account["role"] == "patient":
        return {account.get("patient_id")}
    return STORE.active_patient_ids(account["id"])  # clinician: active connections only


def _as_of():
    """Server-side 'today' (v1.6). Real date — the demo data is historical (Jun–Sep 2026), so
    every demo window ends well before this and is therefore fully retrospective."""
    return date.today().isoformat()


def _delivery(plan):
    """v1.6: classify a plan/collection window against 'today' into
    retrospective | prospective | mixed, and return the past/live split.
    Past data exists at approval time; live data is still to be collected."""
    win = plan.get("window") or {}
    start, end = win.get("start"), win.get("end")
    if not (start and end):
        return {"delivery": "prospective", "past_end": None, "live_start": None}
    # v1.6 (FE #15): seeded DEMO-* plans were prospective trials when they ran — exempt them from the
    # past/future rules so the demo keeps its approve → active → simulate-complete flow (incl. the A/B story).
    if plan.get("seeded"):
        return {"delivery": "prospective", "past_end": None, "live_start": start}
    as_of = _as_of()
    has_past = start <= as_of
    has_future = end > as_of
    if has_past and has_future:
        delivery = "mixed"
    elif has_future:
        delivery = "prospective"
    else:
        delivery = "retrospective"
    past_end = (min(end, as_of) if has_past else None)
    if has_future:
        next_day = (date.fromisoformat(as_of) + timedelta(days=1)).isoformat()
        live_start = max(start, next_day)
    else:
        live_start = None
    return {"delivery": delivery, "past_end": past_end, "live_start": live_start}


def _live_days(win):
    """Number of days still to be collected (the live/future portion). 0 for a fully-delivered
    (retrospective) window — drives the patient view so it shows 'sent', not a 'day X of N' countdown."""
    live_start, end = win.get("live_start"), win.get("end")
    if not (live_start and end) or live_start > end:
        return 0
    return (date.fromisoformat(end[:10]) - date.fromisoformat(live_start[:10])).days + 1


def _apply_delivery(plan):
    """Stamp delivery classification onto the plan: top-level `delivery` + `delivered` (all data
    already sent, nothing to collect) and `window.past_end`/`live_start`/`live_days` (the live portion
    the patient view should count down — 0/none for retrospective). FE #15 patient-progress fix."""
    d = _delivery(plan)
    plan["delivery"] = d["delivery"]
    plan["delivered"] = (d["delivery"] == "retrospective")   # no live collection: present as 'sent'
    win = plan.setdefault("window", {})
    win["past_end"] = d["past_end"]
    win["live_start"] = d["live_start"]
    win["live_days"] = _live_days(win)
    # v1.7 review gate: `patient_released` (clinician has shared the test verdict) + derived
    # `results_released` (collections are always visible; tests only once released).
    plan.setdefault("patient_released", False)
    plan["results_released"] = plan.get("type") == "collection" or bool(plan["patient_released"])
    return d


def _window_df(plan, until=None):
    """Patient daily rows restricted to the plan window, cut at `collected_until` if the plan
    was stopped early (CLAUDE.md §2), and optionally clipped to `until` (v1.6: the past portion
    of a mixed plan, so results can be computed on shared past data before the live part finishes)."""
    df = DAILY.get(plan["patient_id"])
    if df is None:
        return None
    win = plan.get("window") or {}
    start, end = win.get("start"), win.get("end")
    cutoff = plan.get("collected_until")
    if cutoff:
        end = min(end, cutoff) if end else cutoff
    if until:
        end = min(end, until) if end else until
    if start and end:
        df = df[(df["date"] >= start) & (df["date"] <= end)].reset_index(drop=True)
    return df


def _window_midpoint(plan):
    """Demo stand-in for 'when the patient stopped': the middle date of the plan window."""
    win = plan.get("window") or {}
    start, end = win.get("start"), win.get("end")
    if not (start and end):
        return None
    s = date.fromisoformat(start[:10])
    e = date.fromisoformat(end[:10])
    return (s + timedelta(days=(e - s).days // 2)).isoformat()


def _resolve_episode_series(df, plan):
    """For observational plans on a NON-default symptom, rebuild the `episode` column from that
    symptom's logged episodes. Default/omitted symptom keeps the daily `episode` column (so demo
    verdicts are unchanged). Returns a df safe to pass to run_plan."""
    if df is None or plan.get("type") != "observational":
        return df
    sid = (plan.get("observational") or {}).get("symptom_id")
    if not sid or STORE.symptom_maps_episode(sid):
        return df
    pid = plan["patient_id"]
    dates = {e["date"] for e in STORE.episodes
             if e.get("symptom_id") == sid and e.get("patient_id") == pid}
    df = df.copy()
    df["episode"] = df["date"].isin(dates).astype(int)
    return df


def _collection_summary(plan, df):
    """A data-collection plan has no verdict; its 'result' is a per-signal data-coverage summary
    PLUS a graphable series so the data & graphs tab can plot the collected signals (v1.7)."""
    n = int(len(df)) if df is not None else 0
    signals = [s for s in plan.get("signals", []) if s != "episode"]
    per_signal = {}
    for s in signals:
        if df is not None and s in df.columns:
            have = int(df[s].notna().sum())
            per_signal[s] = {"days_with_data": have,
                             "missing_pct": round(100 * (1 - have / n), 1) if n else 100.0}
        else:
            per_signal[s] = {"days_with_data": 0, "missing_pct": 100.0}
    # Multi-signal series (one column per collected signal) over the collection window — same row
    # shape as GET /api/patients/{id}/series, so the chart component can render it directly. (A test
    # uses single-`value` rows; a collection has N signals, hence columns keyed by signal id.)
    series = []
    if df is not None:
        cols = [s for s in signals if s in df.columns]
        has_ep = "episode" in df.columns
        for _, r in df.iterrows():
            row = {"date": r["date"]}
            for s in cols:
                v = r.get(s)
                row[s] = None if (v is None or (isinstance(v, float) and v != v)) else round(float(v), 1)
            if has_ep:
                ev = r.get("episode")
                row["episode"] = 0 if (ev is None or (isinstance(ev, float) and ev != ev)) else int(ev)
            series.append(row)
    return {"plan_id": plan["id"], "type": "collection", "complete": True, "verdict": None,
            "headline": f"Collected {n} days of data across {len(per_signal)} signal(s).",
            "patient_headline": "Your data was collected. Your clinician can review it.",
            "collection": {"n_days": n, "per_signal": per_signal, "signals": signals},
            "observational": None, "intervention": None, "warnings": [],
            "null_distribution": [], "series": series, "model": None}


def _compute_results(plan, incomplete=False, until=None):
    df = _window_df(plan, until=until)
    win_end = (plan.get("window") or {}).get("end")
    collected_until = plan.get("collected_until") or until or win_end

    if plan.get("type") == "collection":
        result = _collection_summary(plan, df)
    elif df is None or df.empty:
        result = {"plan_id": plan["id"], "type": plan["type"], "complete": False,
                  "verdict": "not_enough_data", "headline": "No data for this patient.",
                  "patient_headline": "There isn't any data to analyze yet.",
                  "effect_pct": 0.0, "p_value": 1.0, "n_permutations": 0,
                  "n_episodes": 0, "n_days": 0, "n_missing_days": 0, "warnings": ["missing_data"],
                  "observational": None, "intervention": None,
                  "null_distribution": [], "series": [], "model": None}
    else:
        df = _resolve_episode_series(df, plan)
        result = stats.run_plan(plan, df)
        result["plan_id"] = plan["id"]
        try:
            result["model"] = fit_risk_model(df, plan, verdict=result.get("verdict"))
        except Exception:
            result["model"] = None
    # collected_until tells the frontend where real data ends so it can shade the rest of the
    # window as "not collected (plan stopped)". null means the full window was collected.
    result["collected_until"] = plan.get("collected_until") or (collected_until if incomplete else None)
    if incomplete:
        result["complete"] = False
        if "incomplete_plan" not in result["warnings"]:
            result["warnings"] = result["warnings"] + ["incomplete_plan"]
    STORE.set_result(plan["id"], result)
    return result


# --------------------------------------------------------------------------- #
# Pre-completed demo plans — so BOTH clinician dashboards open onto finished tests (verdicts, graphs,
# and, for likely_real observational, the personal risk/predictive model), not an empty queue. Built
# by cloning the exact seeded demo designs (so verdicts match ground truth) into separate DONE-* ids,
# marked complete with a full approve→shared→complete history. Additive: the pending DEMO-* requests
# are untouched, so a patient now has both a finished test and a fresh request — a realistic dashboard.
# Idempotent (skips if the plan+result already exist), so it only pays the compute cost on first seed.
# --------------------------------------------------------------------------- #
def seed_completed():
    import copy
    for src in SEED_PLANS:
        cid = f"DONE-{src['patient_id']}"
        if STORE.get_plan(cid) is not None and STORE.get_result(cid) is not None:
            continue
        plan = copy.deepcopy(src)
        plan["id"] = cid
        plan["seeded"] = True            # exempt from retrospective rules (a prospective trial that has finished)
        plan["patient_released"] = True  # pre-reviewed historical results — patient view is populated in the demo
        now = _now()
        plan["created_at"] = now
        plan["status"] = "complete"
        plan["history"] = [{"at": now, "event": e} for e in ("created", "approve", "shared", "complete")]
        _apply_delivery(plan)
        STORE.add_plan(plan)
        try:
            _compute_results(plan, incomplete=False)
        except Exception:
            pass   # a design that can't compute shouldn't block startup; the pending DEMO-* twin still works


seed_completed()   # runs once at import (store already seeded above); idempotent on reboot


# --------------------------------------------------------------------------- #
# Health / devices / patients
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"ok": True, "contract_version": CONTRACT_VERSION, "store": STORE.backend_kind,
            "assistant_enabled": assistant_mod.is_enabled(),
            "assistant": assistant_mod.status()}


@app.post("/api/assistant")
async def assistant(request: Request):
    """Physician design-copilot. Strictly bounded: never sees patient data — only the device catalog,
    design rules, and the caller-supplied capabilities. Gated by the kill switch (503 when off)."""
    if not assistant_mod.is_enabled():
        return err(503, "assistant_disabled")
    account = current_account(request)
    if account is not None and account["role"] != "clinician":
        return err(403, "clinicians_only")
    body = await request.json()
    try:
        reply = assistant_mod.answer(body.get("messages", []), DEVICES,
                                     body.get("capabilities", {}), body.get("context"))
        return {"reply": reply}
    except RuntimeError as e:
        return err(503, str(e))
    except Exception:
        return err(502, "assistant_error")


@app.post("/api/demo/reset")
def demo_reset():
    """Restore the seed state: demo plans back to pending_approval, no extra plans/results/episodes,
    accounts and connections back to the v1.2 seed. (Demo convenience; v1.3.)"""
    global DAILY
    DAILY = data_loader.load_daily()          # undo any episodes logged into the in-memory table
    STORE.clear()
    STORE.seed(SEED_PLANS)
    STORE.seed_auth(PATIENTS)
    STORE.seed_symptoms(PATIENTS)
    seed_completed()            # repopulate the finished-test dashboard cards after a reset
    return {"ok": True}


@app.get("/api/devices")
def devices():
    return DEVICES


@app.get("/api/patients")
def patients(request: Request):
    allowed = _allowed_patient_ids(current_account(request))
    vals = list(PATIENTS.values())
    if allowed is not None:
        vals = [p for p in vals if p["id"] in allowed]
    return vals


@app.get("/api/patients/{patient_id}")
def patient(patient_id: str):
    meta = PATIENTS.get(patient_id)
    if meta is None:
        return err(404, "not_found")
    return meta


def _deny_plan_access(request, plan):
    """Consent guard (v1.7, to-backend #18): a tokened caller may touch a plan only if a clinician is
    ACTIVELY connected to the patient, or the caller IS that patient. Tokenless demo calls pass.
    Returns an error response to return, or None if allowed."""
    if not _may_write_patient(current_account(request), plan["patient_id"]):
        return err(403, "not_connected")
    return None


def _shared_signal_windows(patient_id):
    """Consent map (v1.7, to-backend #17): for a patient, signal -> [{start,end,plan_id}] over every
    plan they've SHARED (status in SCOPE_OK), each signal only within that plan's already-collected window
    (clipped to collected_until, and — for prospective/mixed — to today). Plus the symptom ids in scope."""
    windows, sym_ids = {}, set()
    as_of = _as_of()
    for p in STORE.list_plans(patient_id):
        if p.get("status") not in SCOPE_OK:
            continue
        win = p.get("window") or {}
        start, end = win.get("start"), win.get("end")
        if not (start and end):
            continue
        _apply_delivery(p)
        eff_end = end
        if p.get("collected_until"):
            eff_end = min(eff_end, p["collected_until"])
        if p.get("delivery") in ("prospective", "mixed"):
            eff_end = min(eff_end, as_of)     # only the already-elapsed (shared) part is visible
        if eff_end < start:
            continue
        for s in p.get("signals", []):
            if s != "episode":
                windows.setdefault(s, []).append({"start": start, "end": eff_end, "plan_id": p["id"]})
        if p.get("type") == "observational":
            sid = (p.get("observational") or {}).get("symptom_id") or STORE.default_symptom_id(patient_id)
            if sid:
                sym_ids.add(sid)
    return windows, sym_ids


def _shared_data(patient_id, requested=None, start_f=None, end_f=None):
    """Consent-scoped union of everything a patient has shared — the Data & graphs source
    (to-backend #16/#17). Values are null on days outside a signal's shared windows."""
    import statistics as _st
    full = DAILY.get(patient_id)
    windows, sym_ids = _shared_signal_windows(patient_id)
    signals = [s for s in (requested or list(windows.keys())) if s in windows]
    if full is None or not signals:
        return {"patient_id": patient_id, "range": None, "signals": {}, "symptoms": [],
                "rows": [], "summary": {}}
    starts = [w["start"] for s in signals for w in windows[s]]
    ends = [w["end"] for s in signals for w in windows[s]]
    rng_start, rng_end = min(starts), max(ends)
    if start_f:
        rng_start = max(rng_start, start_f)
    if end_f:
        rng_end = min(rng_end, end_f)
    df = full[(full["date"] >= rng_start) & (full["date"] <= rng_end)].reset_index(drop=True)
    sym_hits = {}
    for sid in sym_ids:
        if STORE.symptom_maps_episode(sid):
            sym_hits[sid] = set(df.loc[df["episode"].fillna(0).astype(int) == 1, "date"])
        else:
            sym_hits[sid] = {e["date"] for e in STORE.episodes
                             if e.get("symptom_id") == sid and e.get("patient_id") == patient_id}

    def _in(sig, d):
        return any(w["start"] <= d <= w["end"] for w in windows[sig])
    rows = []
    for _, r in df.iterrows():
        d = r["date"]
        row = {"date": d}
        for s in signals:
            v = r.get(s) if s in df.columns else None
            row[s] = (round(float(v), 1) if _in(s, d) and v is not None
                      and not (isinstance(v, float) and v != v) else None)
        for sid in sym_ids:
            row[f"symptom:{sid}"] = int(d in sym_hits[sid])
        if "episode" in df.columns:
            ev = r.get("episode")
            row["episode"] = 0 if (ev is None or (isinstance(ev, float) and ev != ev)) else int(ev)
        rows.append(row)
    label = getattr(stats, "_signal_label", lambda s: s)
    summary, total = {}, len(rows)
    for s in signals:
        vals = [row[s] for row in rows if row[s] is not None]
        nd = len(vals)
        summary[s] = ({"n_days": nd, "missing_pct": round(100 * (1 - nd / total), 1) if total else 100.0,
                       "mean": round(_st.mean(vals), 1), "median": round(_st.median(vals), 1),
                       "sd": round(_st.pstdev(vals), 1) if nd > 1 else 0.0,
                       "min": min(vals), "max": max(vals)} if vals else
                      {"n_days": 0, "missing_pct": 100.0, "mean": None, "median": None,
                       "sd": None, "min": None, "max": None})
    return {"patient_id": patient_id, "range": {"start": rng_start, "end": rng_end},
            "signals": {s: {"label": label(s), "shared_windows": windows[s]} for s in signals},
            "symptoms": [{"id": sid, "name": (STORE.get_symptom(sid) or {}).get("name")} for sid in sym_ids],
            "rows": rows, "summary": summary}


@app.get("/api/patients/{patient_id}/shared-data")
def shared_data(patient_id: str, request: Request, signals: str = "", start: str = "", end: str = ""):
    """Consent-scoped union of all a patient's shared data (to-backend #16). Connected clinician or the
    patient themself only."""
    if patient_id not in PATIENTS:
        return err(404, "not_found")
    account = current_account(request)
    if not _may_write_patient(account, patient_id):
        return err(403, "not_connected")
    requested = [s for s in signals.split(",") if s] or None
    return _shared_data(patient_id, requested, start or None, end or None)


@app.get("/api/patients/{patient_id}/series")
def series(patient_id: str, request: Request, signals: str = "", plan_id: str = ""):
    full = DAILY.get(patient_id)
    if full is None:
        return err(404, "not_found")
    requested = [s for s in signals.split(",") if s]
    symptom_ids = []           # symptom logs to include as `symptom:<sid>` columns (B4)

    if plan_id:
        plan = STORE.get_plan(plan_id)
        if plan is None or plan["patient_id"] != patient_id:
            return err(404, "not_found")
        deny = _deny_plan_access(request, plan)   # #18: must be connected / own the plan
        if deny:
            return deny
        if plan["status"] not in SCOPE_OK:
            return err(403, "not_in_scope")
        scope = set(plan["signals"])
        cols = [s for s in (requested or list(scope)) if s in scope]
        df = _window_df(plan)   # window- and collected_until-clipped
        if plan.get("type") == "observational":
            sid = (plan.get("observational") or {}).get("symptom_id") or STORE.default_symptom_id(patient_id)
            if sid:
                symptom_ids.append(sid)
    else:
        # No plan_id: a CLINICIAN gets the consent-scoped union (shared data only, #17); the PATIENT
        # (or a tokenless demo call) may see all of their own history.
        account = current_account(request)
        if account is not None and account["role"] == "clinician":
            if not STORE.is_connected(account["id"], patient_id):
                return err(403, "not_connected")
            return _shared_data(patient_id, requested or None)
        df = full
        present = set(PATIENTS[patient_id].get("signals_present", [])) | {"episode"}
        cols = [s for s in (requested or list(present)) if s in df.columns]

    # symptom episode-series aligned to df rows: default symptom = daily `episode`, else logged dates
    sym_hits = {}
    for sid in symptom_ids:
        if STORE.symptom_maps_episode(sid):
            sym_hits[sid] = set(df.loc[df["episode"].fillna(0).astype(int) == 1, "date"])
        else:
            sym_hits[sid] = {e["date"] for e in STORE.episodes
                             if e.get("symptom_id") == sid and e.get("patient_id") == patient_id}

    rows = []
    for _, r in df.iterrows():
        row = {"date": r["date"]}
        for c in cols:
            v = r.get(c)
            row[c] = None if (v is None or (isinstance(v, float) and v != v)) else (
                int(v) if c == "episode" else round(float(v), 1))
        for sid in symptom_ids:
            row[f"symptom:{sid}"] = int(r["date"] in sym_hits[sid])
        rows.append(row)
    return {"patient_id": patient_id, "rows": rows}


@app.post("/api/episodes")
async def add_episode(request: Request):
    body = await request.json()
    pid, ep_date = body.get("patient_id"), body.get("date")
    if not pid or not ep_date:
        return err(422, "invalid_body")
    symptom_id = body.get("symptom_id") or STORE.default_symptom_id(pid)
    STORE.add_episode(pid, ep_date, body.get("note", ""), symptom_id)
    # a default-symptom log reflects into the daily `episode` column (so analysis sees it);
    # a custom symptom is resolved from the logs at analysis time, not the shared column.
    if symptom_id is None or STORE.symptom_maps_episode(symptom_id):
        df = DAILY.get(pid)
        if df is not None:
            mask = df["date"] == ep_date
            if mask.any():
                df.loc[mask, "episode"] = 1
    return JSONResponse(status_code=201, content={"ok": True})


# --------------------------------------------------------------------------- #
# Plans
# --------------------------------------------------------------------------- #
@app.post("/api/plans")
async def create_plan(request: Request):
    body = await request.json()
    account = current_account(request)
    if account is not None and account["role"] == "clinician":
        if not STORE.is_connected(account["id"], body.get("patient_id")):
            return err(403, "not_connected")
    plan = {k: v for k, v in body.items()
            if k not in ("id", "status", "created_at", "history", "patient_summary")}
    # clinician_name drives the patient-facing summary; default it from the signed-in clinician
    # (or a neutral fallback) so a request that omits it never 500s in build_patient_summary.
    if not plan.get("clinician_name"):
        plan["clinician_name"] = (account or {}).get("name") or "Your clinician"
    # look-back range: 1 <= min <= max <= 30 (v1.9: raised cap from 14 to 30)
    if plan.get("type") == "observational" and plan.get("observational"):
        o = plan["observational"]
        lo, hi = o.get("min_lag_days", 1), o.get("max_lag_days", 3)
        if not (isinstance(lo, int) and isinstance(hi, int) and 1 <= lo <= hi <= 30):
            return err(422, "invalid_lag_range")
    # v1.6: window may reach into the past, but not before the patient's first day of data
    meta = PATIENTS.get(body.get("patient_id"))
    first_day = (meta or {}).get("date_range", [None])[0]
    win_start = (plan.get("window") or {}).get("start")
    if first_day and win_start and win_start < first_day:
        return err(422, "window_before_data")
    # v1.6: A/B (intervention) requires a FUTURE window — you cannot randomize arms over data that
    # already happened. Valid only when delivery is prospective or mixed; past-only is rejected.
    delivery = _delivery(plan).get("delivery")
    if plan.get("type") == "intervention" and delivery == "retrospective":
        return err(422, "ab_requires_future_window")
    plan["id"] = STORE.next_id()
    plan["status"] = "pending_approval"
    from app.store import _now
    plan["created_at"] = _now()
    plan["history"] = [{"at": plan["created_at"], "event": "created"}]
    plan.setdefault("observational", None)
    plan.setdefault("intervention", None)

    # intervention schedule: generate only when randomized and none supplied; manual uses what's sent
    if plan.get("type") == "intervention" and plan.get("intervention"):
        iv = plan["intervention"]
        if not iv.get("schedule"):
            iv["schedule"] = generate_schedule(
                iv.get("n_periods", 12), iv.get("period_days", 6),
                iv.get("washout_days", 2), iv.get("seed", 42),
                plan.get("window", {}).get("start"))

    _apply_delivery(plan)   # v1.6: delivery + window.past_end/live_start, read by build_patient_summary
    device_names = [DEVICE_NAME.get(d, d) for d in plan.get("devices", [])]
    plan["patient_summary"] = body.get("patient_summary") or build_patient_summary(plan, device_names)
    return JSONResponse(status_code=201, content=STORE.add_plan(plan))


@app.get("/api/plans")
def list_plans(request: Request, patient_id: str = ""):
    plans = STORE.list_plans(patient_id or None)
    allowed = _allowed_patient_ids(current_account(request))
    if allowed is not None:
        plans = [p for p in plans if p["patient_id"] in allowed]
    for p in plans:
        _apply_delivery(p)   # v1.6: ensure delivery/past_end/live_start present (incl. seeded + pre-v1.6 plans)
    return plans


@app.get("/api/plans/{plan_id}")
def get_plan(plan_id: str, request: Request):
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)   # #18: direct reads by id are connection-checked too
    if deny:
        return deny
    _apply_delivery(plan)
    return plan


def _event_endpoint(plan_id, event, request):
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)
    if deny:
        return deny
    plan, error = STORE.transition(plan_id, event)
    if error == "invalid_transition":
        return err(409, "invalid_transition")
    if event == "stop":
        # keep only data collected up to the stop point (demo: midpoint of the window)
        plan["collected_until"] = _window_midpoint(plan)
        STORE.save()
        _compute_results(plan, incomplete=True)
    return plan


@app.post("/api/plans/{plan_id}/approve")
def approve(plan_id: str, request: Request):
    """Approve a plan. v1.6: if the window reaches into the past, that past data is 'shared' at
    once — a retrospective plan jumps straight to `complete` with results computed immediately
    (so the patient never sees a collection period); a mixed plan shares the past part now and
    stays `active` for the live part."""
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)
    if deny:
        return deny
    plan, error = STORE.transition(plan_id, "approve")
    if error == "invalid_transition":
        return err(409, "invalid_transition")
    d = _apply_delivery(plan)
    if d["delivery"] == "retrospective":
        plan.setdefault("history", []).append({"at": _now(), "event": "shared"})
        STORE.transition(plan_id, "complete")   # active -> complete; all data already exists
        _compute_results(plan, incomplete=False)
    elif d["delivery"] == "mixed":
        plan.setdefault("history", []).append({"at": _now(), "event": "shared"})
        STORE.save()
        # past portion is usable immediately; the live part completes later (or via simulate-complete)
        _compute_results(plan, incomplete=True, until=d["past_end"])
    return plan


@app.post("/api/plans/{plan_id}/decline")
def decline(plan_id: str, request: Request):
    return _event_endpoint(plan_id, "decline", request)


@app.post("/api/plans/{plan_id}/pause")
def pause(plan_id: str, request: Request):
    return _event_endpoint(plan_id, "pause", request)


@app.post("/api/plans/{plan_id}/resume")
def resume(plan_id: str, request: Request):
    return _event_endpoint(plan_id, "resume", request)


@app.post("/api/plans/{plan_id}/stop")
def stop(plan_id: str, request: Request):
    return _event_endpoint(plan_id, "stop", request)


@app.post("/api/plans/{plan_id}/simulate-complete")
def simulate_complete(plan_id: str, request: Request):
    """Demo only: instantly run the plan over its historical data and mark it complete."""
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)
    if deny:
        return deny
    # v1.6: a retrospective plan auto-completes on approve, so a caller that still chains
    # approve → simulate-complete finds it already complete — treat that as an idempotent no-op
    # (recompute + return), never a 409.
    if plan["status"] == "complete":
        _compute_results(plan, incomplete=False)
        return plan
    # allow from active/paused; if still pending, approve first (which itself completes retrospective)
    if plan["status"] == "pending_approval":
        approve(plan_id, request)
        plan = STORE.get_plan(plan_id)
        if plan["status"] == "complete":   # retrospective — approve already finished it
            return plan
    plan, error = STORE.transition(plan_id, "complete")
    if error == "invalid_transition":
        return err(409, "invalid_transition")
    _compute_results(plan, incomplete=False)
    return plan


def _results_released(plan):
    """A TEST verdict is held from the patient until the clinician reviews/releases it (v1.7). A
    data COLLECTION is a raw-data request — it's shared on approval, so there's no verdict to gate."""
    return plan.get("type") == "collection" or bool(plan.get("patient_released"))


@app.get("/api/plans/{plan_id}/results")
def results(plan_id: str, request: Request):
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)   # #18: non-connected clinician can't read results
    if deny:
        return deny
    r = STORE.get_result(plan_id)
    if r is None:
        return err(404, "no_results")
    released = _results_released(plan)
    account = current_account(request)
    is_this_patient = (account is not None and account["role"] == "patient"
                       and account.get("patient_id") == plan["patient_id"])
    # Patient asking for a not-yet-released test verdict → a holding state, not the verdict itself
    # (withheld server-side, not just hidden in the UI).
    if is_this_patient and not released:
        return {"plan_id": plan_id, "type": plan.get("type"), "complete": r.get("complete", True),
                "patient_released": False, "awaiting_review": True,
                "verdict": None, "headline": None,
                "patient_headline": "Your results are ready and are being reviewed by your clinician. "
                                    "They'll share the findings with you shortly.",
                "observational": None, "intervention": None, "collection": None,
                "effect_pct": None, "p_value": None, "model": None,
                "series": [], "null_distribution": [], "warnings": [],
                "reviewed_at": None}
    return {**r, "patient_released": released, "awaiting_review": False}


# --------------------------------------------------------------------------- #
# Schedule preview (clinician wizard)
# --------------------------------------------------------------------------- #
@app.get("/api/schedule/preview")
def schedule_preview(n_periods: int = 12, period_days: int = 6, washout_days: int = 2,
                     seed: int = 42, start: str = "2026-06-01"):
    sched = generate_schedule(n_periods, period_days, washout_days, seed, start)
    return {"schedule": sched, "smallest_possible_p": round(smallest_possible_p(n_periods), 4)}


@app.get("/api/delivery/preview")
def delivery_preview(start: str = "", end: str = "", patient_id: str = ""):
    """v1.6: classify a window the clinician is picking in the wizard BEFORE a plan exists, so the
    UI can split past/live and grey out A/B for a past-only (retrospective) request. Also reports
    whether the window starts before the patient's data (`window_before_data`)."""
    d = _delivery({"window": {"start": start, "end": end}})
    first_day = (PATIENTS.get(patient_id) or {}).get("date_range", [None])[0]
    return {**d, "as_of": _as_of(),
            "intervention_allowed": d["delivery"] in ("prospective", "mixed"),
            "window_before_data": bool(first_day and start and start < first_day),
            "first_data_day": first_day}


# --------------------------------------------------------------------------- #
# Auth + connections (v1.2) — demo only: no hashing, token = account id.
# All state lives in the store so it can move to Supabase/Postgres later unchanged.
# --------------------------------------------------------------------------- #
def _public_account(a):
    return {k: a.get(k) for k in
            ("id", "role", "name", "email", "patient_id", "specialty", "connect_code")}


@app.get("/api/accounts/demo")
def demo_accounts():
    return STORE.demo_accounts()


@app.post("/api/auth/login")
async def login(request: Request):
    body = await request.json()
    acct = STORE.account_by_email(body.get("email"))
    if acct is None or acct["password"] != body.get("password"):
        return err(401, "invalid_credentials")
    return {"account": _public_account(acct), "token": acct["id"]}


@app.get("/api/auth/me")
def me(request: Request):
    acct = current_account(request)
    if acct is None:
        return err(401, "not_signed_in")
    return _public_account(acct)


@app.get("/api/connections")
def list_connections(request: Request):
    acct = current_account(request)
    if acct is None:
        return err(401, "not_signed_in")
    return STORE.connections_for(acct)


@app.post("/api/connections")
async def create_connection(request: Request):
    acct = current_account(request)
    if acct is None:
        return err(401, "not_signed_in")
    if acct["role"] != "patient":
        return err(403, "patients_only")
    body = await request.json()
    conn, error = STORE.request_connection(acct, body.get("clinician_code"))
    if error == "unknown_code":
        return err(404, "unknown_code")
    if error == "already_connected":
        return err(409, "already_connected")
    return JSONResponse(status_code=201, content=conn)


@app.post("/api/connections/{conn_id}/accept")
def accept_connection(conn_id: str, request: Request):
    acct = current_account(request)
    if acct is None:
        return err(401, "not_signed_in")
    if acct["role"] != "clinician":
        return err(403, "clinicians_only")
    conn, error = STORE.accept_connection(conn_id, acct)
    if error == "not_found":
        return err(404, "not_found")
    if error == "invalid_transition":
        return err(409, "invalid_transition")
    return conn


@app.delete("/api/connections/{conn_id}")
def delete_connection(conn_id: str, request: Request):
    acct = current_account(request)
    if acct is None:
        return err(401, "not_signed_in")
    error = STORE.remove_connection(conn_id, acct)
    if error == "not_found":
        return err(404, "not_found")
    if error == "forbidden":
        return err(403, "forbidden")
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Symptoms / conditions (v1.5 B1)
# --------------------------------------------------------------------------- #
def _may_write_patient(account, patient_id):
    """Tokenless demo calls are allowed; with a token, must be the patient or a connected clinician."""
    if account is None:
        return True
    if account["role"] == "patient":
        return account.get("patient_id") == patient_id
    return STORE.is_connected(account["id"], patient_id)


def _public_symptom(s):
    return {k: s.get(k) for k in ("id", "name", "kind", "created_by", "created_at")}


@app.get("/api/patients/{patient_id}/symptoms")
def list_symptoms(patient_id: str):
    if patient_id not in PATIENTS:
        return err(404, "not_found")
    return [_public_symptom(s) for s in STORE.list_symptoms(patient_id)]


@app.post("/api/patients/{patient_id}/symptoms")
async def create_symptom(patient_id: str, request: Request):
    if patient_id not in PATIENTS:
        return err(404, "not_found")
    account = current_account(request)
    if not _may_write_patient(account, patient_id):
        return err(403, "forbidden")
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        return err(422, "invalid_body")
    created_by = account["role"] if account else "patient"
    s = STORE.add_symptom(patient_id, name, body.get("kind", "symptom"), created_by)
    return JSONResponse(status_code=201, content=_public_symptom(s))


@app.delete("/api/patients/{patient_id}/symptoms/{sid}")
def delete_symptom(patient_id: str, sid: str, request: Request):
    account = current_account(request)
    if not _may_write_patient(account, patient_id):
        return err(403, "forbidden")
    if STORE.delete_symptom(sid) == "not_found":
        return err(404, "not_found")
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Notes on a plan, both sides (v1.5 B6)
# --------------------------------------------------------------------------- #
@app.get("/api/plans/{plan_id}/notes")
def list_notes(plan_id: str, request: Request):
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)
    if deny:
        return deny
    return STORE.list_notes(plan_id)


@app.post("/api/plans/{plan_id}/notes")
async def add_note(plan_id: str, request: Request):
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    account = current_account(request)
    if not _may_write_patient(account, plan["patient_id"]):
        return err(403, "not_connected")
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        return err(422, "invalid_body")
    role = account["role"] if account else "patient"
    name = account["name"] if account else "Patient"
    return JSONResponse(status_code=201, content=STORE.add_note(plan_id, role, name, text))


# --------------------------------------------------------------------------- #
# Clinician comment + review on a result (v1.5 B7)
# --------------------------------------------------------------------------- #
@app.post("/api/plans/{plan_id}/results/comment")
async def result_comment(plan_id: str, request: Request):
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)
    if deny:
        return deny
    result = STORE.get_result(plan_id)
    if result is None:
        return err(404, "no_results")
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        return err(422, "invalid_body")
    result["clinician_comment"] = {"text": text, "at": _now()}
    STORE.set_result(plan_id, result)
    return result


@app.post("/api/plans/{plan_id}/results/review")
async def result_review(plan_id: str, request: Request):
    """Clinician reviews a result. By default this also RELEASES the test verdict to the patient
    (the review gate, v1.7) — the clinician's 'I've looked at this, share it' gesture. Pass
    {"release": false} to mark reviewed without releasing yet."""
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)
    if deny:
        return deny
    result = STORE.get_result(plan_id)
    if result is None:
        return err(404, "no_results")
    try:
        body = await request.json()
    except Exception:
        body = {}
    release = body.get("release", True)
    result["reviewed_at"] = _now()
    STORE.set_result(plan_id, result)
    if release and plan is not None:
        plan["patient_released"] = True
        STORE.save()
    return {"ok": True, "reviewed_at": result["reviewed_at"],
            "patient_released": bool(plan and plan.get("patient_released"))}


@app.post("/api/plans/{plan_id}/results/release")
def result_release(plan_id: str, request: Request):
    """Explicit 'share these results with the patient' (v1.7) — releases the held test verdict without
    requiring a comment. Idempotent."""
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)
    if deny:
        return deny
    plan["patient_released"] = True
    STORE.save()
    return {"ok": True, "patient_released": True}


# --------------------------------------------------------------------------- #
# Run a test on a collection's data (v1.5 B3)
# --------------------------------------------------------------------------- #
@app.post("/api/plans/{collection_id}/analyses")
async def create_analysis(collection_id: str, request: Request):
    coll = STORE.get_plan(collection_id)
    if coll is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, coll)
    if deny:
        return deny
    if coll.get("type") != "collection":
        return err(422, "not_a_collection")
    # v1.6: analyses run only once the collection's data has been shared (approved). A pending or
    # declined collection has nothing to analyze yet.
    if coll["status"] not in SCOPE_OK:
        return err(409, "not_in_scope")
    body = await request.json()
    signals = set(coll.get("signals", []))
    window = coll.get("window")
    coll_delivery = _delivery(coll).get("delivery")
    if body.get("observational"):
        o = body["observational"]
        if o.get("signal") not in signals:
            return err(422, "signal_not_in_collection")
        lo, hi = o.get("min_lag_days", 1), o.get("max_lag_days", 3)
        if not (isinstance(lo, int) and isinstance(hi, int) and 1 <= lo <= hi <= 30):
            return err(422, "invalid_lag_range")
        adhoc = {"id": collection_id, "patient_id": coll["patient_id"], "type": "observational",
                 "window": window, "signals": [o["signal"], "episode"], "observational": o}
    elif body.get("intervention"):
        iv = body["intervention"]
        if iv.get("outcome_signal") not in signals:
            return err(422, "signal_not_in_collection")
        if not iv.get("schedule"):
            return err(422, "window_too_short")
        # v1.6: A/B requires a future window — past days were never randomized to arms. Only
        # observational + predictive modeling are valid on past data; A/B is not.
        if coll_delivery == "retrospective":
            return err(422, "ab_requires_future_window")
        adhoc = {"id": collection_id, "patient_id": coll["patient_id"], "type": "intervention",
                 "window": window, "signals": [iv["outcome_signal"]], "intervention": iv}
    else:
        return err(422, "invalid_body")

    df = _window_df(coll)
    if df is None or df.empty:
        return err(422, "not_enough_data")
    df = _resolve_episode_series(df, adhoc)
    result = stats.run_plan(adhoc, df)
    try:
        result["model"] = fit_risk_model(df, adhoc, verdict=result.get("verdict"))
    except Exception:
        result["model"] = None
    if result["verdict"] == "not_enough_data":
        reason = "too_few_periods" if "too_few_periods" in result.get("warnings", []) else "not_enough_data"
        return err(422, reason)
    return JSONResponse(status_code=201, content=STORE.add_analysis(collection_id, result))


@app.get("/api/plans/{collection_id}/analyses")
def list_analyses(collection_id: str, request: Request):
    plan = STORE.get_plan(collection_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)
    if deny:
        return deny
    return STORE.list_analyses(collection_id)


@app.get("/api/plans/{collection_id}/analyses/{aid}")
def get_analysis(collection_id: str, aid: str, request: Request):
    plan = STORE.get_plan(collection_id)
    if plan is None:
        return err(404, "not_found")
    deny = _deny_plan_access(request, plan)
    if deny:
        return deny
    a = STORE.get_analysis(aid)
    if a is None or a.get("collection_id") != collection_id:
        return err(404, "not_found")
    return a
