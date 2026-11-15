import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Patient, Plan, Results } from '../types'
import { useAsync, navigate } from '../lib/hooks'
import { StatusChip, VerdictBadge } from '../components/Verdict'
import { formatDate } from '../lib/util'

export function ClinicianPlans({ patients }: { patients: Patient[] }) {
  const [filter, setFilter] = useState('')
  const plans = useAsync<Plan[]>(() => api.listPlans(filter || undefined), [filter])
  const [verdicts, setVerdicts] = useState<Record<string, Results['verdict']>>({})

  // Fetch verdicts for finished plans so the list shows outcomes at a glance.
  useEffect(() => {
    const done = (plans.data ?? []).filter((p) => (p.status === 'complete' || p.status === 'stopped') && !verdicts[p.id])
    done.forEach((p) =>
      api.results(p.id).then((r) => setVerdicts((v) => ({ ...v, [p.id]: r.verdict }))).catch(() => {}),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans.data])

  const name = (id: string) => patients.find((p) => p.id === id)?.display_name ?? id
  const sorted = [...(plans.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div>
      <div className="page-head row-between">
        <div>
          <div className="eyebrow">Clinician · Dr. Rivera</div>
          <h1>Test plans</h1>
          <p className="muted" style={{ margin: 0 }}>Turn a clinical hunch into a structured test on one patient's own device data.</p>
        </div>
        <button className="btn btn-large" onClick={() => navigate('/new')}>+ New test plan</button>
      </div>

      <div className="card">
        <div className="row-between mb">
          <label className="row">
            <span className="muted">Patient</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '0.4rem 0.6rem', borderRadius: 8 }}>
              <option value="">All patients</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </label>
          <button className="btn btn-ghost btn-small" onClick={plans.reload}>Refresh</button>
        </div>

        {plans.error && <div className="alert alert-error">{plans.error}</div>}
        {plans.loading && !plans.data ? (
          <div className="spinner">Loading plans…</div>
        ) : sorted.length === 0 ? (
          <div className="empty">
            <p>No test plans yet.</p>
            <button className="btn" onClick={() => navigate('/new')}>Create the first one</button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Plan</th><th>Patient</th><th>Type</th><th>Status</th><th>Result</th><th>Created</th></tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/plans/${p.id}`)}>
                  <td><a href={`#/plans/${p.id}`} onClick={(e) => e.stopPropagation()}><strong>{p.title}</strong></a><div className="muted small">{p.id}</div></td>
                  <td>{name(p.patient_id)}</td>
                  <td>{p.type === 'observational' ? 'Observational' : 'A/B trial'}</td>
                  <td><StatusChip status={p.status} /></td>
                  <td>
                    {verdicts[p.id] ? (
                      <a href={`#/plans/${p.id}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}>
                        <VerdictBadge verdict={verdicts[p.id]} small />
                      </a>
                    ) : <span className="muted small">—</span>}
                  </td>
                  <td className="small muted">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
