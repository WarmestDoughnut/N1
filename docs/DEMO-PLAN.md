# N1 Hub demo plan: one doctor, one patient (Dr. Rivera + Maria)

> **Superseded:** the official demo is the backend's `docs/demo-script-sam.md` (Sam + Dr. Rivera). This Maria version is a backup only.

**App:** https://n1-lemon.vercel.app · every demo password is `demo`
**Doctor:** Dr. Rivera, `rivera@n1hub.demo` (internal medicine)
**Patient:** Maria, 68, migraines, iPhone + Fitbit, `maria@n1hub.demo`
**Length:** about 6 minutes. Use two browser windows side by side, one signed in as each person, so you don't have to keep signing out.

The numbers below come from running these exact tests on today's backend (private copy, not production):

| Test (Maria, all past data, look-back 1–3 days) | Verdict | Effect | Chance check |
|---|---|---|---|
| Sleep **lower** before migraines | **Likely real**, lag 2 days | sleep 14% lower | stronger than all 2,000 shuffles (p = 0.0005) |
| Heart-rate variability (HRV) **lower** before migraines | **Likely real**, lag 2 days | HRV 12% lower | stronger than all 2,000 shuffles |
| Steps **lower** before migraines | **Probably chance** | −2.7% | p = 0.60 |
| Resting heart rate **higher** before migraines | **Probably chance** | −0.7% | p = 0.87 |

Steps is the honest "no": Maria walks less **on** migraine days, not **before** them. That makes it a symptom, not a warning sign, and the tool correctly says chance.

---

## 0. Before the judges arrive (1 min)
1. Sign in as Dr. Rivera and click **Reset demo** (sidebar card), then confirm. This restores the seed data on the shared production backend, so do it only once, right before the demo.
2. Window A: Dr. Rivera. Window B: Maria.
3. Check that the top bar says **Live API** (not "Sample data").

## 1. The problem (20 s, talking only)
"Doctors ask 'what happened before your last migraine?' and rely on memory. Maria is 68. Her phone and Fitbit already recorded the answer. N1 Hub turns a doctor's hunch into a structured test on *her own* data and gives an honest verdict."

## 2. Doctor builds the test, and the plan is the consent (90 s), window A
1. **Patients** → **Maria** → the **New** tab (the wizard).
2. **Devices:** select **iPhone only** → **Next**. Point out that **Sleep is grayed out** with a reason: an iPhone alone doesn't measure sleep. *Equity point: the tool only offers what the patient's own devices can measure.*
3. **Back** → add **Fitbit** → **Next**. Sleep unlocks.
4. Test type: **pattern test** (observational). Fill the slots:
   - What we're explaining: **Migraine** (Maria's own symptom).
   - **What might come first:** Sleep, **lower** → Done.
   - **How far back:** 1 to 3 days → Done. ("We scan lags, because a trigger usually comes before the episode.")
   - **Over what dates:** **All past data** → Done.
5. **Next** → **Send to patient for approval**.

## 3. Patient approves exactly what is shared (40 s), window B
1. Maria → **My tests** → the new test. Read the plain-language summary aloud: "uses sleep from your Fitbit and your migraine log. Nothing else is shared. You can pause or stop at any time."
2. **Approve**. It runs immediately on past data (progress messages, about 15–30 s).
3. Point out: **Maria sees "your results are being reviewed by your clinician"**, not the verdict. The doctor looks first.

## 4. The honest result (60 s), window A
1. Refresh the test → **Likely real · lag 2 days · sleep 14% lower**.
2. Chance check: "**Stronger than all 2,000 shuffles.**" We moved her migraine dates around at random 2,000 times, and no shuffle produced a pattern this strong.
3. Show the lag chart (2 days before stands out) and the episode count.
4. In **Your review**, add a comment ("Let's aim for 7 hours before busy days"), then **Share results with patient**.
5. Window B: Maria now sees the same verdict in plainer language, plus the comment. *"Patients see their own results."*

## 5. The tool can say no (60 s), window A then B
1. **New** test for Maria, same steps, but **Steps, lower**, All past data → Send.
2. Maria approves.
3. Doctor: **Probably chance** (p ≈ 0.60). "Maria does walk less, but *on* migraine days, not before. It's a symptom, not a trigger, and the tool doesn't overclaim."
4. Optional, for a second "real" signal: **HRV lower** → likely real, lag 2, which matches the sleep finding.

## 6. Everything she has shared, in one place (40 s), window A
1. Maria's workspace → **Data & graphs**. Only data Maria approved appears (the plan is the consent).
2. Overlay **Sleep** and **HRV**, pick a date range, and show the summary-statistics table and the X-vs-Y trend line.
3. Optional: the **personal risk model** panel on Maria's completed sleep test ("how well her own data predicts tomorrow's risk"), and the physician **assistant** widget ("Summarize Maria's results").

## 7. The next step is a real n-of-1 trial (40 s), window A
1. **New** → **A/B trial** for Maria: "Magnesium (B) vs none (A)", outcome Sleep, higher is better.
2. Paint the calendar: 12 periods of 6 days with washout, then **Randomize for me**. Point at the evidence meter: "with 6 AB/BA blocks the best possible p is 1/64. Fewer than 5 blocks can never reach significance, so the app warns." (Lillie et al., *Personalized Medicine* 2011.)
3. Send it. In window B, Maria approves. It's future-only, so it starts collecting tomorrow. A finished A/B result is shown on **Aisha's** completed trial if a judge asks (likely real, +46 min of sleep).

## 8. Patient control + close (30 s), window B
1. Maria → **Symptoms and conditions** → **Log** a migraine today. The confirmation says it's "Also counted in" her running test(s).
2. Show **Pause / Stop** on a running test: stopping keeps the data already collected, and the result is labeled incomplete.
3. Close: "One patient, her own devices, an honest answer, and she controls every signal. Not diagnostic: results are worth discussing with your clinician. Includes real data from PMData (CC BY-NC)."

---

### If something goes wrong
- A result is still calculating → wait 10 s and refresh. Past-data tests take 15–30 s on the live API.
- The top bar says **Offline · sample data** → the backend is waking up; click **Try live API** in the sidebar.
- Need a finished result instantly → open Maria's pre-completed sleep test in her **Tests** tab (likely real, lag 2).

### Lines judges like
- "With 8 periods an A/B trial can *never* reach p < 0.05: there are only 16 possible orders. We enforce at least 10."
- "Every verdict shows effect size, lag, p-value, episode count, and one of four honest labels, including *not enough data*."
- "Works with a phone alone, so you don't need an expensive device to get an answer."
