# N1 Hub — Synthetic Demo Dataset

Seven synthetic patients, 120 days each (2026-06-01 → 2026-09-28), each built to showcase a
different capability of the per-patient testing suite. Every planted effect is recorded in
`ground_truth.json`, and `validate.py` (a reference implementation of the CONTRACT stats)
confirms each demo plan returns its intended verdict.

Put this folder at `backend/data/synthetic/` and have the backend load it at startup
instead of generating synthetic data itself.

## Files
| File | What |
|---|---|
| `daily/<ID>.csv` | one row per day: `date, sleep_min, resting_hr, hrv, steps, skin_temp_dev, resp_rate, spo2, systolic_bp, glucose_tir, walking_speed, episode` (blank = not tracked/missing) |
| `all_daily.csv` | all patients stacked with `patient_id` |
| `patients.json` | patient metadata (CONTRACT `/api/patients` fields + `display_name`, `condition`, `story`, `signals_present`) |
| `devices.json` | device catalog incl. future-facing devices (`availability: now | emerging`) |
| `demo_plans.json` | one ready-made plan per patient, **with the exact randomized schedules the data was generated from**; seed the store with these |
| `ground_truth.json` | what was planted and the verdict each plan should produce |
| `generate.py` / `validate.py` | regenerate (`python generate.py --out synthetic_out`) / verify (`python validate.py`) |

## The patients
| ID | Who | Devices | Test | Expected | Shows off |
|---|---|---|---|---|---|
| P01-MARIA | 68, migraine | iPhone + Fitbit | Does short sleep precede migraines? | **likely_real**, lag 2 | Core observational test, lag scan, older adult with poor recall |
| P02-JAMES | 54, headaches | iPhone + Apple Watch | Same question | **probably_chance** | The tool can say NO |
| P03-AISHA | 41, insomnia | iPhone + Apple Watch | Melatonin A/B, 12 randomized periods | **likely_real** (+46 min) | n-of-1 trial w/ AB/BA blocks + washout (Lillie et al. 2011) |
| P04-ROBERT | 72, hypertension | iPhone + cuffless BP | Evening vs morning dosing | **probably_chance** | A treatment change that doesn't help, caught; emerging sensor |
| P05-DANA | 35, type 2 diabetes | iPhone + Fitbit + CGM | Post-dinner walk A/B on glucose time-in-range | **likely_real** (+10 pts) | Multi-device fusion; steps confirm adherence |
| P06-LEO | 29, bipolar II | iPhone + smart ring | Does reduced sleep precede hypomania? | **likely_real**, lag 1–2 | Early-warning lag profile; patient-controlled consent |
| P07-GRACE | 80, fall risk | iPhone only | Does slower walking precede near-falls? | **not_enough_data** (3 events) | Sufficiency check; device selector grays out sleep/HR; equity |

Bonus live-demo hypotheses (verified): Maria `hrv/lower` → likely_real; Maria `steps/lower` →
probably_chance (steps drop ON migraine days, not before: a symptom, not a warning sign);
Leo `steps/higher` → likely_real (lag 3); `resting_hr` on anyone → probably_chance.

## Realism
Weekly rhythm (weekend sleep +25 min, steps −1500), day-to-day carryover (AR(1) noise),
realistic night-to-night sleep variability (SD ≈ 38 min), ~4% of days unworn plus scattered
sensor dropouts (missing = blank, never 0). Not real people.

## Two findings the backend MUST implement (and that make great pitch points)

1. **Intervention plans need ≥ 10 periods (5 AB/BA blocks).** With k blocks there are only
   2^k possible randomized schedules, so the smallest achievable p-value is 1/2^k.
   8 periods → min p = 0.0625 → can *never* reach p < 0.05. Demo plans use 12 periods
   (6 days + 2 washout). Enumerate all 2^k schedules exactly (see `validate.py`).
   Suggested contract change: `not_enough_data` (with warning `too_few_periods`) if fewer
   than 5 blocks.
2. **Power depends on the patient's own variability.** With SD ≈ 38 min sleep, a 12-period
   trial detects a +45 min effect ~85% of the time but a +34 min effect only ~62%.
   Feature idea (high value, small build): show a **"minimum detectable effect"** on the
   plan-creation screen, estimated from the patient's baseline variability, so the
   clinician knows if the test is long enough *before* starting. Real n-of-1 design practice.

## Contract addendum needed (v1.1, additive)
New signals: `skin_temp_dev` (°C vs personal baseline), `resp_rate` (breaths/min),
`spo2` (%), `systolic_bp` (mmHg), `glucose_tir` (% time in range 70–180 mg/dL),
`walking_speed` (m/s). New devices: `smart_ring`, `cgm`, `bp_wearable`; device field
`availability: "now" | "emerging"`. Patient fields `display_name`, `condition`, `story`,
`signals_present`. Intervention schedules in demo plans use `period_days: 6`, `n_periods: 12`.
