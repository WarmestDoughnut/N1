import { useState } from 'react'
import { api, ApiError, friendlyError } from '../api'
import type { Device, Patient, Plan, Results, Role } from '../types'
import { navigate, useAsync } from '../lib/hooks'
import { StatusChip } from '../components/Verdict'
import { ResultsView } from '../components/ResultsView'
import { History, PlanFacts, PlanSchedule } from '../components/PlanSummary'

interface Props { planId: string; patients: Patient[]; onRole: (r: Role) => void }

export function ClinicianPlanDetail({ planId, patients, onRole }: Props) {
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
  const patient = patients.find((p) => p.id === plan?.patient_id)

  const simulate = async () => {
    setBusy(true); setErr(null)
    try { planQ.setData(await api.simulateComplete(planId)) } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }

  if (planQ.error) return <div><a href="#/">← Test plans</a><div className="alert alert-error mt">{planQ.error}</div></div>
  if (!plan) return <div className="spinner">Loading plan…</div>

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <div className="eyebrow"><a href="#/">← Test plans</a> · {plan.id} · {patient?.display_name ?? plan.patient_id}</div>
        </div>
        <div className="row">
          <StatusChip status={plan.status} />
          <button className="btn btn-secondary btn-small" onClick={() => navigate(`/new?from=${plan.id}`)}>Run same plan on another patient</button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {plan.status === 'pending_approval' && (
        <div className="alert alert-info row-between">
          <span>Waiting for {patient?.display_name ?? 'the patient'} to review and approve. Nothing is shared until they do.</span>
          <button className="btn btn-small" onClick={() => onRole('patient')}>Open as patient →</button>
        </div>
      )}
      {plan.status === 'declined' && <div className="alert alert-warn">The patient declined this plan. No data was shared.</div>}
      {(plan.status === 'active' || plan.status === 'paused') && (
        <div className="alert alert-info row-between">
          <span>{plan.status === 'paused' ? 'The patient has paused this plan.' : 'Collecting data. You will get results when the plan completes; no monitoring needed.'}</span>
          <button className="btn btn-demo" disabled={busy} onClick={simulate}>{busy ? 'Running…' : '⏩ Simulate complete (demo)'}</button>
        </div>
      )}

      {hasResults && (
        resultsQ.loading && !resultsQ.data ? <div className="spinner">Loading results…</div>
          : resultsQ.error ? <div className="alert alert-error">{resultsQ.error}</div>
            : resultsQ.data ? <ResultsView results={resultsQ.data} plan={plan} audience="clinician" />
              : <div className="alert alert-info">Results aren't ready yet.</div>
      )}

      {!hasResults && <h1>{plan.title}</h1>}

      <div className="grid-2">
        <div className="card">
          <h2>Plan</h2>
          <PlanFacts plan={plan} deviceName={deviceName} />
          {plan.intervention && <div className="mt"><PlanSchedule plan={plan} /></div>}
        </div>
        <div className="card">
          <h2>What the patient sees</h2>
          <div className="summary-box" style={{ fontSize: '1.05rem', margin: '0 0 1rem' }}>{plan.patient_summary}</div>
          <h3>History</h3>
          <History plan={plan} />
        </div>
      </div>
    </div>
  )
}
