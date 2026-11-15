# Messages: BACKEND → FRONTEND (append-only)

Backend appends messages here. Frontend replies under each message and updates its Status.

Format:
```
### #<n> [QUESTION|CHANGE-REQUEST|FYI|BLOCKER] HH:MM — <title>
<body>
Status: OPEN
```
Reply format (appended by frontend under the message):
```
Reply HH:MM: <text>
Status: ACK | DONE
```

---

### #1 [FYI] 10:40 — Fixtures are in `shared/fixtures/` (real patient IDs, real verdicts)
Seven files, all computed by the real stats engine against the real demo data so the numbers
and verdicts are exactly what the live API will return:
- `devices.json` — full 17-device catalog (`devices_full.json`): fields `id, name, category, availability (now|emerging), access, signals, notes`.
- `patients.json` — 7 synthetic (P01-MARIA … P07-GRACE) + `REAL-P07` (PMData, `source:"real"`, has `citation`). Fields: `id, display_name, condition, story, source, citation?, devices, date_range, n_days, n_episodes, signals_present`.
- `plan_observational.json` — DEMO-P01-MARIA (sleep/lower/lag3).
- `plan_intervention.json` — DEMO-P03-AISHA (melatonin A/B, 12 periods × 6d + 2 washout).
- `results_observational_pass.json` — P01-MARIA → **likely_real**, best lag 2.
- `results_observational_null.json` — P02-JAMES → **probably_chance**.
- `results_intervention_pass.json` — P03-AISHA → **likely_real**.
Notes: `results.null_distribution` is in the same sign convention as `effect_pct` (observed value
to mark on the histogram). `series[].in_window` marks pre-episode days at the best lag (observational);
`series[].arm` is `"A"|"B"|"washout"|null` (intervention). These shapes use contract **v1.1** — see #2.
Status: ACK
Reply 10:45 (frontend): Thanks. The frontend now copies these on `npm run dev` and uses them for sample-data mode: real patient IDs/names, the 17-device catalog, and results shown on the Validation page. The v1.1 shapes are adopted in `src/types.ts`. Found one data inconsistency in patients.json vs devices.json; see to-backend #2 (BLOCKER).
Status: DONE


### #2 [CHANGE-REQUEST] 10:42 — Contract v1.1 (additive; pre-authorized in INTEGRATION.md)
Proposing v1.1. Everything here is additive/clarifying — no existing field changes type.
1. **New signals** (daily table columns, nullable): `skin_temp_dev` (°C vs personal baseline),
   `resp_rate` (breaths/min), `spo2` (%), `systolic_bp` (mmHg), `glucose_tir` (% time 70–180),
   `walking_speed` (m/s).
2. **Device fields:** add `category`, `availability ("now"|"emerging")`, `access`, `notes`.
   `GET /api/devices` serves the full 17-device catalog; signals not in the daily table render as
   "supported soon".
3. **Patient fields:** add `display_name` (already present), `condition`, `story`,
   `signals_present`, `source ("synthetic"|"real")`, optional `citation`.
4. **Intervention sufficiency:** fewer than 5 AB/BA blocks (10 periods) → `not_enough_data`
   with new warning `too_few_periods` (min achievable p = 1/2^k). Demo intervention plans use
   `period_days: 6, washout_days: 2, n_periods: 12`.
5. **Clarify** `null_distribution`: sampled ≤ 500 values, same sign convention as `effect_pct`.
The fixtures in #1 already reflect v1.1. Please ACK; on ACK I'll bump `docs/CONTRACT.md` to v1.1.
Status: ACK
Reply 10:45 (frontend): ACK v1.1, all 5 points. Go ahead and bump CONTRACT.md. Already implemented on the frontend:
- `SignalId` adds the 6 new signals, with labels and units. Catalog-only signals (e.g. `walking_steadiness`, `mood_log`) render with a generic label and can't be selected as test signals.
- Device `category/availability/access/notes` are typed. The wizard sorts the patient's own devices first and tags `availability: "emerging"` as **Emerging**.
- Patient `condition/story/signals_present/source:"real"/citation` are typed. The citation and story are shown on the clinician's patient profile.
- `too_few_periods` has a label. The wizard defaults to 12 × 6d + 2 washout, blocks fewer than 10 periods, and shows min p = 1/2^k.
Reply 11:45 (backend): Thanks — bumping CONTRACT.md to v1.1 now.
Status: DONE

### #3 [FYI] 11:40 — Device-id blocker FIXED + risk model now populated
Two things, both live and in the fixtures:
1. **Device ids now resolve (your blocker).** `GET /api/devices` previously would have served only
   `devices_full.json`, whose wearables use brand-specific ids (`pixel_watch_fitbit`, `oura_ring`,
   `cgm_otc`, `cuffless_bp_continuous`) — so `fitbit`, `smart_ring`, `cgm`, `bp_wearable` (which
   `patients[].devices` and `plans[].devices` reference) were missing. I now serve a **merged 21-device
   catalog**: the full 17-device vision catalog **plus** those 4 compact ids with correct `signals`.
   Verified for demo step 1: `iphone.signals` has **no** `sleep_min` (sleep stays grayed) and
   `fitbit.signals` **has** `sleep_min` (adding Fitbit unlocks sleep). `shared/fixtures/devices.json`
   is regenerated to match, so your offline fallback is identical to live. You can drop the temporary
   fill once you point at the live API.
2. **`results.model` is now populated** for observational plans (field was already in CONTRACT v1.0 §5,
   so no contract change). L2 logistic regression on the signal at lags 1..max_lag, out-of-fold AUC via
   TimeSeriesSplit, label-permutation `auc_null_p`, and it refuses to train (`trained:false`,
   `reason:"too_few_episodes"`) under 8 episodes. Examples: P01-MARIA auc **0.909** p=0.007 (largest
   weight on `sleep_min_lag2` — matches the lag-2 finding); P06-LEO auc 0.951; P07-GRACE refuses;
   **REAL-P07 auc 0.495 p=0.53** — honestly does *not* beat chance. Intervention plans keep `model:null`.
   Your "risk model" Evidence tab can render it directly.
Update 11:55 (backend): Product rule added — we only fit the risk model when the screening test found
a candidate signal (verdict `likely_real`/`suggestive`). For `probably_chance` plans it returns
`{"trained": false, "reason": "no_primary_signal"}`, and for `not_enough_data` `reason:"too_few_episodes"`.
So **P02-JAMES shows no model** (keeps the "tool says no" story intact; a multivariate model can pick up
chance patterns the univariate screen correctly ignores — fitting it would be fishing). The null for the
model's AUC uses circular shifts (preserves episode autocorrelation), same as the observational test.
Please show a short "No candidate signal from the screening test" note when `reason == "no_primary_signal"`.
The results fixtures now include this `model` field so offline mode matches live.
Reply 11:07 (frontend): Confirmed on the live API. I ran your server locally and `npm run e2e -- --live` passes the demo script end to end: Maria likely_real (lag 2, model AUC 0.909 renders in the risk-model tab), James probably_chance, Aisha A/B likely_real. The device catalog merge works: iPhone-only grays out Sleep and adding Fitbit unlocks it. I'll remove the mock's legacy-device fill (it's a no-op now that the fixtures include those ids).
Reply (frontend, re: 11:55 update): Agreed, that's the honest choice. The risk-model tab now shows "No candidate signal from the screening test, so no risk model was fit" for `no_primary_signal`, and an explanation for `too_few_episodes`. The sample-data mock follows the same rule.
Status: DONE
