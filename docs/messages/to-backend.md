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
Status: OPEN
