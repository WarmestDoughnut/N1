# Backend Logbook (append-only, newest at bottom)

Format:
```
### HH:MM — <short title>
- Done:
- Files:
- Contract impact: none | proposed (msg #) | implemented vX.Y
- How to try it:
- Next:
- Blockers / needs from frontend:
```

---

### 10:45 — Task 0: stats engine + fixtures (frontend unblocked)
- Done: Ported `validate.py` into `app/stats.py` with `run_plan(plan, daily)` returning the full
  CONTRACT §5 result shape (verdict, headline/patient_headline, lag_scan, null_distribution,
  series, warnings). All 11 `tests/test_ground_truth.py` pass against `app.stats` (not the fallback).
  Generated `shared/fixtures/` from that same engine so numbers match the live API exactly:
  devices.json, patients.json (+ REAL-P07 synthesized w/ citation), plan_observational (P01-MARIA),
  plan_intervention (P03-AISHA), results_observational_pass (P01 likely_real), results_observational_null
  (P02 probably_chance), results_intervention_pass (P03 likely_real).
- Files: backend/app/stats.py, backend/app/__init__.py, shared/fixtures/*.json
- Contract impact: proposed v1.1 (see to-frontend #2); fixtures already reflect it. Replied to to-backend #1.
- How to try it: `cd backend && python -m pytest tests/test_ground_truth.py -q` (11 passed).
  Fixtures in `shared/fixtures/`.
- Next: Task 1–3 — scaffold FastAPI app, data_loader, store, schedule, plan endpoints.
- Blockers / needs from frontend: ACK on CHANGE-REQUEST #2 (contract v1.1) so I can bump CONTRACT.md.

### 11:25 — Tasks 1–3: live API (scaffold, loader, store, plans) — **backend is up**
- Done: FastAPI app serving the full contract. `data_loader.py` loads `data/synthetic/` (7 daily
  CSVs + REAL-P07, patients.json w/ synthesized real metadata + citation, devices_full.json,
  demo_plans.json) and adds an observational plan for REAL-P07 ("short sleep before low-readiness
  days", sleep_min/lower/lag3). `store.py` = in-memory store (persisted to data/store.json,
  gitignored) with the CONTRACT §4 status machine + plain-language patient_summary generation.
  `schedule.py` = balanced randomized AB/BA blocks + washout + `smallest_possible_p`. `main.py`
  wires every endpoint: health, devices, patients, scope-enforced series, episodes, plans CRUD,
  approve/decline/pause/resume/stop, simulate-complete, results, schedule preview.
- Verified end-to-end against the running server: all 8 seeded plans simulate to their expected
  verdicts (P01 likely_real lag2, P02 probably_chance, P03 likely_real, P04 probably_chance,
  P05 likely_real, P06 likely_real, P07 not_enough_data, REAL-P07 likely_real p=0.047 — honest
  real result). Scope: 403 before approve, 200 after. Invalid transitions → 409. Results → 404
  no_results until computed. Schedule preview returns balanced arms. Plan creation auto-generates
  id/status/summary/schedule. Episode logging 201. `pytest -q` → 11 passed.
- Files: backend/app/{main,data_loader,store,schedule}.py, backend/requirements.txt, backend/README.md
- Contract impact: implements v1.1 shapes (CHANGE-REQUEST #2 still awaiting your ACK before I bump CONTRACT.md).
- How to try it: `source .venv/bin/activate && cd backend && uvicorn app.main:app --reload --port 8000`
  then e.g. `curl -XPOST localhost:8000/api/plans/DEMO-P01-MARIA/simulate-complete` and
  `curl localhost:8000/api/plans/DEMO-P01-MARIA/results`. Live patient IDs are P01-MARIA…P07-GRACE + REAL-P07.
- Next: bump CONTRACT.md to v1.1 on your ACK; then Task 5 (optional personal risk model) if time.
- Blockers / needs from frontend: your mock uses SYN-* IDs — switch to the live API (real IDs above).
  Please ACK CHANGE-REQUEST #2.

### 11:40 — Device-id fix + Task 5 personal risk model
- Done:
  - **Device blocker fix:** `GET /api/devices` now serves a merged **21-device** catalog = the 17
    vision devices + the 4 compact ids patients actually reference (`fitbit, smart_ring, cgm,
    bp_wearable`) with correct signals. Fixes demo step 1 (iPhone has no sleep_min → sleep grayed;
    Fitbit has sleep_min → unlocks). Regenerated `shared/fixtures/devices.json` to match.
  - **Task 5 risk model (`app/model.py`):** L2 logistic regression on the plan signal at lags
    1..max_lag; out-of-fold AUC via a manual TimeSeriesSplit that skips single-class training folds
    (episodes are rare, so cross_val_predict was failing); label-permutation `auc_null_p`; refuses
    (`too_few_episodes`) under 8 episodes. Wired into `_compute_results` → fills `results.model`
    (already in CONTRACT v1.0 §5; additive, no contract change). ~1.2s/model.
    Verdicts of the honest story: P01 auc 0.909 (p=0.007, top weight sleep_min_lag2), P06 auc 0.951,
    P07 refuses, REAL-P07 auc 0.495 (p=0.53 — does not beat chance).
- Files: backend/app/data_loader.py, backend/app/model.py, backend/app/main.py, shared/fixtures/devices.json
- Contract impact: none (model field pre-existing; device merge is data-only). v1.1 doc bump still pending your ACK.
- How to try it: `curl localhost:8000/api/devices` (21 devices); simulate-complete any observational
  plan then `GET /results` → `model`.
- Verified: 11 ground-truth tests pass; no server errors.
- Next: bump CONTRACT.md to v1.1 on ACK of #2; MDE/preview-power only if time before 14:30 freeze.
- Blockers / needs from frontend: ACK #2 (contract v1.1). Posted FYI #3 (device fix + model).

### 11:50 — CONTRACT.md bumped to v1.1 (frontend ACK'd #2) + replied to blocker #2
- Done: Frontend ACK'd CHANGE-REQUEST #2, so bumped `docs/CONTRACT.md` → v1.1: 6 new daily signals,
  device fields + merged-catalog note, patient fields (condition/story/signals_present/source/citation),
  intervention sufficiency (<5 blocks → not_enough_data + too_few_periods) + permutation/n_permutations
  clarification, null_distribution sign convention, and documented `GET /api/schedule/preview`.
  Health now reports contract_version "1.1". Replied DONE to frontend's device-id BLOCKER #2 (fixed
  via merged catalog) and to #1.
- Files: docs/CONTRACT.md, docs/messages/*
- Contract impact: implemented v1.1 (additive).
- How to try it: `curl localhost:8000/api/health` → contract_version 1.1.
- Next: optional minimum-detectable-effect (GET /api/plans/preview-power) if time before 14:30 freeze; else polish.
- Blockers / needs from frontend: none open. Live API ready at :8000 with real IDs.

### 11:55 — Risk-model honesty fix (circular-shift null + screening gate)
- Done: Two fixes so the bonus risk model stays honest and on-narrative:
  1. **Circular-shift null** for the model's AUC (was random label permutation). Episodes are
     autocorrelated; random shuffling made the test anti-conservative.
  2. **Screening gate:** only fit the model when the observational verdict is `likely_real`/
     `suggestive`. Otherwise `trained:false` with `reason` `no_primary_signal` (probably_chance)
     or `too_few_episodes` (not_enough_data). This fixed P02-JAMES, whose multivariate lagged model
     found a chance pattern (OOF auc 0.759) the univariate screen correctly ignores — showing it would
     have broken the "tool can say no" demo. Rationale: fitting predictive models on screen-rejected
     signals is fishing.
  - Result: P01 auc 0.909 / P06 auc 0.951 (trained), P02 & P07 no model, REAL-P07 auc 0.495 p=0.50
    (trained but honestly not better than chance). Regenerated the 3 results fixtures to include `model`.
- Files: backend/app/model.py, backend/app/main.py, shared/fixtures/results_*.json
- Contract impact: none (model field pre-existing; added `reason` value `no_primary_signal`, additive — see FYI #3 update).
- How to try it: simulate-complete DEMO-P02-JAMES → results.model.trained=false, reason=no_primary_signal.
- Verified: 11 ground-truth tests pass; full API sweep consistent.
- Next: pause for human steer — MDE/preview-power (#5) is the next optional item if we want it before freeze.

### 12:05 — v1.2 demo auth + clinician↔patient connections (frontend CHANGE-REQUEST #3)
- Done: Implemented the full v1.2 auth/connections per frontend #3 (human approved building it now).
  Endpoints: `GET /api/accounts/demo`, `POST /api/auth/login`, `GET /api/auth/me`, `GET/POST
  /api/connections`, `POST /api/connections/{id}/accept`, `DELETE /api/connections/{id}`. Token =
  account id (opaque Bearer). Scoping applied **only when a Bearer token is present** on `/api/patients`,
  `/api/plans`, and `POST /api/plans` (`403 not_connected`); tokenless calls unchanged (back-compat).
  All auth state is isolated in `store.py` (accounts/connections + seed), persisted in store.json —
  so it can move to Supabase/Postgres later without touching the API. Seeded 2 clinicians + 8 patient
  accounts + the active/pending connections from the spec.
- Files: backend/app/store.py (accounts/connections + seed_auth), backend/app/main.py (endpoints + scoping),
  docs/CONTRACT.md (§8, v1.2), docs/messages/to-backend.md (ACK #3 DONE)
- Contract impact: implemented v1.2 (additive; bumped CONTRACT.md).
- How to try it: login `curl -XPOST localhost:8000/api/auth/login -d '{"email":"rivera@n1hub.demo","password":"demo"}'`
  → use returned token as `Authorization: Bearer <token>` on /api/patients, /api/connections, etc.
- Verified: 11 ground-truth tests pass; full auth/connection lifecycle verified end-to-end (login/me,
  scoping, add-by-code→pending→accept→active, all error codes, not_connected, delete keeps data).
- Next: none required. Optional MDE/preview-power (#5) remains if time before 14:30 freeze.
- Blockers / needs from frontend: none. v1.2 live; you can drop the mock fallback for /api/auth + /api/connections.

### 12:40 — Data-honesty fixes (frontend review, 6 items)
- Done: Addressed all 6 points in the frontend's to-backend review (honesty is the product):
  1. `n_missing_days` field; both test types count missing **days**; `missing_data` warning at **≥5%**
     (so James's 5% case warns), 40% still the not_enough_data cutoff.
  2. Intervention periods need **≥50% day coverage** or the mean is treated as missing; sufficiency and
     `n_blocks` now count only usable periods.
  3. Stopped-early plans are **cut at `collected_until`** (window midpoint demo stand-in); new result
     field `collected_until`; series cut there (post-stop days omitted); still labeled `incomplete_plan`.
  4. Intervention `series` now carries the real `episode` values (was hardcoded 0).
  5. Regenerated the 3 results fixtures from live `run_plan` (now window-filtered + model + new fields),
     so sample-data mode matches the live API.
  6. Confirmed out-of-period in-window days (`arm:null`) and washout days are excluded from period means.
- Files: backend/app/stats.py, backend/app/main.py, shared/fixtures/results_*.json, docs/CONTRACT.md (§5),
  docs/messages/to-frontend.md (FYI #4)
- Contract impact: additive v1.2 (`n_missing_days`, `collected_until`, documented missing/coverage rules).
- Verified: 11 ground-truth tests pass; demo verdicts unchanged; stopped-plan cut + warnings verified via API.
- Next: optional MDE/preview-power (#5) if we want it.

### 13:20 — Supabase/Vercel migration prep (data layer) + demo reset + seeded flag
- Done (human decision: Vercel frontend + container-hosted Python API + Supabase Postgres for data; stats stay Python):
  - **Env-gated persistence (`app/persistence.py`):** `JsonBackend` (local, unchanged) and
    `PostgresBackend` (used when `DATABASE_URL`/`SUPABASE_DB_URL` is set). `store.py` now round-trips a
    single snapshot dict through the backend; all in-memory logic unchanged. Flat queryable tables for
    accounts/connections/episodes; jsonb for plan/result bodies. Auto-creates schema on startup.
  - **`POST /api/demo/reset`** (v1.3, frontend ask #1): wipes runtime plans/results/episodes, reloads the
    daily table (undo logged episodes), re-seeds the 8 demo plans + v1.2 accounts/connections.
  - **`seeded: true`** on the 8 `DEMO-*` plans (ask #2) — wizard can stop keying off the id prefix.
  - **CORS** now reads `ALLOWED_ORIGINS` and allows any `*.vercel.app` via regex (hosted frontend works).
  - **`GET /api/health`** now reports `"store": "json"|"postgres"`.
  - Deploy files: `backend/Dockerfile`, `.dockerignore`, `db/schema.sql`, `render.yaml`, `.env.example`;
    `psycopg2-binary` added to requirements (only imported when DATABASE_URL set).
- Files: backend/app/{persistence.py,store.py,main.py}, backend/{Dockerfile,.dockerignore,.env.example,
  requirements.txt,README.md}, backend/db/schema.sql, render.yaml
- Contract impact: additive v1.3 (`/api/demo/reset`, `plan.seeded`, `health.store`). FYI to frontend next.
- How to try it: local unchanged (`store:json`). With Supabase: set `DATABASE_URL`, redeploy, health shows `store:postgres`.
- Verified: 11 ground-truth tests pass; local JSON mode identical; reset + seeded verified via API.
  NOTE: Postgres path not yet run against a real DB — will verify the moment we have the Supabase string.
- Next: wire Supabase string when human provides it; frontend owns Vercel deploy + VITE_API_URL + dropping the mock data source.
- Blockers / needs: Supabase `DATABASE_URL` (from human) to validate the Postgres backend; frontend to deploy to Vercel.

### 14:10 — Full stack deployed & verified (Vercel + Railway + Supabase)
- Done: Helped stand up the hosted stack. Frontend on Vercel (project `n1`, https://n1-lemon.vercel.app,
  Git-connected to main, root `frontend`, VITE_API_URL=Railway). Backend on Railway (Dockerfile) →
  Supabase Postgres (`store:postgres`). Verified end-to-end: public site loads, API URL baked in, CORS
  allows the Vercel origin, backend healthy, clean seed. Auto-deploy on push to main is active.
- Files: docs only (deploy config committed earlier: Dockerfile, render.yaml, persistence.py, etc.).
- Contract impact: none.
- How to try it: open https://n1-lemon.vercel.app (sign in rivera@n1hub.demo / demo).
- Next: 15:30 joint rehearsal against the public URL; optional capability-gate enforcement + MDE.

### 14:20 — v1.4: observational lag range (#6) + new signals catalog placement (#7/#8); replied #4
- Done: Worked through the frontend's open change-requests.
  - **#4** (recorded A/B schedule): already shipped `plan.seeded: true`; replied DONE — switch off the id prefix.
  - **#6** (v1.4): observational `min_lag_days` (default 1) + `max_lag_days` up to 14; scan over [min,max];
    `422 invalid_lag_range`; new warning `windows_cover_most_days` (>50% of analyzable days in best window).
    Defaults (1–3) byte-identical → 11/11 tests + 8 verdicts unchanged.
  - **#7/#8** (v1.4, catalog-only fallback): added `screen_time_min`, `late_screen_min`, `mood_log`,
    `pain_level` to iPhone/Android catalog + fixtures + backend signal maps/columns. No patient data yet →
    gate shows "supported soon / no data yet". Full synthetic-data plant (incl. optional new phone-only
    patient Sam) deferred to post-freeze to protect the validated dataset; offered to prioritize if humans want it.
- Files: backend/app/{stats,main,store,data_loader}.py, backend/data/synthetic/devices_full.json,
  shared/fixtures/devices.json, docs/CONTRACT.md (v1.4), docs/messages/to-backend.md
- Contract impact: v1.4 (additive). health.contract_version now 1.4.
- Verified: pytest 11/11; API 422 on bad lag range; valid range 2..7 → likely_real lag 2; catalog lists new signals.
- Next: push auto-redeploys Railway + Vercel; then optional MDE / capability-gate enforcement / post-freeze data plant.

### 14:55 — P08-SAM: screen-time data plant (equity beat) + screen cols on all synthetic patients
- Done: Added `screen_time_min` + `late_screen_min` to P01–P07 as a null control (appended via an
  independent RNG — existing columns' values untouched, so all prior verdicts are identical). Created
  new phone-only patient **P08-SAM** (17, migraine, iPhone only) with a planted late-night screen spike
  1–2 days before migraines → `DEMO-P08-SAM` observational (late_screen_min/higher) = **likely_real,
  lag 1** (risk model AUC 0.909). screen_time (total) is correctly `probably_chance` (only late-night
  matters); P01 screen_time null control = `probably_chance`. REAL-P07 deliberately gets NO screen data
  (PMData has none) → gate shows "no data yet". Seeded account `sam@n1hub.demo` + Rivera↔Sam connection.
  Equity story: a phone-only patient who DOES get a real answer, next to Grace's honest not_enough_data.
- Files: backend/data/synthetic/{daily/*.csv (+P08-SAM.csv), patients.json, demo_plans.json, ground_truth.json},
  backend/app/store.py (Rivera↔Sam), shared/fixtures/{patients,devices}.json
- Contract impact: none beyond v1.4 signals (already documented). ground-truth tests now 12/12.
- Verified: pytest 12/12 (existing 11 unchanged + P08); local JSON-mode API: Sam patient/account/connection,
  simulate → likely_real lag 1. Did NOT touch the shared Supabase DB (used DATABASE_URL="" locally).
- Next: HOLDING the push until the two usability agents finish their live runs (a Railway redeploy would
  interrupt them). After they report: push → Railway redeploys with P08 → reset Supabase to reseed incl Sam.

### 15:05 — Usability-report fixes (backend side) + perf trim
- Done (responding to the physician/patient usability agents):
  - **Risk-model jargon (physician MED):** model now returns `quality` (strong/moderate/weak),
    `beats_chance` (bool), a plain-language `plain` sentence, and `coefficients[].label`
    ("Sleep, 2 days before") so the UI needn't show raw AUC / `sleep_min_lag2`.
  - **Simulate perf (physician HIGH):** dropped a redundant per-shift permutation call in the
    observational null (zero stats change) and cut the risk-model permutation null 150→100
    (verdict-independent). Kept observational at 2000 shuffles (the UI advertises "2,000"). The
    headline fix for "looked hung" is a frontend progress indicator — relayed.
  - Confirmed backend `pause` works (approve→pause→paused→resume) — the patient's HIGH "pause broken"
    is a frontend issue, relayed.
- Files: backend/app/stats.py, backend/app/model.py, shared/fixtures/results_*.json, docs/CONTRACT.md
- Contract impact: additive v1.4 (model `quality`/`beats_chance`/`plain`/`coefficients[].label`).
- Verified: pytest 12/12; model returns plain labels.
- Next: push (Sam + these) → Railway/Vercel redeploy → reset Supabase → relay both usability reports.

### 15:45 — v1.5 overhaul implemented (frontend #11 B1–B10)
- Done: Symptoms entity + CRUD + seeding + episode/observational symptom_id resolution (default → episode
  column, verdicts unchanged); collection plan type + per-signal summary; analyses on collections; plan notes;
  results clinician_comment + reviewed_at; plan.instructions; manual A/B (assignment + not_randomized/randomized:false
  + caveat headline, per human "allow both + alert"); series symptom:<sid> columns + window-clip; look-back cap 30.
  New store entities (symptoms/notes/analyses) persisted in JSON + 3 Supabase jsonb tables (backend falls back to
  JSON if DB down). CONTRACT → v1.5 (§9); 3 new fixtures.
- Files: backend/app/{store,persistence,main,stats}.py, docs/CONTRACT.md, shared/fixtures/{symptoms,plan_collection,results_intervention_manual}.json
- Contract impact: implemented v1.5 (all additive; public endpoints backward-compatible).
- Verified: pytest 12/12; full JSON-mode smoke pass (symptoms CRUD, episode+symptom, instructions, collection
  summary, analyses incl. 422s, notes, comment/review, manual A/B alert, series symptom column, lag-30).
- Next: push → redeploy → reset Supabase; replied to #11 earlier with locked names; FYI #11 posted.

### 15:55 — v1.6 retrospective & mixed windows (FE to-backend #13/#14)
- Done: windows may reach into the past; `delivery` + `window.past_end`/`live_start` derived on every plan;
  approve shares past data immediately (retrospective → straight to `complete` with a `shared` event; mixed →
  past shared, stays active); observational past tests + collection analyses run on approval; retro A/B blocked
  unless recorded/seeded; `window_before_data` guard; consent copy names the shared past window;
  REAL-P07 display_name → "Jordan, 34".
- Files: backend/app/main.py (`_as_of`/`_delivery`/`_apply_delivery`, `_window_df(until=)`,
  `_compute_results(until=)`, create_plan guards, approve rewrite, create_analysis guards, get/list_plans stamp,
  CONTRACT_VERSION 1.6), backend/app/store.py (`_retro_sentence` + summary wording),
  backend/app/data_loader.py (REAL display name), docs/CONTRACT.md (v1.6 §10 + changelog),
  shared/fixtures/{plan_collection_retrospective,results_collection_retrospective,plan_mixed}.json.
- Contract impact: implemented v1.6 (additive).
- How to try it: create a collection/observational plan with window 2026-06-01..2026-09-28 → approve →
  it returns status `complete` with results; `curl /api/plans/{id}` shows `delivery:"retrospective"`.
- Verified: 12 ground-truth tests pass; live smoke of retro collection+analysis, retro observational
  (DEMO-P01-MARIA → likely_real lag 2), retro-A/B block, window_before_data guard.
- Next: none — handed back to FE.
- Blockers / needs from other side: none. (Did NOT touch the assistant endpoint/assistant.py — parent owns it.)

### 16:10 — v1.6 follow-up: FE #15 + patient-progress bug (A/B future-only, seeded exempt, delivered flag)
- Done: renamed error `intervention_requires_future` → `ab_requires_future_window` (FE #15 contract name);
  seeded DEMO-* plans forced `delivery:"prospective"` so their approve→active→simulate-complete flow (incl.
  A/B demo) is untouched; new `plan.delivered` + `window.live_days` so a retrospective (past-only) plan renders
  as "sent" with NO "day X of N" countdown (patient-progress bug); `simulate-complete` idempotent on already-
  complete plans; `source_collection_id` passed through; CONTRACT §10 + fixtures updated.
- Files: backend/app/main.py (seeded exemption in `_delivery`, `_live_days`, `delivered`/`live_days` in
  `_apply_delivery`, error rename), docs/CONTRACT.md, docs/messages/{to-backend,to-frontend}.md,
  shared/fixtures/{plan_collection_retrospective,plan_mixed}.json, backend/tests/test_retrospective.py (+3 tests).
- Contract impact: implemented v1.6 (additive; answers FE #13/#14/#15).
- Verified: 21 tests pass; live smoke — retro collection delivered:true/live_days:0/"sent" wording;
  seeded DEMO-P03-AISHA prospective + approve→active; new retro A/B → 422 ab_requires_future_window.
- Blockers / needs from other side: none. Did NOT touch assistant.py / /api/assistant / health assistant fields.

### — Assistant 502 fix + draft-plan (B) + workflow-context (A)
- Done: fixed `/api/assistant` 502 (current anthropic SDK removed `temperature` from messages.create →
  TypeError; dropped the kwarg, grounding comes from the strict system prompt). Added two capabilities to
  the physician design-copilot: (B) a ```json `draft_plan` block the reply emits when the clinician asks to
  set up a test, so the frontend can pre-fill the wizard (text instructions = fallback); (A) an OPTIONAL
  non-PHI `context` workflow snapshot on the request (today's activity / items needing a comment — the
  clinician's own already-loaded view) that the assistant may summarize/triage ONLY — it still fetches
  nothing from the store and keeps the no-diagnosis / no-invention / store-isolated bar.
- Files: backend/app/assistant.py, backend/app/main.py (endpoint passes body.context through).
- Contract impact: additive — `/api/assistant` request gains optional `context`; reply may contain a
  draft_plan json block. FYI to frontend #14. (No stats/schema change; v1.6 unchanged.)
- Verified: 21 tests pass (12 ground-truth + 9 retrospective); assistant verified live earlier (real reply).
- How to try it: POST /api/assistant with a clinician Bearer token; see to-frontend #14 for shapes.
- Next: confirm draft-plan + context behave on the Railway redeploy.
