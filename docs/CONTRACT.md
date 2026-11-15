# API & Data Contract — v1.1

Source of truth for both instances. Change only via the protocol in CLAUDE.md §7.
Bump the version above on every change and note it in the changelog at the bottom.

Base URL: `http://localhost:8000`. All responses JSON. CORS allows `http://localhost:5173`.
Dates are `YYYY-MM-DD`. Times are ISO 8601. IDs are strings.

## 1. Signals (daily table columns)

| signal id | unit | meaning |
|---|---|---|
| `sleep_min` | minutes | total sleep that night (assigned to the morning date) |
| `resting_hr` | bpm | resting heart rate |
| `hrv` | ms | heart rate variability (may be null for some sources) |
| `steps` | count | daily steps |
| `skin_temp_dev` | °C | skin temperature deviation vs personal baseline (v1.1) |
| `resp_rate` | breaths/min | respiratory rate (v1.1) |
| `spo2` | % | blood oxygen saturation (v1.1) |
| `systolic_bp` | mmHg | systolic blood pressure (v1.1) |
| `glucose_tir` | % | glucose time-in-range 70–180 mg/dL (v1.1) |
| `walking_speed` | m/s | walking speed (v1.1) |
| `episode` | 0/1 | patient-logged or derived episode that day (not a sensor; from logs) |

Daily table: one row per patient per day: `patient_id, date, sleep_min, resting_hr, hrv, steps,
skin_temp_dev, resp_rate, spo2, systolic_bp, glucose_tir, walking_speed, episode`.
Missing values are `null`, never 0.

## 2. Device catalog — `GET /api/devices`

Serves the full catalog (v1.1): the 17-device "vision" list plus the compact device ids that
patients/plans actually reference (`fitbit`, `smart_ring`, `cgm`, `bp_wearable`), so every id in
`patient.devices` / `plan.devices` resolves. Each entry:

```json
[
  {"id": "iphone", "name": "iPhone", "category": "phone", "availability": "now",
   "access": "HealthKit (Health export / Shortcuts / iOS app)",
   "signals": ["steps", "walking_speed", "episode"], "notes": "Every patient has one."},
  {"id": "fitbit", "name": "Fitbit", "category": "smartwatch", "availability": "now",
   "access": "Google Health API / Health Connect",
   "signals": ["sleep_min", "resting_hr", "hrv", "steps", "spo2", "skin_temp_dev"],
   "notes": "Affordable sleep/HR/steps — strong equity option."},
  {"id": "bp_wearable", "name": "Cuffless BP wearable", "category": "emerging", "availability": "emerging",
   "access": "TBD", "signals": ["systolic_bp"], "notes": "Emerging continuous BP; demo patient P04."}
]
```
Fields (v1.1): `id, name, category, availability ("now"|"emerging"), access, signals, notes`.
Signals a device lists that aren't in the daily table render as "supported soon".
`episode` logging is always available via the app itself; frontend may treat it as always-on.

## 3. Patients

`GET /api/patients`
```json
[
  {"id": "P01-MARIA", "display_name": "Maria, 68", "condition": "Migraine",
   "story": "Neurologist suspects short sleep triggers her migraines…",
   "source": "synthetic", "devices": ["iphone", "fitbit"],
   "date_range": ["2026-06-01", "2026-09-28"], "n_days": 120, "n_episodes": 13,
   "signals_present": ["sleep_min", "resting_hr", "hrv", "steps", "walking_speed"]}
]
```
Fields (v1.1): `id, display_name, condition, story, source ("synthetic"|"real"), citation (optional,
required when source=="real"), devices, date_range, n_days, n_episodes, signals_present`.
Real participants (PMData) carry a `citation` that MUST be shown in the UI.

`GET /api/patients/{id}/series?signals=sleep_min,episode&plan_id=PLAN-1`
Scope-enforced: returns ONLY signals in the given plan's scope, and only if the plan status is
`active`, `paused`, `stopped`, or `complete`. Otherwise `403 {"error": "not_in_scope"}`.
```json
{"patient_id": "SYN-PATTERN", "rows": [{"date": "2026-01-01", "sleep_min": 412, "episode": 0}]}
```

`POST /api/episodes` body `{"patient_id": "...", "date": "2026-03-02", "note": "headache"}`
→ `201 {"ok": true}`

## 4. Test plans

```json
{
  "id": "PLAN-1",
  "patient_id": "SYN-PATTERN",
  "clinician_name": "Dr. Rivera",
  "title": "Does low sleep precede episodes?",
  "type": "observational",
  "devices": ["iphone", "fitbit"],
  "signals": ["sleep_min", "episode"],
  "window": {"start": "2026-01-01", "end": "2026-04-30"},
  "status": "pending_approval",
  "created_at": "2026-11-15T10:00:00",
  "observational": {"signal": "sleep_min", "direction": "lower", "max_lag_days": 3},
  "intervention": null,
  "patient_summary": "Dr. Rivera wants to check whether shorter sleep tends to come before your episodes. This test uses sleep from your Fitbit and your episode log from 2026-01-01 to 2026-04-30. Nothing else is shared. You can pause or stop at any time.",
  "history": [{"at": "2026-11-15T10:00:00", "event": "created"}]
}
```

`type`: `observational | intervention`. `direction`: `lower | higher`.

Intervention block (when `type == "intervention"`, `observational` is null):
```json
"intervention": {
  "arm_a": "No melatonin",
  "arm_b": "Melatonin 3mg",
  "outcome_signal": "sleep_min",
  "better": "higher",
  "period_days": 7,
  "washout_days": 2,
  "n_periods": 6,
  "seed": 42,
  "schedule": [
    {"period": 1, "arm": "A", "start": "2026-01-01", "end": "2026-01-07", "washout_end": "2026-01-09"},
    {"period": 2, "arm": "B", "start": "2026-01-10", "end": "2026-01-16", "washout_end": "2026-01-18"}
  ]
}
```
Schedule rule: balanced randomized blocks (each pair of periods is AB or BA, randomized by seed).
Washout days are excluded from analysis.

**Status machine:** `pending_approval → active → (paused ↔ active) → stopped | complete`;
`pending_approval → declined`. Only the patient can approve/decline/pause/resume/stop.

Endpoints:
- `POST /api/plans` body = plan fields minus `id,status,created_at,history,patient_summary`
  (server generates those; for intervention, server generates `schedule` if absent) → `201` plan
- `GET /api/plans?patient_id=...` → `[plan]`
- `GET /api/plans/{id}` → plan
- `POST /api/plans/{id}/approve | /decline | /pause | /resume | /stop` → updated plan
  (`409 {"error": "invalid_transition"}` if not allowed)
- `POST /api/plans/{id}/simulate-complete` → demo only; sets `complete`, computes results → plan
- `GET /api/schedule/preview?n_periods=6&period_days=7&washout_days=2&seed=42&start=2026-01-01`
  → `{"schedule": [...]}` (for the clinician wizard preview)

## 5. Results — `GET /api/plans/{id}/results`

`404 {"error": "no_results"}` until computed. Computed on `simulate-complete` or `stop`.

```json
{
  "plan_id": "PLAN-1",
  "type": "observational",
  "complete": true,
  "verdict": "likely_real",
  "headline": "Sleep was 18% lower in the 2 days before episodes.",
  "patient_headline": "Shorter sleep often came before your episodes. Worth discussing with your clinician.",
  "effect_pct": -18.2,
  "p_value": 0.012,
  "n_permutations": 2000,
  "n_episodes": 14,
  "n_days": 120,
  "warnings": [],
  "observational": {
    "best_lag_days": 2,
    "lag_scan": [
      {"lag_days": 1, "effect_pct": -9.1, "p_value": 0.21},
      {"lag_days": 2, "effect_pct": -18.2, "p_value": 0.012},
      {"lag_days": 3, "effect_pct": -6.0, "p_value": 0.40}
    ],
    "pre_episode_mean": 352.4,
    "baseline_mean": 431.0
  },
  "intervention": null,
  "null_distribution": [-4.1, 2.3, 0.8],
  "series": [{"date": "2026-01-01", "value": 412, "episode": 0, "arm": null, "in_window": false}],
  "model": null
}
```

Intervention results use `"observational": null` and:
```json
"intervention": {
  "mean_a": 401.2, "mean_b": 438.9, "effect_pct": 9.4,
  "n_periods_a": 3, "n_periods_b": 3,
  "period_means": [{"period": 1, "arm": "A", "mean": 398.0}]
}
```
`series[].arm` is `"A" | "B" | "washout" | null`. `series[].in_window` marks pre-episode days
for observational plots.

`verdict` rules (backend implements, frontend just displays):
- `not_enough_data`: < 5 episodes (observational); or < 2 periods per arm **or fewer than 5 AB/BA
  blocks / 10 periods** (intervention, v1.1); or > 40% missing outcome values.
- `likely_real`: p < 0.05 and |effect_pct| ≥ 5 and direction matches hypothesis.
- `suggestive`: p < 0.15 and direction matches.
- `probably_chance`: otherwise.
Incomplete plans (stopped early) add warning `"incomplete_plan"` and set `complete: false`.

Intervention permutation (v1.1): re-randomize arm labels within each AB/BA block; enumerate all
2^k schedules exactly when k ≤ 12 (so the p-value is exact). With k blocks the smallest achievable
p is 1/2^k, so k < 5 can never reach p < 0.05 → `not_enough_data` + `too_few_periods`.
`n_permutations` = the number of schedules enumerated (2^k) for intervention, 2000 for observational.

`null_distribution`: sampled ≤ 500 values, in the **same sign convention as `effect_pct`** (so the
observed `effect_pct` can be marked directly on the histogram).

`warnings[]` possible values: `incomplete_plan`, `missing_data`, `few_episodes`,
`multiple_lags_tested` (p-values corrected via max-statistic permutation), `too_few_periods` (v1.1).

`model` (optional, added later, null until then):
```json
"model": {"kind": "logistic_l2", "auc": 0.71, "auc_null_p": 0.04,
          "coefficients": [{"feature": "sleep_min_lag2", "weight": -0.8}],
          "risk_tomorrow": 0.32, "trained": true, "reason": null}
```

## 6. Health
`GET /api/health` → `{"ok": true, "contract_version": "1.2"}`

## 7. Schedule preview — `GET /api/schedule/preview`
`?n_periods=12&period_days=6&washout_days=2&seed=42&start=2026-06-01`
→ `{"schedule": [...], "smallest_possible_p": 0.0156}` (balanced randomized AB/BA blocks + washout;
`smallest_possible_p` = 1/2^(n_periods/2), the permutation p-value floor, for the wizard helper).

## 8. Accounts & connections (v1.2 — demo auth, additive)

Demo-only auth: no hashing, password is plain, **token = account id** sent as
`Authorization: Bearer <token>`. All existing endpoints keep working **without** a token
(no scoping applied). State lives in the JSON store (swappable for Supabase/Postgres later).

```json
Account    {"id": "acct-rivera", "role": "clinician", "name": "Dr. Rivera",
            "email": "rivera@n1hub.demo", "patient_id": null,
            "specialty": "Internal medicine", "connect_code": "RIV-482"}
Connection {"id": "conn-1", "clinician_id": "acct-rivera", "clinician_name": "Dr. Rivera",
            "clinician_specialty": "Internal medicine", "patient_id": "P01-MARIA",
            "patient_name": "Maria, 68", "status": "pending|active",
            "requested_by": "patient|clinician", "created_at": "..."}
DemoAccount{"email": "...", "name": "...", "role": "...", "detail": "..."}
```
Patient accounts carry `patient_id`; clinician accounts carry `specialty` + `connect_code`.

Endpoints:
- `GET  /api/accounts/demo` → `[DemoAccount]` (sign-in quick-pick; password is `demo` for all)
- `POST /api/auth/login` `{email, password}` → `{account, token}` · `401 invalid_credentials`
- `GET  /api/auth/me` → `Account` · `401 not_signed_in`
- `GET  /api/connections` → `[Connection]` for the caller (clinician: theirs; patient: theirs)
- `POST /api/connections` `{clinician_code}` (patient only) → `201 Connection` (status `pending`) ·
  `404 unknown_code` · `409 already_connected` · `403 patients_only`
- `POST /api/connections/{id}/accept` (clinician only, pending→active) → `Connection` · `409 invalid_transition`
- `DELETE /api/connections/{id}` (either side) → `{"ok": true}` (does NOT delete plans/results)

Scoping when a valid Bearer token is present:
- `GET /api/patients` and `GET /api/plans`: clinician → only **active**-connected patients;
  patient → only themselves.
- `POST /api/plans`: `403 not_connected` if a clinician isn't actively connected to `patient_id`.

Seed (on first run): clinicians `rivera@n1hub.demo` (RIV-482) and `okafor@n1hub.demo` (OKA-317);
one patient account per patient (`maria@`, `james@`, … , `real-p07@n1hub.demo`), id `acct-<patient_id>`.
Active: Rivera ↔ P01,P02,P03,P04,P07,REAL-P07 · Okafor ↔ P01,P05,P06. Pending (by patient): P06-LEO → Rivera.

## Changelog
- v1.2 (12:05) — additive demo auth: accounts, `/api/auth/login|me`, `/api/connections` (+accept,
  delete), `/api/accounts/demo`; Bearer-token scoping on `/api/patients`, `/api/plans`, `POST /api/plans`
  (`not_connected`). Existing endpoints unchanged without a token.
- v1.1 (11:45) — additive: 6 new daily signals (`skin_temp_dev, resp_rate, spo2, systolic_bp,
  glucose_tir, walking_speed`); device fields `category, availability, access, notes` and merged
  catalog (vision 17 + compact ids patients reference); patient fields `condition, story,
  signals_present, source, citation`; intervention sufficiency `< 5 blocks → not_enough_data +
  too_few_periods`; clarified `n_permutations`, `null_distribution`, `schedule/preview`.
- v1.0 (09:30) — initial contract.
