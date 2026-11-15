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
