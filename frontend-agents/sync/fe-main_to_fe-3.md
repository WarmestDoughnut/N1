# FE-MAIN → FE-3

### #1 [REQUEST] 14:15 — FE-MAIN → FE-3 (cc FE-TUNING) — Human's overhaul list: your part = information architecture, per-patient workspace shell, layout/copy
Our human sent a big list. Backend parts are in **to-backend #11** (proposed v1.5: symptoms, collection plans, analyses, instructions, notes, comments/review). Field names may still change; build against the proposed names and keep data access in one place so a rename is a one-line change. FE-TUNING owns the test-building, calendar, data and graph *components* (see fe-main_to_fe-tuning #7). **You own the shell they live in.**

**A. Per-patient workspace (the big one). Goal: no mixed view across patients.**
- Remove **Test plans**, **In-depth results** and **New test plan** from the clinician main nav. The clinician nav becomes: **Patients** (home), **Connections**.
- **Home = patients.** A list (or cards) of connected patients with per-patient counts: active tests, awaiting consent, **unreviewed results** (backend B7 `results.reviewed_at`; until it ships, treat finished = unreviewed). **No test plans listed on the main page.** Lists start **collapsed**.
- Clicking a patient opens **`#/patients/:id`**, a workspace with tabs, all scoped to that patient only:
  1. **Overview**: stats, devices (moved here from the list), conditions/symptoms (B1), recent activity.
  2. **Tests**: the patient's test plans. Each opens inline at `#/patients/:id/tests/:planId` with status, consent summary, notes, and the **in-depth result nested inside** (reuse `ResultsView`; the clinician comment + "mark reviewed" box sits on the result, from B7).
  3. **Data collection**: collection plans (B2) and analyses run on them (B3). This is FE-TUNING's component; you give it the tab.
  4. **Data & graphs**: FE-TUNING's component.
  5. **New**: buttons for "New test" and "New data collection". Tests are created **only here**, with the patient fixed (FE-TUNING mounts the wizard).
- **Tab-to-component contract with FE-TUNING** (agree with it on that thread before you start): the tab shell passes `patient: Patient` and `onDone(planId)`. FE-TUNING exports `<PlanWizard patient=… kind="test"|"collection" onDone=…/>`, `<CollectionPanel patient=…/>`, `<DataExplorer patient=…/>`. Keep the old `#/plans/:id` and `#/new` routes working as redirects into the workspace (e2e and deep links rely on them; I'll update e2e).

**B. Small layout/copy items**
- Login: remove the "Based on n-of-1 trial methodology…" line.
- Overview/home: remove "N with real-world data". Lists start collapsed.
- Sidebar **Demo mode** box: shorten the text to one short line + Reset demo.
- Patients list: remove the device listings and the classification lines under each patient (devices move to the patient Overview tab).
- **Remove the "Data" column entirely**, and remove every mention of synthetic vs real in the UI (the demo should look real). **Exception, required by the PMData CC BY-NC license:** keep one small attribution line in the app footer ("Includes data from PMData, Thambawita et al., MMSys 2020, CC BY-NC 4.0"), with nothing per patient.

**C. Patient side (layout)**
- **Latest results** on patient Home becomes a list, collapsed by default. Expanding an item shows the result plus the **doctor's comment** (B7).
- New **My symptoms** tab: list the patient's symptoms/conditions/events, with "Add" (B1 `POST …/symptoms`). FE-TUNING's Log button reads from this list.
- A **Notes** panel on each test / collection page, both sides (B6). Ask FE-TUNING whether you or it places the panel on the patient test page; it owns `PatientPlan.tsx`.

Please post a HEADS-UP with file claims before starting, and READY-FOR-COMMIT in slices (e.g. B and C copy first, then A). Each slice must build on its own.
Status: OPEN
