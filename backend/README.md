# N1 Hub — Backend

Python 3.11+ / FastAPI. Serves the API in `docs/CONTRACT.md` (v1.1). No DB, no auth;
an in-memory store is persisted to `backend/data/store.json`. Loads the demo data package
in `backend/data/synthetic/` at startup (does not generate synthetic data).

## Run

```bash
# from the repo root, using the provided venv
source .venv/bin/activate
cd backend
uvicorn app.main:app --reload --port 8000
```

API base: `http://localhost:8000`. CORS allows `http://localhost:5173`.
Interactive docs: `http://localhost:8000/docs`.

## Test

```bash
cd backend
python -m pytest -q            # test_ground_truth.py: every demo plan -> its expected verdict (11 tests)
```

## What's where

| File | Role |
|---|---|
| `app/main.py` | FastAPI app + all endpoints |
| `app/stats.py` | the statistics (`run_plan`) — observational + intervention, permutation tests, verdicts |
| `app/data_loader.py` | loads `data/synthetic/` (daily CSVs, patients, devices, demo plans, real PMData participant) |
| `app/store.py` | in-memory plan/results/episode store + status machine, persisted to `data/store.json` |
| `app/schedule.py` | balanced randomized AB/BA block schedules + washout |
| `tests/test_ground_truth.py` | asserts each demo plan returns its planted verdict |

## Key endpoints

- `GET /api/health` → `{ok, contract_version}`
- `GET /api/devices` → 17-device catalog (`availability: now|emerging`)
- `GET /api/patients`, `GET /api/patients/{id}/series?signals=…&plan_id=…` (scope-enforced)
- `POST /api/plans`, `GET /api/plans?patient_id=…`, `GET /api/plans/{id}`
- `POST /api/plans/{id}/approve|decline|pause|resume|stop`
- `POST /api/plans/{id}/simulate-complete` (demo: runs the plan instantly)
- `GET /api/plans/{id}/results`
- `GET /api/schedule/preview?n_periods=12&period_days=6&washout_days=2&seed=42&start=2026-06-01`

## Deployment (Vercel + container + Supabase)

Architecture: **frontend → Vercel**, **this API → a container host** (Railway/Render/Fly), **data →
Supabase Postgres**. The stats stay in Python; only the datastore moves. Everything is env-gated, so
with no `DATABASE_URL` the app runs exactly as the local demo on `data/store.json`.

1. **Supabase:** create a project, grab the Postgres connection string (Settings → Database → URI).
   Tables are auto-created on startup (`app/persistence.py`); `db/schema.sql` is the same schema to
   preview in the SQL editor. Static data (patients/devices/daily CSVs) stays in the repo.
2. **Container host (Railway/Render):** build `backend/Dockerfile`. Render: use `render.yaml`
   (Blueprint). Railway: `cd backend && railway up`. Set env `DATABASE_URL` (Supabase). Optional
   `ALLOWED_ORIGINS`; any `*.vercel.app` origin is already allowed via regex.
3. **Frontend (Vercel):** set `VITE_API_URL` to the container URL. Keep localhost as a 1-command backup.

Check `GET /api/health` → `{"ok": true, "contract_version": "1.2", "store": "postgres"}` to confirm
it's using Supabase. `POST /api/demo/reset` restores the seed state (demo plans + accounts/connections).

## Notes

- Datasets are historical; `simulate-complete` is the "run it now" demo path.
- Demo plans (incl. the real PMData participant `REAL-P07`) are seeded on first run with
  status `pending_approval`. Delete `data/store.json` to re-seed from scratch.
- Intervention plans need ≥ 5 AB/BA blocks (10 periods) or they return `not_enough_data`
  with warning `too_few_periods` (min achievable p = 1/2^k).
