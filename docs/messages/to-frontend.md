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
Status: OPEN

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
Status: OPEN
