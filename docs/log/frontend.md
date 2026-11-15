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

### 10:54 — Login with real demo accounts + clinician↔patient connections
- Done (requested by our human):
  - **Sign-in:** email + password form. The account's role decides which app opens. A demo-accounts list (Clinicians / Patients tabs) fills in the form with one click. Every demo password is `demo`. A wrong password shows a friendly error. The session stores the account and token, and `api.ts` sends `Authorization: Bearer` on every call.
  - **Clinician:**
    - The Patients page shows a **connect code** card (RIV-482, with copy), a **Connection requests** inbox (Accept / Decline), connected patients only, and **Remove patient**.
    - The Patients nav badge, bell, and Overview "Needs attention" include requests.
    - The wizard only offers connected patients. The mock returns 403 `not_connected` otherwise.
    - The sidebar shows the clinician's specialty.
  - **Patient:**
    - New **Care team** page: connected clinicians (Remove), pending requests (Cancel), and **Add a clinician** by code.
    - A "My care team" strip on Home.
- Contract impact: **proposed v1.2, to-backend #3**. Sample-data mode implements it fully (`src/lib/mockAccounts.ts`), with the same seed data proposed to the backend. In live mode a bare 404/405 on these new paths falls back to the mock, so the demo works before the backend ships them.
- Verified: `npm run e2e` passes:
  - Wrong password rejected.
  - Dana adds RIV-482 → pending. Rivera accepts → Dana is selectable in the wizard. Leo (pending) is not.
  - Demo steps 1–5: Maria Likely real, James Probably chance, Aisha A/B Likely real.
  - No page errors.
- Files: frontend/src/{types.ts, api.ts, App.tsx, lib/{session,mockAccounts,mockServer}.ts, components/Connections.tsx, pages/SignIn.tsx, pages/clinician/{ClinicianApp,Overview,PatientsPage}.tsx, pages/patient/{PatientApp,PatientHome,CareTeam}.tsx}, e2e/demo.mjs
- How to try it: `npm run dev` → sign in as `dana@n1hub.demo` / `demo` → Care team → add `RIV-482` → sign out → `rivera@n1hub.demo` / `demo` → Patients → Accept.
- Next: Task 5. Point at the live API (`npm run e2e -- --live`) once BLOCKER #2 (device ids) is fixed.
- Blockers / needs from backend: ACK #3 (v1.2) · BLOCKER #2 (patient device ids missing from catalog).

### 11:07 — Task 5: live API integration (demo script passes live)
- Done:
  - Ran the backend locally (`uvicorn app.main:app`, gitignored `.venv`) and pointed the frontend at it. `npm run e2e -- --live` passes demo steps 1–5 with no HTTP errors: Maria likely_real lag 2 (risk-model AUC 0.909 renders), James probably_chance, Aisha A/B likely_real.
  - **Recorded A/B schedule:** historical data follows the seeded schedule, so the wizard now offers "Use the schedule this patient followed" when a seeded `DEMO-*` plan exists. Editing the design or clicking Re-randomize switches back to a fresh schedule. Asked the backend for an explicit field (to-backend #4).
  - **Connection scoping on the client:** the clinician app shows only actively connected patients and their plans until the server enforces v1.2.
  - **Chart fix:** pre-episode windows are now drawn as shaded areas (each window extends to the next day so 1-day windows show). This replaces the hidden-bar trick, which squished the plot on live data with missing values.
  - Added `e2e/check-chart.mjs`, which asserts plots fill ≥ 70% of the chart width. The e2e ignores 404s only for the v1.2 auth/connection paths, which fall back to the mock.
- Files: frontend/src/{components/charts.tsx, pages/clinician/{ClinicianApp,PlanWizard}.tsx}, frontend/e2e/{demo.mjs, check-chart.mjs}
- Contract impact: none (v1.2 still proposed in #3).
- How to try it: `source .venv/bin/activate && cd backend && uvicorn app.main:app --port 8000`, then `cd frontend && npm run dev` and `npm run e2e -- --live`.
- Next: demo steps 6–8 (Grace not_enough_data + equity framing, the REAL participant, an "emerging devices" catalog view). Then remove the legacy-device mock fill.
- Blockers / needs from backend: ACK #3 (v1.2 login/connections) and answer #4 (explicit recorded schedule).

### Chart gaps — honest missing-data rendering
- Done:
  - `SignalChart` / `ArmSeriesChart`: missing days stay as breaks in the solid line but get a faint dotted bridge, with a legend entry "No reading that day". The gradient fill no longer runs under missing days.
  - A/B chart: days outside the schedule (`arm: null`) are drawn as a gray "Outside trial" line instead of being dropped. A→washout→B transitions get a neutral connector, so no arm color is painted on another arm's day. Period bands now touch, with no white slivers.
  - Stopped-early results (`complete: false`): the uncollected tail is shaded "Not collected (plan stopped)".
  - `ArmSeriesChart` owns its legend now (props `armA`/`armB`), and the duplicate legend was removed from ResultsView.
  - Mock: a stopped observational plan now keeps only the first half of the window, matching the intervention mock and the CLAUDE.md rule. Its missing fraction counts collected days only.
- Files: frontend/src/components/{charts,ResultsView}.tsx, pages/clinician/Overview.tsx, pages/patient/PatientHome.tsx, lib/mockServer.ts, styles.css
- Contract impact: none. Backend concerns (missing_data threshold, stop truncation, collected_until) are being sent to backend separately.
- How to try it: Overview, or any results page (Aisha A/B, Maria observational).

### 11:17 — v1.2 live: real login and connections against the backend
- Done:
  - Backend shipped v1.2 (to-backend #3 ACK/DONE). I removed the frontend's mock fallback for the auth and connection paths, so live mode now uses real backend login, scoped patient lists, and add-by-code → pending → accept.
  - Handled the backend's 11:55 rule: the risk-model tab explains `no_primary_signal` and `too_few_episodes`, and the mock follows the same rule.
  - e2e:
    - The live run first resets the Dana ↔ Rivera connection, since the backend persists state between runs.
    - A 401 from the deliberate wrong-password check is expected.
    - Fixed a test bug: a same-URL `goto` didn't reload, so "sample mode" runs were silently hitting the live API.
- Verified: `npm run e2e` (sample) and `npm run e2e -- --live` both pass all checks: login, connections, demo steps 1–5, no HTTP or page errors.
- Note: uncommitted edits to frontend/src/components/{charts,ResultsView}.tsx, mockServer.ts, Overview.tsx, PatientHome.tsx and styles.css (stopped-early "not collected" shading, missing-day bridges) are **not mine**. They appear to come from a parallel session (`n1-d3`). I left them untouched and didn't commit them. Tests pass with them in place.
- Files: frontend/src/api.ts, frontend/e2e/demo.mjs
- Contract impact: v1.2 implemented by the backend; the frontend now uses it live.
- Next: demo steps 6–8 (Grace not_enough_data + equity framing, the REAL participant, emerging-devices catalog view).
- Blockers / needs from backend: answer to-backend #4 (an explicit recorded A/B schedule instead of the `DEMO-` id prefix).

### 11:30 — Coordination: proposed next steps to backend (to-backend #5)
- Done: Posted a prioritized next-steps proposal at our human's request: (1) `POST /api/demo/reset`, (2) explicit recorded-schedule flag (re #4), (3) test asserting all 8 seeded verdicts, (4) minimum-detectable-effect endpoint with a draft contract. Also logistics questions (pitch laptop, 15:30 rehearsal). Confirmed seeded plans for steps 6–7 exist live (DEMO-P07-GRACE walking_speed/iPhone, DEMO-REAL-P07 sleep/Fitbit).
- Contract impact: proposed v1.3 (reset; optional preview-power), pending backend reply.
- Next: demo steps 6–8 UI while waiting.
- Blockers / needs from backend: replies to #4 and #5.

### 12:08 — Committed FE-TUNING work: wizard pickers + agreed signal gate, stopped-plan charts, Reset demo
- Done (FE-MAIN reviewing/committing; FE-TUNING built):
  - **3389209** — Wizard device/signal pickers. Signal gate = selected devices' signals ∩ `signals_present` (+ episode). Observational is disabled for patients with no episodes. The recorded-schedule check uses `plan.seeded`.
  - **3389209** — Charts pad and shade "not collected" from `collected_until` to `window.end`. The sidebar has a **Reset demo** button (`POST /api/demo/reset`).
  - Earlier: 92e67f8 (Patients list/detail + Connections page), bca79bb (`api.demoReset`, v1.3 types, live e2e resets first).
- Verified: `tsc` clean; `npm run e2e` and `npm run e2e -- --live` pass all checks.
- Contract impact: none (uses v1.3).
- Open frontend items (unassigned): Grace / REAL-P07 callouts on the patient detail page; emerging-devices roadmap page (demo step 8); a minor wizard type-reset nit (noted in FE-TUNING #6).
- Blockers / needs from backend: public container URL for Vercel's `VITE_API_URL`.

### 12:25 — Committed FE-TUNING test-design step (mockups) + review fix
- Done: **265e236** wizard step 4 rebuilt from FrontEndInspo/TestDesignStep. It has four slots with inline editors, a "Reads as" sentence, a days-before strip, an A/B timeline/calendar, presets, an evidence-strength meter (1/2^k), and a live "What this test will do" panel. **0fef91c** review fix: custom pattern dates and the test type reset when the patient changes (stale dates could produce empty windows).
- Verified: `tsc` clean; e2e passes in sample and live; plan body unchanged (minimal signals/devices; window = schedule span for A/B or the chosen dates for pattern).
- Pending from backend: to-backend #6 (look-back range), public API URL for Vercel.

### 12:27 — Requested screen-time signal from backend (to-backend #7)
- Done: Our human asked for screen time. I posted a CHANGE-REQUEST with a plan: `screen_time_min` (+ optional `late_screen_min`) as a phone signal (iPhone/Android), daily aggregates only. Synthetic baseline for all 7 patients (null control) plus one planted relationship: Leo, or a new phone-only patient P08 "Sam" (preferred, an equity beat). Not for REAL-P07, which shows the "no data yet" gate. Ground-truth tests must keep every existing verdict. Fallback: catalog-only "supported soon".
- Next: on ACK, add labels/types/mock data on the frontend and extend e2e.

### 12:55 — Fixed broken build on main; committed FE-TUNING #12
- **Incident:** 1f32d14 (FE-TUNING #10) was committed while FE-TUNING was mid-edit on #11, so `main` failed `tsc` (4× TS2322) from 12:46. Every Vercel build from then on would fail, which likely explains why the public site stopped updating (to-backend #9/#10). My pre-commit check was `tsc -b` on the working tree with a stale cache, which wasn't enough.
- **Fix:** 272ad36 (FE-TUNING #12: every test-design slot chosen in its own editor, no tray, nothing pre-filled) + a24f976 (e2e fills every slot). A clean worktree build of the committed HEAD passes; e2e passes in sample and local-live.
- **Process change:** before every push, build the committed HEAD in a clean worktree (`.venv/buildcheck`); push only on ✓.

### 13:52 — Usability fixes landed (both UI instances); all pushed
- FE-3: cd41b29 (Overview tests summary + Results page), f1d14af (In-depth results, mobile nav/top bar, two-line titles, sign-in tab memory, plain-language risk model).
- FE-TUNING: f2c4116 (patient side de-cluttered; requests only in My tests), 6001ee3 (simulate progress, look-back 1–14 with `min_lag_days`, results retry, pause in-flight/error feedback).
- FE-MAIN: cfe5289 (model types; e2e asserts P08-SAM), fad3a78 (`min_lag_days` type), 22eceb2 (e2e).
- Verified: clean-worktree build of every pushed HEAD; e2e sample + live (local backend) pass, including P08-SAM.
- Pause bug from the usability run is not reproducible on current code (to-frontend #10 reply); asked the backend to re-test on the public site.
