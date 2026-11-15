import { useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import type { Plan, Results } from '../types'

/* Usability fixes (backend to-frontend #10): "Simulate complete" takes ~15–34 s on the live API
 * (2,000 shuffles + the personal model), and a static "Running…" looked hung. Show what is
 * actually happening, with elapsed time. Also: results can lag the plan by a moment, so retry
 * before ever showing "not ready". */

function useElapsed(active: boolean) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!active) { setS(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [active])
  return s
}

/** [seconds after start, message] in order; the last stage whose time has passed is shown. */
function stagesFor(plan: Plan, audience: 'clinician' | 'patient'): [number, string][] {
  if (plan.type === 'intervention') {
    const k = Math.floor((plan.intervention?.schedule?.length ?? plan.intervention?.n_periods ?? 12) / 2)
    return audience === 'patient'
      ? [[0, 'Gathering your data from each period…'], [3, 'Comparing your A and B periods…'], [7, `Checking the result isn’t just chance (${(2 ** k).toLocaleString()} possible orders)…`], [20, 'Almost done…']]
      : [[0, 'Loading the outcome for each period…'], [3, 'Averaging each A and B period…'], [7, `Exact permutation test: all ${(2 ** k).toLocaleString()} possible A/B orders…`], [20, 'Writing up the result…']]
  }
  return audience === 'patient'
    ? [[0, 'Gathering your data…'], [3, 'Comparing the days before each episode with your usual days…'], [7, 'Checking the result isn’t just chance (2,000 reshuffles)…'], [16, 'Building your personal pattern…'], [26, 'Almost done…']]
    : [[0, 'Loading the data for this window…'], [3, 'Comparing pre-episode days with normal days at each lag…'], [7, 'Running the 2,000-shuffle permutation test…'], [16, 'Training the personal risk model…'], [26, 'Writing up the result…']]
}

/** Staged progress shown while a simulate-complete request is in flight. */
export function RunProgress({ plan, active, audience = 'clinician' }: { plan: Plan; active: boolean; audience?: 'clinician' | 'patient' }) {
  const s = useElapsed(active)
  if (!active) return null
  const stages = stagesFor(plan, audience)
  const idx = stages.reduce((acc, [t], i) => (s >= t ? i : acc), 0)
  // Typical run is ~15–30 s; ease toward 95% so the bar keeps moving without claiming to be done.
  const pct = Math.min(95, Math.round(100 * (1 - Math.exp(-s / 14))))
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
        <strong style={{ color: '#3c3c47' }}>{stages[idx][1]}</strong>
        <span className="muted small" style={{ whiteSpace: 'nowrap' }}>{s}s · step {idx + 1} of {stages.length}</span>
      </div>
      <div className="progress"><div style={{ width: `${pct}%`, transition: 'width 0.5s linear' }} /></div>
    </div>
  )
}

/** GET results, retrying a 404 for a few seconds (the plan can flip to complete just before results land). */
export async function resultsWithRetry(planId: string, tries = 6, waitMs = 1500): Promise<Results | null> {
  for (let i = 0; i < tries; i++) {
    try { return await api.results(planId) } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, waitMs))
    }
  }
  return null
}
