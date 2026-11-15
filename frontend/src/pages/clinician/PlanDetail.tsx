import { useState } from 'react'
import { api, ApiError, friendlyError } from '../../api'
import type { Device, Plan, Results } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import { Icon } from '../../components/Icon'
import { StatusChip } from '../../components/Verdict'
import { ResultsView } from '../../components/ResultsView'
import { History, PlanFacts, PlanSchedule } from '../../components/PlanSummary'
import { useToast } from '../../components/Shell'
import type { ClinicianData } from './ClinicianApp'

export function PlanDetail({ planId, data }: { planId: string; data: ClinicianData }) {
  const toast = useToast()
  const planQ = useAsync<Plan>(() => api.getPlan(planId), [planId])
  const devicesQ = useAsync<Device[]>(() => api.devices(), [])
  const plan = planQ.data
  const hasResults = plan && (plan.status === 'complete' || plan.status === 'stopped')
  const resultsQ = useAsync<Results | null>(
    () => (hasResults ? api.results(planId).catch((e) => { if (e instanceof ApiError && e.status === 404) return null; throw e }) : Promise.resolve(null)),
    [planId, plan?.status],
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const deviceName = (id: string) => devicesQ.data?.find((d) => d.id === id)?.name ?? id
  const patient = data.patients.find((p) => p.id === plan?.patient_id)

  const simulate = async () => {
    setBusy(true); setErr(null)
    try { planQ.setData(await api.simulateComplete(planId)); toast('Plan completed (demo). Results are ready.') }
    catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }

  if (planQ.error) return <div className="stack"><a href="#/plans">← Test plans</a><div className="alert alert-error">{planQ.error}</div></div>
  if (!plan) return <div className="spinner">Loading plan…</div>

  const facts = (
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
    <div className="stack">
      <section className="page-heading" style={{ marginBottom: 0 }}>
        <div>
          <p className="eyebrow"><a href="#/plans">Test plans</a> / {plan.id}</p>
          {!hasResults && <h1>{plan.title}</h1>}
          <span className="sub">{patient?.display_name ?? plan.patient_id} · {plan.type === 'observational' ? 'Observational test' : 'A/B n-of-1 trial'}</span>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => navigate(`/new?from=${plan.id}`)}><Icon name="people" /> Run on another patient</button>
          {(plan.status === 'active' || plan.status === 'paused') && (
            <button className="button demo" disabled={busy} onClick={simulate}><Icon name="fastForward" /> {busy ? 'Running…' : 'Simulate complete (demo)'}</button>
          )}
        </div>
      </section>

      {err && <div className="alert alert-error"><Icon name="info" />{err}</div>}

      {plan.status === 'pending_approval' && (
        <div className="alert alert-info"><Icon name="bell" /><span className="grow"><strong>Waiting for {patient?.display_name ?? 'the patient'}.</strong> Nothing is shared until they review and approve this plan from their own account.</span></div>
      )}
      {plan.status === 'declined' && <div className="alert alert-warn"><Icon name="x" /><span>The patient declined this plan. No data was shared.</span></div>}
      {plan.status === 'active' && <div className="alert alert-info"><Icon name="activity" /><span className="grow">Collecting data. You'll get the result when the plan completes, so there's nothing to monitor.</span></div>}
      {plan.status === 'paused' && <div className="alert alert-warn"><Icon name="pause" /><span className="grow">The patient paused this plan. No new data is collected until they resume.</span></div>}

      {hasResults ? (
        resultsQ.loading && !resultsQ.data ? <div className="spinner">Loading results…</div>
          : resultsQ.error ? <div className="alert alert-error">{resultsQ.error}</div>
            : resultsQ.data ? <ResultsView results={resultsQ.data} plan={plan} audience="clinician" aside={facts} />
              : <div className="alert alert-info">Results aren't ready yet.</div>
      ) : (
        <section className="bottom-grid">
          {facts}
          <article className="card">
            <div className="card-title"><h3>What the patient sees</h3></div>
            <div className="summary-text" style={{ fontSize: 16, margin: '0 0 16px' }}>{plan.patient_summary}</div>
            <div className="chart-title">History</div>
            <History plan={plan} />
          </article>
        </section>
      )}
    </div>
  )
}
