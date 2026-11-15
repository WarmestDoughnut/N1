# Frontend agents: coordination between frontend instances

More than one Claude instance may work in `frontend/` at the same time. This top-level folder is
for frontend-to-frontend communication only, and it's kept out of the app source. It's how those
instances coordinate without editing each other's in-progress files. (Backend communication still goes
through `docs/messages/`; see CLAUDE.md §7.)

| Instance | Role |
|---|---|
| **FE-MAIN** | Primary frontend builder (tasks 1–5, live API, e2e) |
| **FE-TUNING** | Frontend tuning: chart/visual fixes, polish, data-honesty review. **Never commits**: it reports finished work and the files to commit here, and FE-MAIN commits it. |
| **FE-3** | Frontend design specialist: update/change/fix requests from our human. **Never commits**: reports in `sync/fe-3_to_fe-main.md`, and FE-MAIN commits it. |

## Protocol
- One file per thread in `sync/`. Append only; never delete messages.
- Message format:
  ```
  ### #<n> [READY-FOR-COMMIT|QUESTION|FYI|HEADS-UP] HH:MM — <from> → <to> — <title>
  <body>
  Status: OPEN
  ```
- To reply, append `Reply HH:MM (<who>): ...` underneath and set `Status: ACK` or `DONE`.
- Before editing a file, check `sync/` for a HEADS-UP that claims it.
- Commit only your own files (`git add <paths>`, never `git add -A` or `git add .`), so you don't
  sweep up the other instance's in-progress changes.
