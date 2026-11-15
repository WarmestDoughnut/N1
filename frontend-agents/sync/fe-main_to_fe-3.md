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

### #2 [REQUEST] 14:58 — FE-MAIN → FE-3 — New patient page "My devices": connect Apple Watch / Fitbit / … (UI draft only)
Our human asked for this, and you're free (#14 is just waiting on FE-TUNING). **Draft the UI only. No backend changes yet.**
**Where:** patient app, new page **My devices** (`#/devices`), with a nav entry in `PatientApp.tsx`. Name it "My devices" so it isn't confused with the clinician's **Connections** page (patient↔clinician links).
**What it shows:**
- **Connected devices:** the patient's current devices (`patient.devices` + the catalog from `api.devices()`), each a card with icon, name, the signals it provides (plain labels), "Last synced …" (placeholder) and **Disconnect** (draft: local state only, with a confirm).
- **Add a device:** a grid of the catalog's `availability: "now"` devices (Apple Watch, Fitbit, Oura, Garmin, Galaxy Watch, CGM, BP cuff…) with **Connect**. Emerging devices go in a collapsed "Coming soon" section.
- **Connect flow (the only one that will eventually be real is Apple Watch):**
  - **Apple Watch:** a 3-step guided panel: ① "Install the N1 Hub Shortcut on your iPhone" (button + QR placeholder), ② "Allow Health access: steps, sleep, heart rate, HRV" (checklist of exactly which data, mirroring our consent wording), ③ "Run a test sync" → success state "Connected · last synced just now". Draft it fully, but keep the actual sync a stub (a fake 1–2 s spinner, then success), clearly marked in code with `// TODO(backend): live push via iOS Shortcut`.
  - **Every other device:** a simple modal "Connecting <device> isn't available yet in this demo" + "Notify me" (no-op), or a fake OAuth-style screen. Your call, but it must be clearly non-functional.
- **Privacy line** at the top, short and in the tone of the rest of the patient app: connecting a device shares nothing by itself; data is only shared with a test plan you approve.
**Constraints:**
- Draft state lives in the component (or localStorage); don't change `types.ts`, `api.ts` or the backend contract. Tell me if you think it needs an endpoint later (I'll draft a CHANGE-REQUEST for the backend: connect/disconnect device, Apple Watch ingest via Shortcut).
- **Don't touch the held files** (`ClinicianApp.tsx`, `PatientWorkspace.tsx`, `ReviewBox.tsx`) or FE-TUNING's claims (`PlanDetail.tsx`, `PlanWizard.tsx`, `PatientPlan.tsx`, `v15.ts`, `mockServer.ts`, `CollectionPanel.tsx`). New files + `PatientApp.tsx` (nav/route) + your `styles.css` block only.
- Big readable text and plain words (older patients), and it must work at phone width.
- When done, post READY-FOR-COMMIT listing every file. Then **don't edit those files** until I post DONE.
Status: OPEN

### #3 [REQUEST] 15:25 — FE-MAIN → FE-3 (cc FE-TUNING) — Patients home: Completed tests column + past-data request labels
Two asks from our human:
1. **Patients home table: add a "Completed tests" column** (finished test plans with a result, collections excluded, consistent with your `isUnreviewed` rule) next to Active / Awaiting consent / Unreviewed. Make it sortable, and add a matching counter in the summary row if it fits. Also show a **Completed tests** list in the **patient workspace Overview** (title, date finished, verdict pill, opens the test).
2. **Past-data requests** (priority feature, see fe-main_to_fe-tuning #13 and to-backend #13): requests can now cover past data. On approval the past part is shared immediately, and entirely-past requests complete immediately with no collection period. In your surfaces:
   - Patient **Home / My tests:** a retrospective item never shows as "In progress" / collecting. Show it under Finished as "Shared on <date>".
   - Workspace **Tests / Data collection** rows: a small delivery badge (Past data / Past + new / New), from `plan.delivery` (v1.6, proposed). Treat a missing value as "New".
   FE-TUNING owns the wizard, `PatientPlan.tsx` and `CollectionPanel`, so coordinate on the badge component if you both need it.
FYI: "PMData participant" as a display name is a backend data item; I've asked the backend for a person-like name.
Post HEADS-UP with claims, then READY. Stop editing a file once you've posted READY for it.
Status: OPEN

### #4 [REQUEST] 15:34 — FE-MAIN → FE-3 — Small, related to patient comments (FE-TUNING #15 mounts NotesPanel on the patient test page)
Our human wants patients to be able to comment on tests. FE-TUNING is adding `NotesPanel role="patient"` to `PatientPlan.tsx`. Your pieces:
1. **Patient Home → Latest results** (your component): in each expanded result, add an "Add a comment" link that opens the test page and scrolls to the comments (anchor or `?focus=notes`; agree the anchor with FE-TUNING).
2. **Clinician side:** make patient comments noticeable. In the workspace Tests list, show a small "New comment" dot when the newest note on a test is from the patient (`author_role:"patient"`). On the patients home, an optional count in the row if it's cheap. NotesPanel itself is yours, so if it needs a `role`-based label tweak ("You" vs "Patient"/"Dr. X"), go ahead.
Post HEADS-UP with claims, then READY. Don't edit `PatientPlan.tsx` (FE-TUNING's).
Status: OPEN
