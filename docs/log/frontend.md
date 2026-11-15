# Frontend Logbook (append-only, newest at bottom)

Format:
```
### HH:MM — <short title>
- Done:
- Files:
- Contract impact: none | proposed (msg #) | implemented vX.Y
- How to try it:
- Next:
- Blockers / needs from backend:
```

---

### 10:05 — Task 1: scaffold
- Done: Vite + React + TS + Recharts app in `frontend/`. `src/types.ts` mirrors CONTRACT v1.0. `src/api.ts` has typed functions for every endpoint, a `USE_FIXTURES` switch (`VITE_USE_FIXTURES=true` or the top-bar toggle), and automatic fallback to sample data if the backend is unreachable. Since `shared/fixtures/` is empty, the sample data comes from an in-browser mock (`src/lib/mockServer.ts`) that follows the contract: patients SYN-PATTERN / SYN-NULL / SYN-TREAT / SYN-TREAT-NULL / PMD-P01, the status machine, and schedule + simplified stats. When backend fixtures appear, `npm run dev` copies them into `src/fixtures/` (classified by shape, so any filenames work). Top bar: "N1 Hub", Clinician/Patient switcher, Demo mode badge, data-source badge.
- Files: frontend/** (README.md has run commands)
- Contract impact: none
- How to try it: `cd frontend && npm install && npm run dev` → http://localhost:5173
- Next: Task 2, the results screen.
- Blockers / needs from backend: none yet. Please post an FYI once fixtures are in `shared/fixtures/`. Any filenames work.

### 10:45 — Task 2: results screen
- Done: `ResultsView` with a clinician view and a patient view. It has: the question header, a large verdict badge (green, amber, gray, or dashed outline), and the headline. Observational results show a signal chart with pre-episode windows shaded and episodes marked, a lag-scan bar chart with p-values, and a "Chance check" card in plain language ("appeared in only X% of N random shuffles") with a null histogram and the observed effect marked. Intervention results show the randomized schedule timeline, the outcome series colored by arm with washout bands, A vs B means, and per-period means. The footer shows chips (episodes/periods, days, warnings) and the "Not diagnostic — worth discussing with your clinician" disclaimer. The model tab only appears when `model != null`. The results gallery at `#/gallery/<i>/<clinician|patient>` shows every verdict variant, plus any backend results fixtures.
- Verified with mock analysis: SYN-PATTERN gives likely_real (lag 2), SYN-NULL gives probably_chance, SYN-TREAT gives likely_real, SYN-TREAT-NULL gives probably_chance, and a stopped-early plan gives not_enough_data.
- Files: frontend/src/components/{ResultsView,charts,Verdict,ScheduleTimeline}.tsx, pages/ResultsGallery.tsx
- Contract impact: none (see message #1 about the intervention p-value floor)
- How to try it: `npm run dev` → http://localhost:5173/#/gallery
- Next: Task 3, the clinician wizard and plan list.
- Blockers / needs from backend: message #1.

### 11:20 — Tasks 3 + 4: clinician wizard/list/detail, patient pages
- Done:
  - **Clinician:**
    - Plan list with status chips and verdict badges.
    - 5-step wizard: patient → devices (patient's own devices preselected) → signals (unavailable ones grayed out with a reason, e.g. "Needs a device that tracks sleep (Apple Watch or Fitbit)") → test design → review → send.
    - Test design covers observational (signal, direction, max lag) and intervention (arms, outcome, better, period/washout days, n_periods, seed + re-randomize) with a live `/api/schedule/preview` A/B timeline.
    - Plan detail shows the plan facts, the patient's summary, history, a "Simulate complete (demo)" button, results, and "Run same plan on another patient" (`#/new?from=PLAN-x`, for demo step 4).
  - **Consent is minimal:** POST /api/plans sends only the signals the test uses (observational: `[signal, episode]`; intervention: `[outcome_signal]`) and only the devices that provide them.
  - **Patient:**
    - Home page grouped into Needs review / In progress / Finished.
    - Pending page shows `patient_summary` in large type, an "Exactly what will be shared" list (signal + source device + window), the schedule for A/B plans, and Approve / Decline (with confirm).
    - Active page has progress, Pause / Resume, Stop (confirm that explains data is kept and results are marked incomplete), Log an episode (POST /api/episodes), and Simulate complete (demo).
    - Results page uses `patient_headline` and simpler charts.
  - **Errors:** 403/404/409/422 are mapped to friendly messages in `api.ts`.
- Verified: I ran demo script §10 steps 1–5 end to end in headless Chrome against sample data. iPhone only → sleep grayed out; add Fitbit → sleep unlocks. SYN-PATTERN → likely_real (lag 2). SYN-NULL → probably_chance. SYN-TREAT A/B → likely_real. No page errors.
- Files: frontend/src/pages/*, components/PlanSummary.tsx
- Contract impact: none
- How to try it: `cd frontend && npm run dev`, open http://localhost:5173, and follow the demo script. If the backend isn't up, the app uses sample data (badge at top right).
- Next: Task 5. Switch to the live API once the backend is up and verify shapes field by field.
- Blockers / needs from backend: the live API and fixtures. Please reply to message #1.

### 12:10 — UI overhaul: sign-in, separate clinician and patient apps, new visual system
- Done (requested by our human):
  - Replaced the Clinician/Patient top-bar toggle with a **sign-in page**. Choosing clinician or patient plus an account (demo build, no password) opens a **separate app per role**. Sign out is in the sidebar profile.
  - The whole UI now follows `FrontEndInspo/Data Dashboard`: DM Sans, white sidebar shell, sticky search topbar, summary cards with icon tiles, tabbed "workspace" chart card with an insights/donut side card, statistics strip, patient rows, and toasts. Type is scaled up from the inspo for readability.
  - **Clinician app:**
    - **Overview:** summary cards, latest results with tabs per finished test, chart, "chance check" donut showing % of shuffles beaten, a statistical analysis strip, and a Needs attention list.
    - **Patients:** devices and testable signals per patient, with a "new plan for this patient" shortcut.
    - **Test plans:** status filters.
    - **Plan detail:** verdict hero, key-number cards, an Evidence workspace (tabs: over time / lag scan or period averages / chance check / risk model), and the statistical analysis strip.
    - **Wizard** (restyled) and **Validation** (the former results gallery).
  - **Patient app**, same system with fewer stats and larger text:
    - **Home:** review requests, in-progress and finished tiles, latest result in plain language, "What you're sharing" card.
    - **My tests:** list of all tests.
    - **Test page:** consent review with an "Exactly what will be shared" list, active controls (log episode / pause / resume / stop / simulate), and a simple results page.
  - **Wizard fix:** removing a device now only *masks* the signals it provided. Re-adding Fitbit restores Sleep automatically, which matches demo step 1.
  - **Chart fix:** the patient-view signal chart was squished horizontally by a hidden empty bar series.
- Verified: headless Chrome runs demo §10 steps 1–5 entirely through sign-in / sign-out with no page errors. PLAN-1 SYN-PATTERN → Likely real. PLAN-2 SYN-NULL → Probably chance. PLAN-3 SYN-TREAT A/B → Likely real. Also checked at 390px mobile width.
- Files: frontend/src/{App.tsx, styles.css, lib/session.ts, components/{Shell,Icon,ResultsView,charts,Verdict,PlanSummary}.tsx, pages/SignIn.tsx, pages/clinician/*, pages/patient/*}; removed pages/{ClinicianPlans,ClinicianPlanDetail,PatientHome,PatientPlan}.tsx and components/TopBar.tsx
- Contract impact: none. Sign-in is client-side only; patient pages only request their own `patient_id`.
- How to try it: `cd frontend && npm run dev` → http://localhost:5173 → sign in as Dr. Rivera, create a plan → sign out → sign in as that patient → approve → simulate.
- Next: Task 5. Switch to the live API once the backend lands.
- Blockers / needs from backend: still none received (no backend commits yet). Message #1 is still open.

### 10:45 — Pulled backend fixtures; adopted contract v1.1; block-randomization rules; e2e test in repo
- Done:
  - ACKed backend #1 (fixtures) and #2 (contract v1.1).
  - Sample-data mode now uses the backend fixtures: P01-MARIA…P07-GRACE + REAL-P07, the 17-device catalog, and fixture results on the Validation page. Mock data generators are mapped onto the demo patients with the same planted ground truth.
  - v1.1 types: 6 new signals, device `availability` (an **Emerging** tag in the wizard), patient `condition/story/citation` (citation and story shown on the patient profile), and `source:"real"`.
  - CLAUDE.md §3 statistics rules:
    - The wizard defaults to 12 periods × 6 days + 2 washout and requires ≥ 10 periods.
    - The min-p helper now uses 1/2^k (k = AB/BA blocks).
    - The mock enumerates all 2^k block flips and returns `not_enough_data` + `too_few_periods` below 5 blocks.
  - Added `npm run e2e` (frontend/e2e/demo.mjs, puppeteer-core with the installed Chrome). It drives demo §10 steps 1–5 through real sign-in/sign-out and asserts the verdicts. Pass `--live` to test against the API, and `--shots=e2e/shots` to save screenshots.
- Verified: `npm run e2e` → Maria: iPhone only grays out Sleep, adding Fitbit unlocks it, Likely real. James: Probably chance. Aisha A/B (12 periods): Likely real, p = 0.016 (64 schedules). No page errors.
- Files: frontend/src/{types.ts, lib/util.ts, lib/mockServer.ts, pages/clinician/{PlanWizard,PatientsPage,Overview}.tsx, pages/SignIn.tsx}, frontend/e2e/demo.mjs, frontend/package.json
- Contract impact: v1.1 ACKed (backend bumps CONTRACT.md).
- How to try it: `cd frontend && npm run dev`, then in another terminal `npm run e2e`.
- Next: demo login with real accounts + clinician↔patient connections (requested by our human). I'll post a CHANGE-REQUEST for the endpoints.
- Blockers / needs from backend: **to-backend #2**. Patient device ids (`fitbit`, `smart_ring`, `cgm`, `bp_wearable`) are missing from the catalog, which breaks demo step 1 on the live API.
