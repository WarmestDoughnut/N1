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
