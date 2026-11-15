You are the FRONTEND instance for N1 Hub. Another Claude Code instance is building the
BACKEND in the same repo at the same time. We have until a 14:30 feature freeze.

Before anything else:
1. Read `CLAUDE.md` fully, then `docs/CONTRACT.md` fully. They are binding.
2. `git pull --rebase`. Read `docs/log/backend.md` and any OPEN messages in `docs/messages/to-frontend.md`.
3. You own ONLY `frontend/`, `docs/log/frontend.md`, and appending to
   `docs/messages/to-backend.md`. Never edit `backend/` or `shared/fixtures/`.

Your tasks, in order. Commit + push (`[frontend]` prefix, `git pull --rebase` first) after each,
and append a logbook entry after each.

**Task 1 — Scaffold.** Vite + React + TypeScript in `frontend/`, Recharts, simple clean
styling (no heavy UI framework needed; a small CSS file is fine). `src/api.ts` with typed
functions for every endpoint in the contract and a `USE_FIXTURES` switch: when true (or when
the backend is unreachable), read from `../shared/fixtures/*.json` (copy them into
`frontend/src/fixtures/` via a small script or import path — do not edit the originals).
`src/types.ts` mirrors CONTRACT types exactly. Top bar: app name "N1 Hub", role switcher
(Clinician / Patient), "Demo mode" badge. Add `frontend/README.md` with run commands.
If fixtures aren't in the repo yet, build against hand-written mocks that follow the contract
and swap when the backend's FYI arrives.

**Task 2 — Results screen (most important screen in the product).** For one plan:
- Header: the hypothesis/question in plain words.
- Big verdict badge (`likely_real` green, `suggestive` amber, `probably_chance` gray,
  `not_enough_data` outlined) + `headline`.
- Observational: line chart of the signal with pre-episode windows shaded and episodes marked;
  lag-scan bar chart; "Chance check" card in plain language, e.g. "A pattern this strong
  appeared in only 1.2% of 2,000 random shuffles" (p × 100), plus a small histogram of
  `null_distribution` with the observed effect marked.
- Intervention: chart colored by arm (A / B / washout), period means as bars, A vs B means.
- Footer: n_episodes / n_periods, n_days, warnings as chips, "Not diagnostic — worth
  discussing with your clinician."
- `model` tab: hidden when `model` is null.
Build with fixtures first: pass AND null versions must both look good.

**Task 3 — Clinician plan wizard.** Steps: choose patient → select devices (from
`/api/devices`; preselect patient's devices) → choose signals (signals not provided by any
selected device are grayed out with "needs a device that tracks sleep" style reason) →
test type (observational: signal + direction + max lag; intervention: arm names, outcome
signal, better direction, period_days, washout_days, n_periods, with live schedule preview
from `/api/schedule/preview` shown as a colored A/B timeline) → review → send.
Plus a clinician plan list with status chips, and results link when complete.

**Task 4 — Patient side.** Pending plan page showing `patient_summary` in large readable text
with the exact signals and window listed, Approve / Decline. Active plan page with progress,
Pause / Resume / Stop, a "Log an episode" button, and a "Simulate complete (demo)" button.
Patient results view: same verdict, uses `patient_headline`, simpler charts.

**Task 5 — Switch to live API** as backend endpoints come online (watch their log/messages).
Handle 403/404/409 gracefully with friendly messages.

Rules: never change the contract without the CHANGE-REQUEST protocol (post in
`docs/messages/to-backend.md`). If you need something from the backend, post a QUESTION or
CHANGE-REQUEST immediately rather than working around it. Prioritize the demo script in
CLAUDE.md §10 — it must run end to end without errors. Large readable fonts, high contrast,
accessible colors (equity track: older users). When you finish a task, tell the human in one
short line what's live and how to try it.

Start with Task 1 now.
