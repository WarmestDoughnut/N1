# N1 Hub — Shared Project Guide (read this first, every session)

You are one of **two Claude Code instances** building one product in one repo during a
one-day hackathon (HackRx / SacHacks, 7:30am–6:00pm). One instance owns `backend/`, the
other owns `frontend/`. You must build **one** product, not two. This file, `docs/CONTRACT.md`,
and the logs/messages in `docs/` are how you stay in sync.

## 1. What we are building

**N1 Hub: an n-of-1 testing hub for physicians, powered by devices patients already own.**

Physicians already rely on patients' memory to answer "what happened before your last
episode?" or "did the new medication help?" Memory is unreliable, especially for older
patients. N1 Hub lets a clinician turn a clinical hunch into a structured **test plan**
on a single patient's own wearable/phone data, and returns an honest verdict.

Two test types:
1. **Observational** — "Does low sleep precede this patient's episodes?"
   Compares a signal in the days before logged episodes vs. the patient's normal days,
   scans lags (1–3 days), and checks the result against chance with a permutation test.
2. **Intervention (A/B n-of-1 trial)** — "Does melatonin (B) improve sleep vs. none (A)?"
   App generates a randomized block schedule (e.g. A-B-B-A) with optional washout days,
   then compares the outcome signal between A and B periods with a permutation test that
   shuffles period labels.

Translational basis (cite in pitch): Lillie EO, Patay B, Diamant J, Issell B, Topol EJ,
Schork NJ. *The n-of-1 clinical trial: the ultimate strategy for individualizing medicine?*
Personalized Medicine 2011;8(2):161–173. n-of-1 trials use randomization, washout,
crossover and placebo controls on a single patient, but are rarely used in clinical
practice. N1 Hub makes them practical with consumer devices.

Tracks: **Translational Science** and **Health Equity**.
Equity story: trial averages may not apply to groups underrepresented in trials; n-of-1
measures *this* patient's response. Works with phone-only or cheap devices. Reduces
dependence on memory and clinic visits. Patients see their own results.

## 2. Core product rules (do not drift from these)

- **The test plan IS the consent.** Clinician creates a plan (question, devices, signals,
  duration, schedule). Patient reviews a plain-language summary and approves or declines.
  Approval grants access ONLY to the listed signals, ONLY for the plan window.
  Patient can pause or stop any time. Clinician does not actively monitor; they get results.
- **Default decisions (already agreed, don't relitigate):**
  - Stopping early keeps already-collected data for that plan; results are labeled incomplete.
  - Patients see the same verdict as the clinician, in plainer language.
  - No mid-test safety alerts in this build (roadmap only).
- **Honest statistics are the product.** Every result shows: effect size, lag (if
  observational), permutation p-value, number of episodes/periods, and a verdict from:
  `likely_real | suggestive | probably_chance | not_enough_data`.
  The demo MUST show one test that passes and one that correctly says `probably_chance`.
- **Device selector:** the recipe builder only offers signals the patient's selected
  devices provide; unavailable signals are shown grayed out with a reason.
- Not diagnostic. Wording everywhere: "worth discussing with your clinician", never "diagnosis".

## 3. Data

- **PMData** (Fitbit Versa 2, 16 people, ~5 months, CC BY-NC 4.0; cite Thambawita et al.,
  MMSys 2020). Fitbit sleep/HR/steps + daily wellness self-reports (fatigue, mood, stress,
  readiness, soreness). Episodes are derived from wellness reports (backend defines and
  documents the rule in its log + CONTRACT).
- **Synthetic patients** with known ground truth (this is our validation story):
  - `SYN-PATTERN`: sleep drops ~2 days before episodes → observational test must pass.
  - `SYN-NULL`: no relationship → must return `probably_chance`.
  - `SYN-TREAT`: intervention B improves sleep → intervention test must pass.
  - `SYN-TREAT-NULL`: B does nothing → must return `probably_chance`.
- Datasets are historical. The demo "runs" a plan instantly over the dataset window
  (`POST /api/plans/{id}/simulate-complete`). That is expected; label it in the UI as demo mode.

## 4. Architecture

- `backend/` — Python 3.11, FastAPI, pandas, numpy, scikit-learn. Runs on `:8000`.
  In-memory store persisted to `backend/data/store.json`. No DB, no auth.
- `frontend/` — React + Vite + TypeScript, Recharts. Runs on `:5173`.
  API base URL from `VITE_API_URL` (default `http://localhost:8000`).
  A top-bar **role switcher** (Clinician / Patient) replaces auth for the demo.
- `shared/fixtures/` — example JSON responses that exactly match the contract.
  Backend owns them; frontend develops against them until the live API is ready.
- `docs/CONTRACT.md` — THE source of truth for schemas and endpoints.

## 5. Ownership — stay in your lane

| Path | Owner | Other instance may… |
|---|---|---|
| `backend/**` | BACKEND | read only |
| `frontend/**` | FRONTEND | read only |
| `shared/fixtures/**` | BACKEND | read only (request changes via message) |
| `docs/CONTRACT.md` | shared — change only via protocol in §7 | |
| `docs/log/backend.md` | BACKEND appends | read |
| `docs/log/frontend.md` | FRONTEND appends | read |
| `docs/messages/to-frontend.md` | BACKEND appends | FRONTEND reads, marks ACK |
| `docs/messages/to-backend.md` | FRONTEND appends | BACKEND reads, marks ACK |
| `CLAUDE.md`, `prompts/` | humans only | read |

Never edit the other instance's folder or log. Separate files = near-zero merge conflicts.

## 6. Git workflow

- Both work on `main`. Small, frequent commits prefixed `[backend]` or `[frontend]`.
- Before every commit: `git pull --rebase`. After committing: `git push`.
- Before starting any task: `git pull --rebase`, then read the other side's newest log
  entries and any unacknowledged messages addressed to you.
- If a rebase conflicts outside your own folder, stop and tell your human.

## 7. Communication protocol

**Logbook** (`docs/log/<you>.md`) — append an entry after every meaningful chunk of work
(roughly every 30–45 min and before every push that changes behavior):

```
### HH:MM — <short title>
- Done: ...
- Files: ...
- Contract impact: none | proposed (see message #) | implemented vX.Y
- How to try it: <command / URL / curl>
- Next: ...
- Blockers / needs from other side: ...
```

**Messages** (`docs/messages/to-<other>.md`) — append-only, numbered:

```
### #<n> [QUESTION|CHANGE-REQUEST|FYI|BLOCKER] HH:MM — <title>
<body>
Status: OPEN
```
The recipient replies by appending under it: `Reply HH:MM: ...` and setting `Status: ACK`
or `Status: DONE`. Never delete messages.

**Contract changes:** never change a schema or endpoint unilaterally.
1. Proposer posts a CHANGE-REQUEST with the exact diff.
2. Recipient ACKs (or counter-proposes).
3. Proposer updates `docs/CONTRACT.md` (bump version at top), updates `shared/fixtures/`
   if affected, and implements, in one commit. Log it.
Additive optional fields are low-risk but still need an FYI message.

## 8. Sync checkpoints (humans trigger these with `prompts/sync.md`)

| Time | Goal |
|---|---|
| ~09:50 | Contract + fixtures confirmed; both sides scaffolded and running |
| ~11:30 | Frontend renders REAL backend results for observational tests |
| ~13:00 | Intervention mode + plan approval flow working end to end |
| **14:30** | **FEATURE FREEZE.** Bug fixes, polish, backup demo video only |
| ~15:30 | Final review against demo script |

## 9. Priorities and cut list

Must work (never cut): plan create → patient approve → simulate-complete → results screen
showing one pass and one `probably_chance`, for the observational test.

Then, in order: (1) intervention A/B mode with schedule, (2) device selector gray-out,
(3) patient pause/stop + patient results view, (4) personal risk model tab,
(5) Apple Watch live push via iOS Shortcut.
Cut from the bottom if behind. Never start a new item after 14:30.

## 10. Demo script (build toward this)

1. Clinician: new plan for `SYN-PATTERN` → select iPhone only → sleep is grayed out →
   add Fitbit → sleep unlocks → hypothesis "low sleep precedes episodes" → send.
2. Switch to Patient: plain-language summary → Approve.
3. Simulate complete → Clinician results: `likely_real`, lag 2 days, chance check passed.
4. Same plan on `SYN-NULL` → `probably_chance` ("the tool can say no").
5. Intervention plan on `SYN-TREAT`: show randomized A-B-B-A schedule → result.
6. Real PMData participant to show it works on real data.
