import { api } from '../api'
import type { Patient, Plan, SignalId } from '../types'
import { navigate, useAsync } from '../lib/hooks'
import { formatDate, signalLabel, SIGNAL_INFO } from '../lib/util'
import { isCollection, splitWindow, v15Plan, type CollectionResults } from '../lib/v15'
import { resultsWithRetry } from './RunProgress'
import { Icon } from './Icon'
import { StatusChip } from './Verdict'

/* Data collection tab (overhaul fe-main #7 item 6; backend B2/B3). A collection gathers consented
 * signals with no test attached; once it has data the clinician can run a pattern test on it. */

export function CollectionPanel({ patient }: { patient: Patient }) {
  const plansQ = useAsync<Plan[]>(() => api.listPlans(patient.id), [patient.id])
  const collections = (plansQ.data ?? []).filter(isCollection).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <div className="stack">
      <div className="row-between">
        <div><h3 style={{ margin: 0, fontSize: 18 }}>Data collection</h3><span className="muted small">Gather data now; decide what to test later.</span></div>
        <a className="button primary" href={`#/patients/${patient.id}/new/collection`}><Icon name="plus" /> New data collection</a>
      </div>
      {plansQ.error && <div className="alert alert-error">{plansQ.error}</div>}
      {plansQ.loading && !plansQ.data && <div className="spinner">Loading…</div>}
      {plansQ.data && collections.length === 0 && (
        <div className="card empty">
          <div className="summary-icon tone-purple"><Icon name="calendar" /></div>
          <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>No data collections yet.</strong></p>
          <a className="button secondary" href={`#/patients/${patient.id}/new/collection`}><Icon name="plus" /> Start one</a>
        </div>
      )}
      {collections.map((c) => <CollectionCard key={c.id} plan={c} patient={patient} tests={(plansQ.data ?? []).filter((t) => (t as unknown as { from_collection?: string }).from_collection === c.id)} />)}
    </div>
  )
}

function CollectionCard({ plan, patient, tests }: { plan: Plan; patient: Patient; tests: Plan[] }) {
  const finished = plan.status === 'complete' || plan.status === 'stopped'
  const split = splitWindow(plan.window)
  // v1.6: past data is shared at approval, so tests can be requested right away for retro / mixed collections
  const pastShared = finished || ((plan.status === 'active' || plan.status === 'paused') && !!split.past)
  const resQ = useAsync<CollectionResults | null>(() => (finished ? resultsWithRetry(plan.id) as Promise<CollectionResults | null> : Promise.resolve(null)), [plan.id, finished])
  const instructions = v15Plan(plan).instructions
  const shared = plan.history.find((h) => h.event.startsWith('shared') || h.event.startsWith('approve'))?.at
  return (
    <article className="card">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{plan.title}</h3>
          <div className="muted small">{formatDate(plan.window.start)} – {formatDate(plan.window.end)} · {plan.signals.map(signalLabel).join(', ')}</div>
          {instructions && <div className="small" style={{ marginTop: 4, color: '#5d5e6b' }}>Instructions: {instructions}</div>}
        </div>
        <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <StatusChip status={plan.status} />
          <button className="button ghost sm" onClick={() => navigate(`/patients/${patient.id}/tests/${plan.id}`)}>Open <Icon name="chevron" size={14} /></button>
        </span>
      </div>

      {!pastShared && (
        <p className="muted small" style={{ marginBottom: 0 }}>
          {plan.status === 'pending_approval' ? 'Waiting for the patient to approve.' : plan.status === 'declined' ? 'The patient declined.' : 'Collecting. You can request tests once data is in.'}
        </p>
      )}
      {pastShared && !finished && shared && split.live && (
        <p className="muted small" style={{ marginBottom: 0 }}>Past data shared on {formatDate(shared)} · collecting new data until {formatDate(split.live.end)}.</p>
      )}
      {finished && <div className="mt"><CollectionCoverage results={resQ.data ?? null} loading={resQ.loading} error={resQ.error} /></div>}

      {pastShared && (
        <>
          <div className="row-between mt">
            <strong style={{ fontSize: 15 }}>Tests on this data</strong>
            <button className="button primary sm" onClick={() => navigate(`/patients/${patient.id}/new/test?collection=${encodeURIComponent(plan.id)}`)}>
              <Icon name="flask" size={14} /> Run a test on this data
            </button>
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Each test is its own request: the patient approves it before it runs.</p>
          {tests.length === 0 && <div className="muted small" style={{ marginTop: 6 }}>None yet.</div>}
          {tests.map((t) => (
            <button key={t.id} type="button" className="row-between" onClick={() => navigate(`/patients/${patient.id}/tests/${t.id}`)}
              style={{ width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--border-2)', marginTop: 10, padding: '10px 0 0', textAlign: 'left', cursor: 'pointer' }}>
              <span><strong style={{ fontSize: 14.5 }}>{t.title}</strong><span className="muted small"> · {formatDate(t.created_at)}</span></span>
              <span className="row" style={{ gap: 8 }}><StatusChip status={t.status} /><Icon name="chevron" size={14} /></span>
            </button>
          ))}
        </>
      )}
    </article>
  )
}

/** Per-signal coverage of a finished collection (B2 `results.collection`). */
export function CollectionCoverage({ results, loading, error }: { results: CollectionResults | null; loading?: boolean; error?: string | null }) {
  if (loading && !results) return <div className="spinner">Calculating coverage…</div>
  if (error) return <div className="alert alert-error">{error}</div>
  const c = results?.collection
  if (!c) return <div className="muted small">No data summary yet.</div>
  const rows = Object.entries(c.per_signal) as [SignalId, { days_with_data: number; missing_pct: number }][]
  return (
    <div>
      <div className="small" style={{ fontWeight: 700, color: '#5d5e6b', marginBottom: 6 }}>{c.n_days} days collected</div>
      <table className="table">
        <thead><tr><th>Signal</th><th>Days with data</th><th style={{ width: '40%' }}>Coverage</th></tr></thead>
        <tbody>
          {rows.map(([s, v]) => {
            const pct = Math.round(100 - v.missing_pct)
            return (
              <tr key={s}>
                <td><strong>{SIGNAL_INFO[s]?.label ?? signalLabel(s)}</strong></td>
                <td>{v.days_with_data} of {c.n_days}</td>
                <td>
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <div className="progress" style={{ flex: 1 }}><div style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--green)' : pct >= 50 ? '#d29a2c' : 'var(--coral)' }} /></div>
                    <span className="small" style={{ width: 38, textAlign: 'right' }}>{pct}%</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
