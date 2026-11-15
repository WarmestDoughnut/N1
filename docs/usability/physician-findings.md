# N1 Hub — Physician Usability Test (Dr. Rivera persona)

Tester: Dr. Rivera, busy primary-care physician, ~3 min between patients, tech-comfortable but
not a statistician. Evaluated the live app at https://n1-lemon.vercel.app purely from the browser
(headless Chrome). Screenshots in `/tmp/n1-usability-physician/`.

## Overall impression

Honestly? I'm impressed. I had a hunch — "does short sleep come before Maria's migraines?" — and
in about two minutes of clicking I had a structured test built, a plain-language consent summary
ready to send her, and when I looked at a finished test the answer was dead clear: "Likely real —
sleep was 14% lower in the 2 days before episodes," with a little histogram showing how far out in
the tail this patient's result sat. That "chance check" picture is the thing that would make me
trust it; I don't need a p-value lecture, I can see the real result is nowhere near the random pile.
The whole product keeps repeating "the plan is the consent" and "not diagnostic, worth discussing,"
which is exactly the posture I want. It even correctly says "probably chance" on a null case, which
is what earns my trust. My gripes are small and mostly about one slow button and one confusing
numeric control. This feels like something I'd actually try in clinic.

## Journey notes (per screen)

**1. Landing + sign-in — `01-landing.png`, `03-after-login.png`.** Clean split-screen. The value
prop ("Turn a clinical hunch into an honest answer") lands immediately, and the three bullets
(consent, care team, honest stats) are exactly the questions I'd ask. One-click demo-account chips
("Use" next to Dr. Rivera) made sign-in trivial. No friction.

**2. Dashboard orientation — `03-after-login.png`.** Good. Four KPI cards (connected patients,
active tests, awaiting approval, results ready), a "Latest results" empty state that tells me what
to do next, and a "Needs attention" rail with pending plans and a connection request. The primary
"New test plan" CTA is obvious. Minor: the "Needs attention" rail truncates plan titles hard
("Does short …", "Evening vs …") so I can't tell two sleep plans apart at a glance.

**3. New plan wizard — `04` through `24`.** A 5-step wizard (Patient → Devices → Signals →
Test design → Review). Patient cards show age, data span, and episodes logged — all the context I
need. Devices step pre-selects what the patient owns and lets me expand "Devices the patient
doesn't have (19)" with clear "Emerging / supported soon" tags (`07-other-devices-expanded.png`).
The **Test design** step (`10b`, `15-slot2-done.png`) is the star: four numbered slots
(what to explain / what might come first / how far back / over what dates) that assemble into a
plain English sentence — "Is sleep lower than usual in the 3 days before Maria's episodes?" — and a
live "What this test will do" sidebar spelling out EXPLAINS / USING / LOOKS BACK / CHANCE CHECK /
SHARED WITH YOU. That right-hand panel is excellent; it tells me what I'm committing the patient to
before I send it.

**4. Device & signal gray-out — `08b-signals-crop.png`, `10-test-design.png`.** Works and makes
sense. Available signals are grouped under "From the devices you selected"; unavailable ones are
grayed with a short reason — "needs a device" (patient doesn't own it) vs "no data yet" (owns it but
no data). Deselecting Fitbit (`06-fitbit-deselected.png`) visibly drops its checkmark. The reasons
are terse but clear enough. I'd like "no data yet" to say *why* (never synced? out of window?), but
it's acceptable.

**5. After sending — `25`, `26-testplans-list.png`.** Very clear. On send I land on the plan detail
page with a banner "Waiting for Maria, 68. Nothing is shared until they review and approve," an
"Awaiting patient" status chip, the exact plain-language text the patient will see, and a history
log. A toast confirmed "Sent to Maria for approval." The plan also appears in the "All test plans"
table (`27-plans-index.png`) with filter tabs (Awaiting patient / Active / Results / Declined). I
always knew where my plan lived.

**6. Results — `30-maria-result.png`, `36/37/38` tabs.** This is the payoff and it's strong.
Verdict badge "Likely real," one-line summary, four KPI cards (effect −14.2%, strongest lag 2 days,
p<0.001, 13 episodes), then tabs: **Sleep over time** (time series with episodes marked),
**Lag scan** ("How far ahead does the signal change? 2 days," bars, note that p-values are corrected
for testing several lags), **Chance check** ("<0.1% of 2,000 shuffles were at least this strong,"
histogram with a red marker for this patient — the single most trust-building visual), and
**Personal risk model**. A "Statistical analysis" block restates everything in plain words plus
caveats ("Some days are missing data," "Several lags tested (p-value corrected)," "Not diagnostic").
I could read the whole verdict in 20 seconds and defend it to a colleague.
The null case (`42-probably-chance.png`) is equally legible: gray badge, "No reliable link … the
pattern looks like chance," p=0.212, chance-check "Not passed." The tool can say no — that matters.

**7. Patients & connections — `39-patients.png`, `40-connections.png`.** Patient list is a tidy
table (condition, devices, data, plans, latest result). Connections page explains the care-team
model with a connect code and a 3-step "share code → patient requests → you accept" flow, plus a
pending request I could Accept/Decline. Clean.

**Device catalog:** There is no standalone catalog page. The full device list (17+, with Emerging
tags) only lives inside the wizard's step 2. Typing an unknown route (`#/devices`, `#/catalog`)
silently dumps me back on the dashboard with no 404 or message.

## Issues table

| Issue | Where | Severity | Why it matters to a clinician |
|---|---|---|---|
| "Simulate complete (demo)" took ~34s with only a static "Running…" label — no spinner/progress/time estimate; looked hung | Active plan detail (`35b-completed.png`, `35c-state.png`) | High | In a live demo or in clinic I'd assume it crashed and click again or walk away. Needs a progress indicator and a sub-20s target. |
| "How far back" range uses a two-box numeric stepper where the first box is locked at "1" (disabled − and +) and the second is an empty "–" placeholder; it's unclear I must set the upper bound before the slot/Next unlocks | Test design, slot 3 (`16-slot3.png`, `19-slot3-filled.png`) | Med | I stalled here. A busy clinician expects "look back N days" as one simple control, or a clearly-labeled "from X to Y days" with sensible defaults already filled. |
| Dashboard "Needs attention" rail and some tables truncate plan titles aggressively ("Does short …", "Evening vs …") | Overview (`03-after-login.png`) | Med | Two of my sleep plans look identical; I can't tell them apart without opening each. |
| Personal risk model tab exposes raw feature names (`sleep_min_lag2`, `sleep_min_lag3`) and stats jargon ("L2 logistic regression · AUC 0.91") | Results → Personal risk model (`38-riskmodel.png`) | Med | I'm not a data scientist. Label these "Sleep 2 nights before," etc., and translate AUC into "how often it's right." |
| Validation page leaks developer labels: "Fixture · results_observational_null", "SYN-NULL", "Clinician view / Patient view" chips | Validation (`41-validation-full.png`) | Low | Feels like a test harness, not a clinician feature. Fine internally; confusing if shown to a physician. |
| Unknown routes silently redirect to dashboard; no device-catalog page outside the wizard | Routing (`#/devices` etc.) | Low | Minor; I'd expect either a catalog link or a "page not found." |
| "no data yet" gray-out reason doesn't say why (never synced? outside window?) | Signals / Test design (`10-test-design.png`) | Low | I can't tell if asking the patient to sync would unlock it. |
| Shared demo state is volatile: a plan that showed "Complete / Likely real" reverted to "Active" between sessions | Plans list / detail | Low (demo-only) | Not a clinician-facing bug, but risky for a live pitch — results can disappear mid-demo. |

Note: a stray "4.3h" value shows up in the raw page text on the New-plan screens, but it is an
off-screen measurement element (positioned at y≈−20000) and is NOT visible to users. Benign.

## Top 5 fixes first

1. **Make "Simulate complete" feel alive and fast.** Add a progress/spinner with a short message
   ("Running 2,000 shuffles… ~10s"), disable re-clicks, and cut the 34s wait. This is the moment
   the demo either lands or dies.
2. **Simplify the "How far back" control.** Prefill a sensible default range (e.g. 1–3 days),
   make it obvious the slot is complete, and label it in plain words. It was the only place I
   actually got stuck building the plan.
3. **Stop truncating plan titles** in the dashboard rail and tables, or show patient + signal so
   near-identical plans are distinguishable.
4. **De-jargon the Personal risk model tab:** human-readable feature labels and a plain-English
   gloss for AUC; keep "Exploratory, not validated" — that disclaimer is good.
5. **Clean the Validation page for clinician eyes** (hide fixture/SYN codes) or clearly mark it as
   an internal/QA view.

## Trust & clarity of the statistics

This is where the product shines and where I'd actually hand over my trust:

- **The "Chance check" histogram** (`37-chancecheck.png`) is the single best element. Seeing my
  patient's real −14.2% marked far out past a pile of 2,000 random shuffles made the permutation
  test intuitive without a single formula. "<0.1% of shuffles were at least this strong" is a
  sentence I can repeat to a patient.
- **Honest guardrails are everywhere:** multiple-lag correction is disclosed ("p-values are
  corrected for testing several lags"), missing-data days are flagged, episode count is shown, and
  "Not diagnostic — worth discussing" appears on every screen. The tool also correctly returns
  "Probably chance" on a null patient (`42-probably-chance.png`) — that it can say *no* is what
  convinces me it's not just a hype machine.
- **What dented trust / clarity:** (a) the Personal risk model's raw variable names and "AUC 0.91"
  read like a Kaggle notebook, not a clinical tool — I half-distrusted that tab simply because I
  couldn't parse it; (b) the 34-second silent "Running…" made me briefly think the analysis had
  failed, which is a trust problem even though the eventual output was fine; (c) the pass vs. chance
  badges differ only by green vs. gray — a slightly stronger visual cue (icon/word weighting) would
  help me not misread a "probably chance" as a pass when skimming.

Bottom line: the core clinician journey (build → consent summary → send → read an honest verdict)
is genuinely good and the statistics are communicated better than most clinical tools I've seen.
Fix the slow simulate button and the "how far back" control and I'd be comfortable demoing this.
