import { api } from '../../api'
import type { Device, Plan, Results } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import { Icon } from '../../components/Icon'
import { StatusChip } from '../../components/Verdict'
import { ResultsView } from '../../components/ResultsView'
import { History, PlanFacts, PlanSchedule } from '../../components/PlanSummary'
import { resultsWithRetry } from '../../components/RunProgress'
import { CollectionCoverage } from '../../components/CollectionPanel'
import { isCollection, type CollectionResults } from '../../lib/v15'
import type { ClinicianData } from './ClinicianApp'

export function PlanDetail({ planId, data }: { planId: string; data: ClinicianData }) {
  const planQ = useAsync<Plan>(() => api.getPlan(planId), [planId])
  const devicesQ = useAsync<Device[]>(() => api.devices(), [])
  const plan = planQ.data
  const hasResults = plan && (plan.status === 'complete' || plan.status === 'stopped')
  const resultsQ = useAsync<Results | null>(
    () => (hasResults ? resultsWithRetry(planId) : Promise.resolve(null)),
    [planId, plan?.status],
  )
  const deviceName = (id: string) => devicesQ.data?.find((d) => d.id === id)?.name ?? id
  const patient = data.patients.find((p) => p.id === plan?.patient_id)


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
          <p className="eyebrow"><a href={`#/patients/${plan.patient_id}/tests`}>{patient?.display_name ?? plan.patient_id} · Tests</a> / {plan.id}</p>
          {!hasResults && <h1>{plan.title}</h1>}
          <span className="sub">{patient?.display_name ?? plan.patient_id} · {plan.type === 'observational' ? 'Observational test' : 'A/B n-of-1 trial'}</span>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => navigate(`/new?from=${plan.id}`)}><Icon name="people" /> Run on another patient</button>
        </div>
      </section>


      {plan.status === 'pending_approval' && (
        <div className="alert alert-info"><Icon name="bell" /><span className="grow"><strong>Waiting for {patient?.display_name ?? 'the patient'}.</strong> Nothing is shared until they review and approve this plan from their own account.</span></div>
      )}
      {plan.status === 'declined' && <div className="alert alert-warn"><Icon name="x" /><span>The patient declined this plan. No data was shared.</span></div>}
      {plan.status === 'active' && <div className="alert alert-info"><Icon name="activity" /><span className="grow">Collecting data. You'll get the result when the plan completes, so there's nothing to monitor.</span></div>}
      {plan.status === 'paused' && <div className="alert alert-warn"><Icon name="pause" /><span className="grow">The patient paused this plan. No new data is collected until they resume.</span></div>}

      {hasResults ? (
        resultsQ.loading && !resultsQ.data ? <div className="spinner">Calculating the result…</div>
          : resultsQ.error ? <div className="alert alert-error">{resultsQ.error}</div>
            : resultsQ.data && isCollection(plan) ? <div className="card"><h2 style={{ marginTop: 0 }}>{plan.title}</h2><CollectionCoverage results={resultsQ.data as unknown as CollectionResults} /><p className="muted small mt">Run pattern tests on this data from the patient’s Data collection tab.</p></div>
            : resultsQ.data ? <ResultsView results={resultsQ.data} plan={plan} audience="clinician" aside={facts} />
              : <div className="alert alert-info" style={{ justifyContent: 'space-between' }}>The result is still being calculated.<button className="button secondary sm" onClick={resultsQ.reload}>Check again</button></div>
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
