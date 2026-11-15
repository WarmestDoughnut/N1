import { useState } from 'react'
import type { PlanStatus } from '../../types'
import { navigate } from '../../lib/hooks'
import { initials } from '../../lib/session'
import { Icon } from '../../components/Icon'
import { StatusChip, VerdictBadge } from '../../components/Verdict'
import { formatDate } from '../../lib/util'
import type { ClinicianData } from './ClinicianApp'
import { toneFor } from './Overview'

const FILTERS: { id: string; label: string; match: (s: PlanStatus) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'pending', label: 'Awaiting patient', match: (s) => s === 'pending_approval' },
  { id: 'active', label: 'Active', match: (s) => s === 'active' || s === 'paused' },
  { id: 'done', label: 'Results', match: (s) => s === 'complete' || s === 'stopped' },
  { id: 'declined', label: 'Declined', match: (s) => s === 'declined' },
]

export function PlansPage({ data }: { data: ClinicianData }) {
  const [filter, setFilter] = useState('all')
  const [patient, setPatient] = useState('')
  const { plans, patients, results } = data
  const f = FILTERS.find((x) => x.id === filter)!
  const rows = [...plans]
    .filter((p) => f.match(p.status) && (!patient || p.patient_id === patient))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const name = (id: string) => patients.find((p) => p.id === id)?.display_name ?? id

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Test plans</p>
          <h1>All test plans</h1>
          <span className="sub">Each plan is the patient's consent: they approve exactly these signals, for exactly this window.</span>
        </div>
        <a className="button primary" href="#/new"><Icon name="plus" /> New test plan</a>
      </section>

      <section className="workspace">
        <div className="workspace-head">
          <div className="seg" role="tablist">
            {FILTERS.map((x) => {
              const n = plans.filter((p) => x.match(p.status)).length
              return <button key={x.id} className={filter === x.id ? 'active' : ''} onClick={() => setFilter(x.id)}>{x.label} <span className="muted small">{n}</span></button>
            })}
          </div>
          <select aria-label="Patient" value={patient} onChange={(e) => setPatient(e.target.value)}>
            <option value="">All patients</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </div>
        {data.error && <div className="alert alert-error" style={{ margin: '0 20px 16px' }}>{data.error}</div>}
        {data.loading ? <div className="spinner" style={{ padding: 22 }}>Loading plans…</div>
          : rows.length === 0 ? (
            <div className="empty" style={{ borderTop: '1px solid var(--border-2)' }}>
              <div className="summary-icon tone-purple"><Icon name="clipboard" /></div>
              <p>No plans here yet.</p>
              <a className="button primary" href="#/new"><Icon name="plus" /> Create a test plan</a>
            </div>
          ) : (
            <table className="table">
              <thead><tr><th>Plan</th><th>Patient</th><th>Type</th><th>Status</th><th>Result</th><th>Created</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/plans/${p.id}`)}>
                    <td><strong>{p.title}</strong><div className="muted small">{p.id}</div></td>
                    <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><span className={`mini-avatar ${toneFor(p.patient_id)}`} style={{ width: 30, height: 30, fontSize: 11 }}>{initials(name(p.patient_id))}</span>{name(p.patient_id)}</span></td>
                    <td>{p.type === 'observational' ? 'Observational' : 'A/B trial'}</td>
                    <td><StatusChip status={p.status} /></td>
                    <td>{results[p.id] ? <VerdictBadge verdict={results[p.id].verdict} small /> : <span className="muted small">—</span>}</td>
                    <td className="muted small">{formatDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>
    </>
  )
}
