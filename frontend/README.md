# N1 Hub — Frontend

React + Vite + TypeScript + Recharts. Runs on http://localhost:5173.

```bash
cd frontend
npm install
npm run dev          # copies ../shared/fixtures/*.json → src/fixtures/, then starts Vite
npm run build        # typecheck + production build
npm run fixtures     # re-copy backend fixtures without restarting
```

## Configuration

| env var | default | meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | backend base URL |
| `VITE_USE_FIXTURES` | `false` | `true` = never call the backend; use the in-browser mock |

e.g. `VITE_USE_FIXTURES=true npm run dev`.

## Data source

- **Live API** — calls the FastAPI backend per `docs/CONTRACT.md`.
- **Sample data** — an in-browser mock (`src/lib/mockServer.ts`) implementing every contract
  endpoint, including the plan status machine, schedule generation and simplified stats. If backend
  fixtures exist in `shared/fixtures/`, its devices/patients come from them, and every results
  fixture is shown in the Results gallery (`#/gallery`).
- If the backend is unreachable the app falls back to sample data automatically. Switch any time
  from the badge in the top bar ("Live API" / "Sample data"). Mock plans persist in localStorage;
  "Reset sample plans" clears them.

## Layout

- `src/types.ts` — mirrors CONTRACT types exactly
- `src/api.ts` — typed client for every endpoint + fixture fallback + friendly 403/404/409 errors
- `src/pages/` — clinician plan list / wizard / plan detail, patient home / plan, results gallery
- `src/components/` — top bar, results view, charts, schedule timeline
