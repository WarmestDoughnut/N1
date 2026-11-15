You are the BACKEND instance for N1 Hub. Another Claude Code instance is building the
FRONTEND in the same repo at the same time. We have until a 14:30 feature freeze.

Before anything else:
1. Read `CLAUDE.md` fully, then `docs/CONTRACT.md` fully. They are binding.
2. `git pull --rebase`. Read `docs/log/frontend.md` and any OPEN messages in `docs/messages/to-backend.md`.
3. You own ONLY `backend/`, `shared/fixtures/`, `docs/log/backend.md`, and appending to
   `docs/messages/to-frontend.md`. Never edit `frontend/`.

Your tasks, in order. Commit + push (`[backend]` prefix, `git pull --rebase` first) after each,
and append a logbook entry after each.

**Task 0 — Unblock the frontend FIRST (target: 20 minutes).**
- Write `shared/fixtures/` JSON files that exactly match the contract:
  `devices.json`, `patients.json`, `plan_observational.json`, `plan_intervention.json`,
  `results_observational_pass.json` (likely_real), `results_observational_null.json`
  (probably_chance), `results_intervention_pass.json`. Use realistic numbers and ~120 days of series.
- Post FYI message #1 in `docs/messages/to-frontend.md` listing the fixtures.

**Task 1 — Scaffold.** FastAPI app in `backend/app/` (`main.py`, `store.py`, `stats.py`,
`data_loader.py`, `synthetic.py`, `schedule.py`), `backend/requirements.txt`, CORS for
`http://localhost:5173`, `GET /api/health`, `GET /api/devices`. Add a `backend/README.md`
with exact run commands (`uvicorn app.main:app --reload --port 8000`).

**Task 2 — Data.**
- `synthetic.py`: seeded generators for `SYN-PATTERN`, `SYN-NULL`, `SYN-TREAT`,
  `SYN-TREAT-NULL` (~120 days each, realistic noise, weekly rhythm, ~10–15 episodes for
  observational ones). SYN-PATTERN: sleep ~60–90 min lower 1–2 days before episodes.
  SYN-TREAT: B periods ~35 min more sleep.
- `data_loader.py`: load PMData from `backend/data/pmdata/` (the human will place it there;
  if absent, skip gracefully and log it). Build the daily table for 1–2 participants with
  the most complete data. Derive episodes from wellness reports (e.g. fatigue at the worst
  end of its scale) — inspect the actual scale first, document the rule in your log and in a
  CONTRACT FYI. Use null for missing, never 0.
- `GET /api/patients`, `GET /api/patients/{id}/series` (scope-enforced), `POST /api/episodes`.

**Task 3 — Plans.** Store + status machine exactly per CONTRACT §4, `patient_summary`
generated in plain language, `schedule.py` balanced randomized AB/BA blocks with washout,
`GET /api/schedule/preview`, all plan endpoints including `simulate-complete`.

**Task 4 — Stats (the product; be careful and test it).**
- Observational: for each lag L in 1..max_lag, pre-episode window = the L days before each
  episode (excluding episode days); baseline = all other non-episode days. effect_pct =
  (pre_mean − baseline_mean)/baseline_mean × 100. Null: circular-shift the episode series
  (preserves autocorrelation) ≥ 2000 times; correct across lags with the max-statistic
  method; report per-lag and best-lag p-values. Apply verdict rules from the contract.
- Intervention: compare outcome over A vs B period days (washout excluded); null =
  re-randomize arm labels at the period level respecting the AB/BA block structure.
- Write `backend/tests/test_stats.py` with pytest: SYN-PATTERN → likely_real,
  SYN-NULL → probably_chance, SYN-TREAT → likely_real, SYN-TREAT-NULL → probably_chance,
  too-few-episodes → not_enough_data. These tests must pass before you announce results work.
- `GET /api/plans/{id}/results`. Post FYI to frontend when live.

**Task 5 (only if Tasks 0–4 are done and tests pass) — personal risk model.**
L2 logistic regression on lagged features, `TimeSeriesSplit`, AUC, permutation of labels
for `auc_null_p`, refuse to train (with `reason`) if < 8 episodes. Fill `results.model`.
Announce the additive field via FYI.

Rules: never change the contract without the CHANGE-REQUEST protocol. If the frontend asks a
question, answer it promptly in `docs/messages/to-frontend.md`. Keep endpoints fast
(< 2s); cache computed results in the store. Prefer simple, correct code over clever code.
When you finish a task, tell the human in one short line what's live and how to try it.

Start with Task 0 now.
