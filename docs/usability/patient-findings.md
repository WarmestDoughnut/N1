# N1 Hub — Patient Usability Findings (Maria, 68, migraines)

_Tester: "Maria" persona — a non-technical 68-year-old who gets migraines. Evaluated live at https://n1-lemon.vercel.app on BOTH a phone screen (390×844) and a desktop screen (1440×950). Judged only from what I saw on screen. Screenshots in `/tmp/n1-usability-patient/`._

## Overall impression

Honestly? This was mostly a pleasant surprise. The moment I signed in it said **"Hello, Maria"** in nice big letters and told me one thing was waiting for me. When I opened my doctor's request it explained in plain words what Dr. Rivera wanted to check, and — the part I cared about most — it listed **exactly** what would be shared (my Fitbit sleep and my migraine log) and said in a box "No location, messages, or other health data." That made me feel safe enough to tap Approve. And when the results came back, they weren't a wall of numbers — it said **"A clear pattern"** and "Your sleep was often lower in the 2 days before an episode. Worth discussing with your clinician," with a friendly explanation of why it's probably not just luck. I could actually understand my own result, which almost never happens with medical apps.

But two things would have rattled me in real life. First, I pressed **Pause** on my running test and *nothing happened* — the button just greyed out and the test still said "In progress." For someone who was promised "you can pause any time," pressing pause and seeing nothing is the opposite of feeling in control. Second, on my phone a little bar of icons at the bottom floats on top of the page and covers the bottom of cards — it hid the dates under my sleep chart and cut off a reassuring sentence. Small, but on a phone (which is where I'd actually use this) it made things feel a bit broken.

## Journey notes (per screen)

### 1. Landing + sign in — `mobile-01-landing.png`, `desktop-01-landing.png`
- **Understood:** Clear headline "Turn a clinical hunch into an honest answer," three reassuring bullets ("The test plan is the consent," "Patients choose their care team," "Honest statistics"). Text is large and high-contrast. Good.
- **Confused me:** The "Demo accounts" box defaults to the **Clinicians** tab, and only shows doctors (Dr. Okafor, Dr. Rivera) with "Use" buttons. As a patient I didn't see myself listed until I'd notice the small "Patients" tab. I typed my own email instead, which worked — but a less confident patient might think "this app is only for doctors."
- **Readable?** Yes. The "Show" link for the password is helpful for older eyes.

### 2. Home / my health — `mobile-02-after-signin.png`
- **Understood:** "Needs your review: 1 — Tap to review." Three clear status cards (Needs review / In progress / Results ready). A highlighted card "DR. RIVERA IS ASKING — Does short sleep precede Maria's migraines?" with a big "Review request" button and the reassuring line "Nothing is shared unless you approve." This is exactly what I needed. Felt trustworthy.
- **Hard to read / broken (phone):** A floating search bar + bell sit **on top of** the "Latest result" card, overlapping it. Minor but looks unfinished.

### 3. The doctor's request / consent — `mobile-03-request-list-or-detail.png`
- **Understood everything.** Plain paragraph: "Dr. Rivera wants to check whether shorter sleep tends to come before your migraines. This test uses sleep from your Fitbit and your migraine log. Nothing else is shared. You can pause or stop at any time." Then a section **"Exactly what will be shared"** listing Sleep (from Fitbit), Episode log (you log these), the date window, and crucially **"No location, messages, or other health data."** A "You stay in control" box explains stopping early keeps data and marks results incomplete. **This is the best part of the app.** I felt safe.
- **Broken (phone):** The bottom icon bar overlaps the "Episode log" row — part of the shared-data list is hidden behind it. Since this is the *consent* screen, hiding part of "what's shared" behind a nav bar is not great.

### 4. Approving — `mobile-05-after-log-attempt.png`
- Big green **Approve** and outlined **Decline** buttons, clearly labeled with check/x icons. After approving I got a friendly toast: "Approved. Thank you! You can pause or stop any time." Reassuring. Nothing scary before I agreed.

### 5. While the test runs (control) — `mobile-05`, `desktop-05-after-log-attempt.png`
- **Understood:** "TEST IN PROGRESS," a progress bar, and three clear actions: big **Log an episode**, **Pause**, **Stop test**. A "Sharing right now" list shows Sleep / Episode log / iPhone / Fitbit.
- **Log an episode** works and is lovely: a simple form, "Write it down while you remember. Your clinician won't be alerted," a date picker and optional note. (`mobile-06-log-form.png`, `desktop-05`.)
- **Stop test** works and is reassuring: a confirmation "Stop this test? No new data will be collected. Data already collected for this test is kept, and your results will be marked incomplete." with "Yes, stop / Keep going." (`mobile-13-after-stop.png`.) 
- **Pause is BROKEN / gives no feedback (HIGH).** I clicked Pause and nothing changed: status stayed "In progress," no "Paused" label, no "Resume" button, no toast. The buttons just went faded/disabled. Behind the scenes only a CORS preflight (`OPTIONS .../pause`) fired and no actual save completed. For a patient told "you can pause any time," pressing Pause and seeing nothing happen is confusing and undermines trust. (`mobile-12-after-pause.png`, `desktop-15-right-after-pause.png`.)

### 6. My results — `desktop-09-after-sim-polled.png`, `mobile-09-after-sim-polled.png`, `desktop-11-home.png`
- **Understood it completely, in plain words.** A green badge "A clear pattern," then "Your sleep was often lower in the 2 days before an episode. Worth discussing with your clinician." A chart "What we looked at — Your sleep each day. Red lines are days you had an episode." A "Could this be chance?" section with a donut (">99.9% of shuffles beaten") and a genuinely plain explanation: "We mixed up your data 2,000 times. A pattern this strong showed up less than 0.1% of the time, so it's unlikely to be luck." Footer: "This is not a diagnosis. It's worth discussing with your clinician, who sees the same result." **Excellent — I knew what it found and what to do next.**
- **One scary moment (MED):** The first time, right after I ran the test, the page said **"Finished"** but **"Your results aren't ready yet. Check back soon."** (`desktop-08-results.png`). It turned out to be a brief timing lag — reloading showed the full result — but for a few seconds I thought my test had finished with nothing to show. A patient would worry they'd done something wrong. It needs a loading/"calculating your result" state instead of a dead-end "not ready" message once a test is already Finished.
- **Readable (phone):** Big verdict text, clear chart. BUT the floating bottom icon bar covers the bottom of the chart card — the date labels under the chart (Jun 1, Jul 1 …) are hidden behind it.

### 7. Care team — `mobile-14-care-team.png`
- Clear and reassuring: "My clinicians — Only clinicians you add can send you test plans. You can remove anyone, any time." Each doctor has a "Remove" button. "Add a clinician" with a code field, and "Adding a clinician shares nothing yet — They can only see data from a test plan you approve…" Good.
- **Minor (phone):** Doctor specialties are truncated ("Internal medicine · c…", "Neurology · connect…") and the reassurance note at the bottom is partly hidden behind the nav bar.

## Issues table

| Issue | Where | Severity | Why it matters to a patient like me |
|---|---|---|---|
| **Pause does nothing / no feedback** (only a CORS preflight fires; status stays "In progress," no Paused state, no Resume, buttons just grey out) | In-progress test screen, phone + desktop | **High** | I was promised "you can pause any time." Pressing Pause and seeing nothing makes me feel I'm NOT in control — the opposite of the app's core promise, and worrying about my data still being collected. |
| **"Finished" but "results aren't ready yet" dead-end** right after a test completes (brief; fixed by reload) | Results screen, both | **Med** | For a few seconds I think my test ended with no answer. I don't know to reload. I'd fear I did it wrong. Needs a "calculating your result…" spinner instead. |
| **Floating bottom nav bar overlaps card content on phone** — hides the consent list ("Episode log"), chart date labels, and care-team reassurance text | Multiple screens, phone only | **Med** | On a phone (where I'd actually use this), content I need — including part of "what's shared" on the consent page — is covered. Looks broken and hides important info. |
| **Floating search bar overlaps the "Latest result" card** on the home page | Home, phone | **Low** | Looks unfinished; momentarily confusing. |
| **Sign-in defaults to "Clinicians" tab; patients aren't visible unless you switch tabs** | Landing/sign-in | **Low** | A nervous patient could think "this app isn't for me." Typing my own email still works, so low severity. |
| **Truncated text on phone** (doctor specialty "…", "connect…") | Care team, phone | **Low** | Slightly sloppy; I can't read the full detail, but not critical. |

## Top 5 fixes first

1. **Fix Pause.** Make the pause action actually complete and show a clear "Paused — your data isn't being collected" state with a "Resume" button (and a toast). This directly backs the app's "you're in control" promise. (High)
2. **Replace the "results aren't ready yet" dead-end** with a visible "Calculating your result…" loading state that auto-updates to the result, so a finished test never looks empty. (Med)
3. **Stop the bottom nav bar from covering card content on phones** — add bottom padding so the consent list, chart x-axis labels, and care-team note are never hidden behind it. (Med)
4. **Keep the home-page search bar from overlapping the "Latest result" card** on mobile. (Low)
5. **Make the patient path obvious on sign-in** — either default-show the "Patients" tab for patients, or add a clear "I'm a patient" hint, so a patient doesn't think the app is doctors-only. (Low)

## Trust & clarity

- **Did I feel safe about my data?** Yes — very much so. The consent screen was the strongest part: it spelled out exactly what's shared (Fitbit sleep + my migraine log), the exact dates, and explicitly said "No location, messages, or other health data." "You stay in control" and the care-team page ("remove anyone, any time," "adding a clinician shares nothing yet") all reinforced it. The one dent in that trust is that **Pause didn't work** — being told I can pause and then having it do nothing makes me quietly worry about whether the "stop sharing" controls really work.
- **Did I understand my result?** Completely. "A clear pattern," "Your sleep was often lower in the 2 days before an episode. Worth discussing with your clinician," and the plain "we mixed up your data 2,000 times… unlikely to be luck" explanation are exactly right for me — no jargon, no p-values thrown in my face, and it correctly told me to talk to my doctor rather than treating it as a diagnosis. This is the app at its best.

**Verdict:** A genuinely patient-friendly design with excellent consent and plain-language results. Fix the broken Pause and the "results not ready" dead-end, and tidy the phone layout so the bottom bar stops covering content, and I'd trust this.
