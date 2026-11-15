# Backend integration guide: N1 Hub demo data

Unzip so this folder is at `backend/data/synthetic/`. Everything below is for the BACKEND instance.

## What's here
| File | Use |
|---|---|
| `daily/P01-MARIA.csv` … `daily/P07-GRACE.csv` | 7 synthetic patients, 120 days each (2026-06-01 → 2026-09-28) |
| `daily/REAL-*.csv` (added by a human) | Real PMData participant built with `pmdata_pick.py` |
| `all_daily.csv` | All synthetic patients stacked (`patient_id` column) |
| `patients.json` | Patient metadata for `GET /api/patients` |
| `devices.json` | Compact device catalog used by the synthetic patients |
| `devices_full.json` | Full 17-device catalog (now + emerging) for the device selector |
| `demo_plans.json` | One ready-made plan per patient, with the EXACT schedules the data was generated from |
| `ground_truth.json` | Planted effects + expected verdict per plan |
| `validate.py` | Reference implementation of the contract stats (port this into `app/stats.py`) |
| `generate.py` | Regenerates the synthetic data (don't change seeds; verdicts are validated) |
| `pmdata_pick.py` | Ranks PMData participants and converts one into our daily format |
| `README.md` | Patient descriptions, realism notes, design findings |

Daily CSV columns (blank = not tracked or missing, never 0):
`date, sleep_min, resting_hr, hrv, steps, skin_temp_dev, resp_rate, spo2, systolic_bp, glucose_tir, walking_speed, episode`

## Integration steps (in order)

1. **Loader (`app/data_loader.py`)**: at startup, read every `daily/*.csv` into the daily table
   keyed by patient id (file stem). Read `patients.json` for metadata. For any `REAL-*.csv`
   without a patients.json entry, synthesize metadata: `source: "real"`, `display_name: "PMData participant"`,
   `condition: "Low-readiness days (self-reported)"`, `devices: ["fitbit"]`,
   `citation: "Thambawita et al., PMData, MMSys 2020 (CC BY-NC 4.0)"`. Delete or ignore your own
   synthetic generator; this data replaces it.

2. **Devices**: `GET /api/devices` serves `devices_full.json`. Each entry has `id, name, category,
   availability ("now"|"emerging"), access, signals, notes`. Signals that aren't in the daily table
   are fine to list; the frontend shows them as "supported soon".

3. **Seed plans**: on startup, if the store is empty, insert every plan from `demo_plans.json`
   unchanged (status `pending_approval`). Do NOT regenerate their schedules; the synthetic effects
   are aligned to those exact dates. Add `created_at` and `history` if missing.

4. **Stats (`app/stats.py`)**: port `validate.py`:
   - Observational: pre-episode window vs baseline per lag; null = circular shifts of the episode
     series; max-statistic correction across lags; `effect_pct`, `p_value`, `best_lag_days`.
   - Intervention: compare period means A vs B; null = re-randomize within AB/BA blocks;
     **enumerate all 2^k schedules exactly when k ≤ 12**, else Monte Carlo.
   - Verdict rules from CONTRACT §5.
   - Also return `null_distribution` (sample ≤ 500 values) and `series` as the contract specifies.

5. **Test (`backend/tests/test_ground_truth.py`)**: copy the provided test file; it must pass before
   announcing results are live. Run with `pytest -q`.

6. **Contract v1.1 (post a CHANGE-REQUEST to frontend, then update CONTRACT.md):**
   - New signals: `skin_temp_dev` (°C vs personal baseline), `resp_rate` (breaths/min),
     `spo2` (%), `systolic_bp` (mmHg), `glucose_tir` (% time 70–180 mg/dL), `walking_speed` (m/s).
   - Device fields: `category`, `availability`, `access`, `notes`.
   - Patient fields: `display_name`, `condition`, `story`, `signals_present`, `source` (`synthetic|real`), optional `citation`.
   - Intervention sufficiency: fewer than 5 AB/BA blocks (10 periods) → `not_enough_data` with
     warning `too_few_periods`. Reason: with k blocks the smallest possible p-value is 1/2^k,
     so 8 periods can never reach p < 0.05.
   - Demo intervention plans use `period_days: 6, washout_days: 2, n_periods: 12`.

7. **Optional, high value if time allows: minimum detectable effect.** `GET /api/plans/preview-power`
   (or a field on schedule preview) estimating the smallest effect the plan can detect, from
   the patient's baseline SD of the outcome signal: simulate the planned schedule ~200 times with an
   added effect and find the size detected ≥ 80% of the time. Pitch line: "the platform tells the
   clinician whether the test is long enough before it starts."

## Expected verdicts (from ground_truth.json)
| Plan | Expected |
|---|---|
| DEMO-P01-MARIA | likely_real (best lag 2) |
| DEMO-P02-JAMES | probably_chance |
| DEMO-P03-AISHA | likely_real |
| DEMO-P04-ROBERT | probably_chance |
| DEMO-P05-DANA | likely_real |
| DEMO-P06-LEO | likely_real (lag 1–2) |
| DEMO-P07-GRACE | not_enough_data |

Bonus checks: Maria `hrv/lower` → likely_real; Maria `steps/lower` → probably_chance (steps drop ON
migraine days, not before); Leo `steps/higher` → likely_real; `resting_hr/higher` on Maria or Leo → probably_chance.
