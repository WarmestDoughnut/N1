SYNC CHECKPOINT. Pause your current task at a safe point, commit, `git pull --rebase`, push.

Then do a cross-review (you are BACKEND or FRONTEND — you know which):

1. Read the other side's logbook entries since the last sync and every OPEN message
   addressed to you. Reply to all of them (ACK / DONE / answer).
2. Re-read `docs/CONTRACT.md`. Check your own code against it field by field. List any
   mismatch you find on EITHER side (you may read the other folder, never edit it).
3. Integration check:
   - BACKEND: start the server, curl every endpoint the frontend currently uses (see their
     `src/api.ts`), confirm shapes match the contract and fixtures; run `pytest`.
   - FRONTEND: point at the live backend (`USE_FIXTURES=false`), click through the demo script
     in CLAUDE.md §10 as far as it goes; note every break.
4. Drift check: is anything being built that is not in CLAUDE.md, or anything in the demo
   script that nobody owns? Flag it.
5. Append a logbook entry titled `SYNC <HH:MM>` with: what's integrated and working,
   mismatches found, messages sent, and your plan until the next checkpoint (respect the
   cut list and the 14:30 freeze).
6. Post any mismatches that the other side must fix as BLOCKER or CHANGE-REQUEST messages.
7. Give the human a 3–5 line summary: working end-to-end now / broken / next / any decision
   needed from them.

Then resume work.
