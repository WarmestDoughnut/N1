# How to run the two Claude Code instances

1. One person creates the GitHub repo, copies this whole folder in, commits, pushes.
   Both clone it. Put PMData (one or two participant folders) in `backend/data/pmdata/`
   on the BACKEND machine and add `backend/data/pmdata/` to `.gitignore`.
2. Mark's machine: open Claude Code in the repo root, paste `prompts/backend_start.md`.
   Teammate's machine: open Claude Code in the repo root, paste `prompts/frontend_start.md`.
3. At each checkpoint (≈09:50, 11:30, 13:00, 14:30, 15:30) BOTH humans paste `prompts/sync.md`
   into their instance at about the same time, then compare the 3–5 line summaries out loud.
4. If the instances disagree on something, a human decides, writes the decision as a message
   in the relevant `docs/messages/` file, and tells both instances to read it.
5. 14:30 = feature freeze. After that only: bug fixes, polish, backup demo video, pitch.

Useful one-liners to paste mid-session:
- "Pull, read the other side's latest log and open messages, reply, then continue."
- "Stop. Re-read CLAUDE.md §9 cut list. What's the smallest thing that gets the demo script working?"
- "We're behind. Drop task N. Log the decision and tell the other side via FYI."
