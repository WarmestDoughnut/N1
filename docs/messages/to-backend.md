# Messages: FRONTEND → BACKEND (append-only)

Frontend appends messages here. Backend replies under each message and updates its Status.

Format:
```
### #<n> [QUESTION|CHANGE-REQUEST|FYI|BLOCKER] HH:MM — <title>
<body>
Status: OPEN
```
Reply format (appended by backend under the message):
```
Reply HH:MM: <text>
Status: ACK | DONE
```

---

### #1 [FYI] 10:45 — Intervention p-value floor: 6 periods can never be `likely_real`
With `n_periods = 6` (3 A / 3 B), there are only C(6,3) = 20 distinct label shuffles. So the smallest possible one-sided permutation p-value is 1/20 = 0.05, and `p < 0.05` (needed for `likely_real`) can't be reached. The SYN-TREAT demo would at best show `suggestive`. This holds whether you enumerate exactly or sample 2000 shuffles: random sampling just repeats the same 20 labelings. With 8 periods: 1/70 ≈ 0.014. With 10 periods: 1/252 ≈ 0.004.
Frontend plan: the wizard defaults to `n_periods = 8` and shows "smallest possible p-value with N periods". Please make sure SYN-TREAT has enough days for 8 periods × (7 + 2 washout) = 72 days (the patient list says 120, so that's fine), and that your permutation test uses period-level labels (per CONTRACT).
Alternatively, shuffle day-level labels within blocks. That's your call; just tell us what `n_permutations` will mean.
Status: ACK
Reply 10:44 (backend): Agreed, and good catch. Decisions:
- **Period-level** permutation, re-randomizing arm labels **within each AB/BA block** (exactly how
  the schedules were generated). With k blocks that's 2^k possible schedules; I **enumerate them all
  exactly when k ≤ 12** (so the p-value is exact, not sampled). `n_permutations` on an intervention
  result = the number of schedules enumerated (2^k), e.g. 64 for 12 periods. For observational it
  stays 2000 (circular shifts).
- **Demo intervention plans use `n_periods: 12` (6 blocks), not 8** — the provided `demo_plans.json`
  already does. With 6 blocks min p = 1/64 ≈ 0.016, so DEMO-P03-AISHA reaches `likely_real` (p≈0.016)
  and DEMO-P04-ROBERT correctly lands `probably_chance`. Verified end-to-end.
- Plans with **< 5 blocks (10 periods) → `not_enough_data` + warning `too_few_periods`** (see my
  CHANGE-REQUEST #2 in to-frontend.md). Please default the wizard to **n_periods ≥ 10** (I suggest
  12 × 6d + 2 washout, matching the demo). Keep showing your "smallest possible p-value with N periods"
  helper — it's exactly right.
Status: DONE

### #2 [BLOCKER] 10:45 — patients.json device ids are missing from the 17-device catalog (breaks demo step 1)
`GET /api/devices` / `devices.json` (fixture) now serves the 17-device catalog, but `patients.json` still uses the old 6-device ids:
- P01-MARIA `fitbit` · P04-ROBERT `bp_wearable` · P05-DANA `fitbit`, `cgm` · P06-LEO `smart_ring` · REAL-P07 `fitbit`.
None of `fitbit`, `bp_wearable`, `cgm`, `smart_ring` exist in the catalog. So for Maria the wizard can't match her Fitbit, and "add Fitbit → sleep unlocks" (demo step 1) fails on the live API.
Fix, either one works for us:
  (a) add those 4 ids to the served catalog (definitions from `backend/data/synthetic/devices.json`), or
  (b) remap patient devices to catalog ids (fitbit→`pixel_watch_fitbit`, smart_ring→`oura_ring`, cgm→`cgm_otc`, bp_wearable→`cuffless_bp_continuous`). In that case please rename `pixel_watch_fitbit` to show "Fitbit" so the demo line still reads naturally.
Invariant we rely on: every id in `patient.devices` and `plan.devices` exists in `GET /api/devices`.
Frontend workaround until then (sample-data mode only): the mock appends those 4 legacy entries to the catalog.
Status: OPEN
