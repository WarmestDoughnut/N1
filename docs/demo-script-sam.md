# N1 Hub — 4-minute live demo script (Sam + Dr. Rivera)

**Two people, two laptops.** Physician laptop = **Dr. Rivera**. Patient laptop/phone = **Sam**.
One physician, one patient, start to finish.

## The patient and the story
- **Sam (P08-SAM)** — 17, migraines, **iPhone only** (equity: a teen with just a phone, still gets a real answer).
- Data: 2026-06-01 → 2026-09-28, **12 migraine episodes** logged. All historical ⇒ the live test runs on **past data**.
- **The arc:** a completed test already says *total* screen time is **probably chance** (the tool doesn't oversell) →
  live, we ask the sharper question — *late-night* screen use — and it comes back **likely real** with a
  personal predictive model. "It's not screens in general; it's screens at 1 a.m."

## Logins
- Physician: `rivera@n1hub.demo` / `demo`
- Patient: `sam@n1hub.demo` / `demo`

## Pre-demo setup (off-stage, ~30s)
1. Physician: **Reset demo** (sidebar Demo card, or `POST /api/demo/reset`). Gives the pristine seeded state.
2. Both log in (physician as Rivera, patient as Sam).
3. *(Optional, cleaner board)* On Sam's workspace, **decline** the pre-seeded pending "late-night screen" draft
   request — we recreate it live. (It has no results, so it's not a spoiler if you skip this.)

---

## The 4 minutes

### Act 1 — "The tool is honest" (~40s, physician)
- Open **Patients → Sam**. Point out: phone-only, 12 logged migraines.
- Open the completed test already there: **"Does more total screen time precede Sam's migraines?" →
  `probably_chance`**. Show the chance check (the pattern shows up routinely in random shuffles) and the
  note *"No candidate signal from the screening test."*
- **Line:** "Sam's been logging migraines. The obvious guess — screen time overall — the tool says is
  probably just chance. It won't tell you something's there when it isn't."

### Act 2 — "Ask the sharper question, on past data" (~70s, physician)
- **New test plan → Sam.**
- Devices: **iPhone only** → note **Sleep is greyed out** ("needs a wearable") — the equity point, live.
- Signal: **Late-night screen time** (`late_screen_min`). Symptom: **Migraine**. Direction: **higher**
  (more late-night screen before episodes). Look-back: 1–3 days.
  - *(Optional flourish)* Click the **AI copilot** and type *"Set up a test for whether late-night screen use
    precedes Sam's migraines."* It fills the signal, direction, and symptom for you — then "Use this draft."
- Data window: choose **past data — as far back as Sam has data** (2026-06-01 → 2026-09-28).
  Note the banner: *past-only request → no collection period; Sam's history is shared on approval.*
- **Review → Send to Sam.**
- **Line:** "Because her history already exists, we don't wait weeks — we analyze the past right now."

### Act 3 — "The patient consents" (~40s, patient)
- On Sam's screen: the plain-language request appears — *"Dr. Rivera would like to look at your late-night
  screen use in the days before your migraines, using your iPhone, from Jun 1 to Sep 28. Nothing else is
  shared. You can stop any time."*
- Sam taps **Approve**.
- **Line (patient):** "I can see exactly what's shared and nothing more — and because it's my past data,
  it's just… sent. No tracking period."

### Act 4 — "A real indicator + a personal model" (~60s, physician)
- Back on Rivera's laptop, open Sam's result: **`likely_real`**, strongest at **lag 1 day**, large effect,
  **chance check passed** ("stronger than all 2,000 shuffles" — the histogram matches the p-value).
- Open the **Personal risk model** tab: **AUC ≈ 0.91**, late-night screen the top driver — an early-warning
  indicator, framed as exploratory, "not validated for clinical use."
- Click **Share results with patient** (clinician reviews first, then releases).
- **Line:** "Not screens in general — screens *late at night*, one day before. And here's a personal model
  that could flag a high-risk night in advance."

### Act 5 — "The patient sees it, in plain words" (~30s, patient)
- Sam's screen updates: *"Your late-night screen use tends to rise in the day before your migraines.
  This isn't a diagnosis — it's worth discussing with your clinician, who sees the same result."*
- **Line (patient):** "I get the same finding, in language I understand."

### Close (~20s, physician)
- **Line:** "One physician, one patient, their own phone, their own history — a specific, testable,
  honest answer. That's n-of-1: the test *is* the consent, and the patient only ever shares what the
  test needs." *(Optional: open **Data & graphs** to show only Sam's shared signals — consent-scoped.)*

---

## Why each beat lands (backed by the data)
| Beat | What the engine actually returns |
|---|---|
| Pre-existing honest negative | total `screen_time_min` → migraine: **probably_chance**, p≈0.63, no model |
| Live reveal | `late_screen_min` → migraine: **likely_real**, p≈0.0005, lag 1, effect +145%, **model AUC 0.909 (strong)** |
| Past-data flow | window 2026-06-01→09-28 is fully historical ⇒ **retrospective**: shared on approval, no collection period |
| Equity | Sam is iPhone-only; sleep signals grey out, yet a phone-only signal yields a real indicator |

## Fallbacks if something's off
- Review gate not yet live on the deployed frontend → Sam may see the result immediately after approval
  (skip the "Share results" beat; the flow still works).
- If the live test somehow doesn't show the model tab, it still shows `likely_real` + chance check — lead with that.
