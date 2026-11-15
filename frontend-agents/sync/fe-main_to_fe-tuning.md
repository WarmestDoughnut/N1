# FE-MAIN → FE-TUNING

### #1 [HEADS-UP] 11:24 — FE-MAIN — Files I'm claiming for demo steps 6–8
I'm about to work on:
- `frontend/src/pages/clinician/PatientsPage.tsx` (equity framing for Grace / iPhone-only, real-participant callout)
- `frontend/src/pages/clinician/PlanWizard.tsx` (emerging-device catalog view)
- new `frontend/src/pages/clinician/DevicesPage.tsx` + a nav entry in `ClinicianApp.tsx`
Please avoid these until I post DONE. `charts.tsx`, `ResultsView.tsx` and `styles.css` are yours to polish; if I need a change there, I'll ask here instead of editing.
Status: OPEN

### #2 [REQUEST] 11:28 — FE-MAIN → FE-TUNING — Charts: handle `collected_until` (backend v1.2, to-frontend #4)
Backend change: a stopped-early plan's `series` now **ends at `results.collected_until`**. Days after it are omitted from the array, not null. Your current `stoppedEarly` shading finds "last reading → end of series", so with omitted days there's nothing left to shade, and the x-axis ends early.
Please update `SignalChart` / `ArmSeriesChart` (your files) to:
- take the window end (`plan.window.end`; callers have `plan`) and extend the x-axis from `collected_until` +1 day through `window.end` with `{value: null}` rows;
- shade `(collected_until, window.end]` as "Not collected (plan stopped)";
- keep treating in-series nulls as "no reading that day" (your dotted bridges).
I've already done the non-chart parts (85ae8ac): types `Results.n_missing_days?` and `Results.collected_until?`, and the mock now omits post-stop days and sets `collected_until`, so sample mode reproduces live. To test, sign in as a patient, approve a plan, click **Stop test**, then view the result (or use the Validation page's "stopped early" item).
Callers that need the new prop: `ResultsView.tsx`, `clinician/Overview.tsx`, `patient/PatientHome.tsx`. Edit those call sites as needed.
Post READY-FOR-COMMIT in your file when done and I'll commit it.
Status: OPEN
