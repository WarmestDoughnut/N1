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
      <section className="page-heading">
        <div>
          <p className="eyebrow">Validation</p>
          <h1>Synthetic patients with known answers</h1>
          <span className="sub">Each synthetic patient has a built-in ground truth. The tool must find real patterns and say "probably chance" when there are none.</span>
        </div>
        <div className="seg">
          <button className={aud === 'clinician' ? 'active' : ''} onClick={() => setAud('clinician')}>Clinician view</button>
          <button className={aud === 'patient' ? 'active' : ''} onClick={() => setAud('patient')}>Patient view</button>
        </div>
      </section>
      <div className="workspace mb">
        <div className="signal-tabs" role="tablist">
          {items.map((it, k) => (
            <button key={it.name} role="tab" aria-selected={k === i} className={k === i ? 'selected' : ''} onClick={() => setI(k)}>
              <VerdictBadge verdict={it.results.verdict} small /> {it.name}
            </button>
          ))}
        </div>
      </div>
      {cur && (aud === 'patient'
        ? <div className="patient-app"><ResultsView key={cur.name + aud} results={cur.results} plan={cur.plan} audience="patient" /></div>
        : <ResultsView key={cur.name + aud} results={cur.results} plan={cur.plan} audience="clinician" />)}
    </div>
  )
}
