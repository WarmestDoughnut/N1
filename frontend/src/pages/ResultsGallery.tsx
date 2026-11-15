import { useMemo, useState } from 'react'
import { useHashRoute } from '../lib/hooks'
import { ResultsView } from '../components/ResultsView'
import { VerdictBadge } from '../components/Verdict'
import { sampleResults } from '../lib/mockServer'
import { fixturePlans, fixtureResults } from '../lib/fixtures'
import type { Plan, Results } from '../types'

/** Dev/demo page: every results variant side by side, from backend fixtures and the built-in mock. */
export function ResultsGallery() {
  const items = useMemo(() => {
    const fx: { name: string; plan: Plan | null; results: Results }[] = fixtureResults.map((f) => ({
      name: `Fixture · ${f.name}`,
      plan: fixturePlans.find((p) => p.id === f.results.plan_id) ?? null,
      results: f.results,
    }))
    return [...fx, ...sampleResults()]
  }, [])
  // Deep-linkable: #/gallery/<index>/<clinician|patient>
  const route = useHashRoute()
  const [i, setI] = useState(() => Number(route[1]) || 0)
  const [aud, setAud] = useState<'clinician' | 'patient'>(() => (route[2] === 'patient' ? 'patient' : 'clinician'))
  const cur = items[i]
  return (
    <div>
      <div className="page-head row-between">
        <div>
          <div className="eyebrow">Results gallery</div>
          <h1>Every verdict, side by side</h1>
          <p className="muted">Backend fixtures (if present) plus built-in sample results. Use this to check that pass and chance results both read clearly.</p>
        </div>
        <div className="seg">
          <button className={aud === 'clinician' ? 'active' : ''} onClick={() => setAud('clinician')}>Clinician view</button>
          <button className={aud === 'patient' ? 'active' : ''} onClick={() => setAud('patient')}>Patient view</button>
        </div>
      </div>
      <div className="row mb">
        {items.map((it, k) => (
          <button key={it.name} className={`btn btn-small ${k === i ? '' : 'btn-secondary'}`} onClick={() => setI(k)}>
            <VerdictBadge verdict={it.results.verdict} small /> {it.name}
          </button>
        ))}
      </div>
      {cur && (aud === 'patient'
        ? <div className="patient-page"><ResultsView key={cur.name + aud} results={cur.results} plan={cur.plan} audience="patient" /></div>
        : <ResultsView key={cur.name + aud} results={cur.results} plan={cur.plan} audience="clinician" />)}
    </div>
  )
}
