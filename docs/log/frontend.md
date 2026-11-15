# Frontend Logbook (append-only, newest at bottom)

Format:
```
### HH:MM — <short title>
- Done:
- Files:
- Contract impact: none | proposed (msg #) | implemented vX.Y
- How to try it:
- Next:
- Blockers / needs from backend:
```

---

### 10:05 — Task 1: scaffold
- Done: Vite + React + TS + Recharts app in `frontend/`. `src/types.ts` mirrors CONTRACT v1.0. `src/api.ts` has typed functions for every endpoint, a `USE_FIXTURES` switch (`VITE_USE_FIXTURES=true` or the top-bar toggle), and automatic fallback to sample data if the backend is unreachable. Since `shared/fixtures/` is empty, the sample data comes from an in-browser mock (`src/lib/mockServer.ts`) that follows the contract: patients SYN-PATTERN / SYN-NULL / SYN-TREAT / SYN-TREAT-NULL / PMD-P01, the status machine, and schedule + simplified stats. When backend fixtures appear, `npm run dev` copies them into `src/fixtures/` (classified by shape, so any filenames work). Top bar: "N1 Hub", Clinician/Patient switcher, Demo mode badge, data-source badge.
- Files: frontend/** (README.md has run commands)
- Contract impact: none
- How to try it: `cd frontend && npm install && npm run dev` → http://localhost:5173
- Next: Task 2, the results screen.
- Blockers / needs from backend: none yet. Please post an FYI once fixtures are in `shared/fixtures/`. Any filenames work.
