import { useState } from 'react'
import { api } from '../../api'
import type { Device, Plan } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import { Icon } from '../../components/Icon'
import { StatusChip } from '../../components/Verdict'
import { ResultsView } from '../../components/ResultsView'
import { PlanFacts, PlanSchedule } from '../../components/PlanSummary'
import { formatDate } from '../../lib/util'
import type { ClinicianData } from './ClinicianApp'

const typeLabel = (p: Plan) => (p.type === 'observational' ? 'Observational' : 'A/B trial')
const go = (id: string) => navigate(`/results/${encodeURIComponent(id)}`)

/** In-depth statistics for one finished test. `#/results` opens the newest; `#/results/:planId` a specific one. */
export function ResultsPage({ data, planId }: { data: ClinicianData; planId?: string }) {
  const { plans, patients, results } = data
  const devicesQ = useAsync<Device[]>(() => api.devices(), [])
  const [aud, setAud] = useState<'clinician' | 'patient'>('clinician')
  const name = (id: string) => patients.find((p) => p.id === id)?.display_name ?? id

  const finished = plans.filter((p) => results[p.id]).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const requested = planId ? plans.find((p) => p.id === planId) : undefined
  const plan = (planId ? finished.find((p) => p.id === planId) : undefined) ?? (planId ? undefined : finished[0])
  const r = plan ? results[plan.id] : undefined
  // Results load after plans, so "nothing yet" can just mean "still loading".
  const stillLoading = data.loading || (finished.length === 0 && plans.some((p) => p.status === 'complete' || p.status === 'stopped'))

  const withResults = patients.filter((p) => finished.some((x) => x.patient_id === p.id)).sort((a, b) => a.display_name.localeCompare(b.display_name))
  const patientId = plan?.patient_id ?? requested?.patient_id ?? ''
  const tests = finished.filter((p) => p.patient_id === patientId)
  const deviceName = (id: string) => devicesQ.data?.find((d) => d.id === id)?.name ?? id

  const heading = (
    <section className="page-heading">
      <div>
        <p className="eyebrow">Results</p>
        <h1>Test results</h1>
      </div>
      {plan && (
        <div className="seg">
          <button className={aud === 'clinician' ? 'active' : ''} onClick={() => setAud('clinician')}>Clinician view</button>
          <button className={aud === 'patient' ? 'active' : ''} onClick={() => setAud('patient')}>Patient view</button>
        </div>
      )}
    </section>
  )

  if (stillLoading) return <>{heading}<div className="spinner">Loading results…</div></>
  if (finished.length === 0) {
    return (
      <>{heading}
        <section className="workspace">
          <div className="empty">
            <div className="summary-icon tone-purple"><Icon name="flask" /></div>
            <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>No results yet.</strong></p>
            <p>A result appears here once a test finishes.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <a className="button secondary" href="#/plans">See test plans</a>
              <a className="button primary" href="#/new"><Icon name="plus" /> New test plan</a>
            </div>
          </div>
        </section>
      </>
    )
  }

  const facts = plan && (
    <article className="card">
      <div className="card-title">
        <div><h3>Plan details</h3><p>{plan.id} · created {plan.created_at.slice(0, 10)}</p></div>
        <StatusChip status={plan.status} />
      </div>
      <PlanFacts plan={plan} deviceName={deviceName} />
      {plan.intervention && <div className="mt"><PlanSchedule plan={plan} /></div>}
    </article>
  )

  return (
    <>
      {heading}
      <section className="workspace results-picker mb">
        <label>
          <span>Patient</span>
          <select aria-label="Patient" value={patientId} onChange={(e) => { const first = finished.find((p) => p.patient_id === e.target.value); if (first) go(first.id) }}>
            {!withResults.some((p) => p.id === patientId) && <option value={patientId}>{patientId ? name(patientId) : 'Choose a patient'}</option>}
            {withResults.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({finished.filter((x) => x.patient_id === p.id).length})</option>)}
          </select>
        </label>
        <label className="grow">
          <span>Test</span>
          <select aria-label="Test" value={plan?.id ?? ''} onChange={(e) => go(e.target.value)}>
            {!plan && <option value="">Choose a finished test</option>}
            {tests.map((p) => <option key={p.id} value={p.id}>{p.title} · {typeLabel(p)} · {formatDate(p.window.start)} – {formatDate(p.window.end)}</option>)}
          </select>
        </label>
        {plan && <a className="button secondary sm" href={`#/plans/${encodeURIComponent(plan.id)}`}>Open plan <Icon name="chevron" size={14} /></a>}
      </section>

      {!plan || !r ? (
        <div className="alert alert-info"><Icon name="info" /><span className="grow">
          {requested ? <>“{requested.title}” has no result yet. </> : <>That test wasn't found. </>}
          {requested && <a href={`#/plans/${encodeURIComponent(requested.id)}`}>Open the plan</a>}
        </span></div>
      ) : aud === 'patient'
        ? <div className="patient-app"><ResultsView key={plan.id + aud} results={r} plan={plan} audience="patient" /></div>
        : <ResultsView key={plan.id + aud} results={r} plan={plan} audience="clinician" aside={facts} />}
    </>
  )
}
