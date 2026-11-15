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
