"""
N1 Hub backend — FastAPI (CLAUDE.md §4, CONTRACT.md).

Loads the demo data package at startup, seeds the plan store, and serves the full API:
devices, patients + scope-enforced series, plans + status machine + simulate-complete,
schedule preview, and results (the stats in app/stats.py).

Run: uvicorn app.main:app --reload --port 8000
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import data_loader, stats
from app.model import fit_risk_model
from app.schedule import generate_schedule, smallest_possible_p
from app.store import Store, build_patient_summary

CONTRACT_VERSION = "1.1"

app = FastAPI(title="N1 Hub API", version=CONTRACT_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- loaded at import (so tests/tools can import app state too) ----
DAILY = data_loader.load_daily()
PATIENTS = data_loader.load_patients(DAILY)
DEVICES = data_loader.load_devices()
DEVICE_NAME = {d["id"]: d["name"] for d in DEVICES}
DEVICE_SIGNALS = {d["id"]: set(d.get("signals", [])) for d in DEVICES}

STORE = Store()
STORE.load()
STORE.seed(data_loader.load_seed_plans(DAILY))

# statuses in which a plan's data may be read / results exist
SCOPE_OK = {"active", "paused", "stopped", "complete"}


def err(status, code):
    return JSONResponse(status_code=status, content={"error": code})


def _window_df(plan):
    """Patient daily rows restricted to the plan window (honors the plan scope in time)."""
    df = DAILY.get(plan["patient_id"])
    if df is None:
        return None
    win = plan.get("window") or {}
    start, end = win.get("start"), win.get("end")
    if start and end:
        df = df[(df["date"] >= start) & (df["date"] <= end)].reset_index(drop=True)
    return df


def _compute_results(plan, incomplete=False):
    df = _window_df(plan)
    if df is None or df.empty:
        result = {"plan_id": plan["id"], "type": plan["type"], "complete": False,
                  "verdict": "not_enough_data", "headline": "No data for this patient.",
                  "patient_headline": "There isn't any data to analyze yet.",
                  "effect_pct": 0.0, "p_value": 1.0, "n_permutations": 0,
                  "n_episodes": 0, "n_days": 0, "warnings": ["missing_data"],
                  "observational": None, "intervention": None,
                  "null_distribution": [], "series": [], "model": None}
    else:
        result = stats.run_plan(plan, df)
        result["plan_id"] = plan["id"]
        try:
            result["model"] = fit_risk_model(df, plan, verdict=result.get("verdict"))
        except Exception:
            result["model"] = None
    if incomplete:
        result["complete"] = False
        if "incomplete_plan" not in result["warnings"]:
            result["warnings"] = result["warnings"] + ["incomplete_plan"]
    STORE.set_result(plan["id"], result)
    return result


# --------------------------------------------------------------------------- #
# Health / devices / patients
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"ok": True, "contract_version": CONTRACT_VERSION}


@app.get("/api/devices")
def devices():
    return DEVICES


@app.get("/api/patients")
def patients():
    return list(PATIENTS.values())


@app.get("/api/patients/{patient_id}")
def patient(patient_id: str):
    meta = PATIENTS.get(patient_id)
    if meta is None:
        return err(404, "not_found")
    return meta


@app.get("/api/patients/{patient_id}/series")
def series(patient_id: str, signals: str = "", plan_id: str = ""):
    df = DAILY.get(patient_id)
    if df is None:
        return err(404, "not_found")
    requested = [s for s in signals.split(",") if s]

    if plan_id:
        plan = STORE.get_plan(plan_id)
        if plan is None or plan["patient_id"] != patient_id:
            return err(404, "not_found")
        if plan["status"] not in SCOPE_OK:
            return err(403, "not_in_scope")
        scope = set(plan["signals"])
        cols = [s for s in (requested or list(scope)) if s in scope]
    else:
        present = set(PATIENTS[patient_id].get("signals_present", [])) | {"episode"}
        cols = [s for s in (requested or list(present)) if s in df.columns]

    rows = []
    for _, r in df.iterrows():
        row = {"date": r["date"]}
        for c in cols:
            v = r.get(c)
            row[c] = None if (v is None or (isinstance(v, float) and v != v)) else (
                int(v) if c == "episode" else round(float(v), 1))
        rows.append(row)
    return {"patient_id": patient_id, "rows": rows}


@app.post("/api/episodes")
async def add_episode(request: Request):
    body = await request.json()
    pid, ep_date = body.get("patient_id"), body.get("date")
    if not pid or not ep_date:
        return err(422, "invalid_body")
    STORE.add_episode(pid, ep_date, body.get("note", ""))
    # reflect the logged episode in the in-memory daily table so later analysis sees it
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
    plan = {k: v for k, v in body.items()
            if k not in ("id", "status", "created_at", "history", "patient_summary")}
    plan["id"] = STORE.next_id()
    plan["status"] = "pending_approval"
    from app.store import _now
    plan["created_at"] = _now()
    plan["history"] = [{"at": plan["created_at"], "event": "created"}]
    plan.setdefault("observational", None)
    plan.setdefault("intervention", None)

    if plan.get("type") == "intervention" and plan.get("intervention"):
        iv = plan["intervention"]
        if not iv.get("schedule"):
            iv["schedule"] = generate_schedule(
                iv.get("n_periods", 12), iv.get("period_days", 6),
                iv.get("washout_days", 2), iv.get("seed", 42),
                plan.get("window", {}).get("start"))

    device_names = [DEVICE_NAME.get(d, d) for d in plan.get("devices", [])]
    plan["patient_summary"] = body.get("patient_summary") or build_patient_summary(plan, device_names)
    return JSONResponse(status_code=201, content=STORE.add_plan(plan))


@app.get("/api/plans")
def list_plans(patient_id: str = ""):
    return STORE.list_plans(patient_id or None)


@app.get("/api/plans/{plan_id}")
def get_plan(plan_id: str):
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    return plan


def _event_endpoint(plan_id, event):
    plan, error = STORE.transition(plan_id, event)
    if error == "not_found":
        return err(404, "not_found")
    if error == "invalid_transition":
        return err(409, "invalid_transition")
    if event == "stop":
        _compute_results(plan, incomplete=True)
    return plan


@app.post("/api/plans/{plan_id}/approve")
def approve(plan_id: str):
    return _event_endpoint(plan_id, "approve")


@app.post("/api/plans/{plan_id}/decline")
def decline(plan_id: str):
    return _event_endpoint(plan_id, "decline")


@app.post("/api/plans/{plan_id}/pause")
def pause(plan_id: str):
    return _event_endpoint(plan_id, "pause")


@app.post("/api/plans/{plan_id}/resume")
def resume(plan_id: str):
    return _event_endpoint(plan_id, "resume")


@app.post("/api/plans/{plan_id}/stop")
def stop(plan_id: str):
    return _event_endpoint(plan_id, "stop")


@app.post("/api/plans/{plan_id}/simulate-complete")
def simulate_complete(plan_id: str):
    """Demo only: instantly run the plan over its historical data and mark it complete."""
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    # allow from active/paused; if still pending, auto-approve first (demo convenience)
    if plan["status"] == "pending_approval":
        STORE.transition(plan_id, "approve")
    plan, error = STORE.transition(plan_id, "complete")
    if error == "invalid_transition":
        return err(409, "invalid_transition")
    _compute_results(plan, incomplete=False)
    return plan


@app.get("/api/plans/{plan_id}/results")
def results(plan_id: str):
    plan = STORE.get_plan(plan_id)
    if plan is None:
        return err(404, "not_found")
    r = STORE.get_result(plan_id)
    if r is None:
        return err(404, "no_results")
    return r


# --------------------------------------------------------------------------- #
# Schedule preview (clinician wizard)
# --------------------------------------------------------------------------- #
@app.get("/api/schedule/preview")
def schedule_preview(n_periods: int = 12, period_days: int = 6, washout_days: int = 2,
                     seed: int = 42, start: str = "2026-06-01"):
    sched = generate_schedule(n_periods, period_days, washout_days, seed, start)
    return {"schedule": sched, "smallest_possible_p": round(smallest_possible_p(n_periods), 4)}
