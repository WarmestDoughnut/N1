import { api } from '../api'
import type { Patient, Plan } from '../types'
import { useAsync, navigate } from '../lib/hooks'
import { StatusChip } from '../components/Verdict'
import { formatDate } from '../lib/util'

export function PatientHome({ patient }: { patient?: Patient }) {
  const plans = useAsync<Plan[]>(() => (patient ? api.listPlans(patient.id) : Promise.resolve([])), [patient?.id])
  if (!patient) return <div className="spinner">Loading…</div>

  const list = [...(plans.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const groups: { title: string; hint: string; items: Plan[] }[] = [
    { title: 'Needs your review', hint: 'Your clinician has asked to run a test. Nothing is shared unless you approve.', items: list.filter((p) => p.status === 'pending_approval') },
    { title: 'In progress', hint: 'You can pause or stop these at any time.', items: list.filter((p) => p.status === 'active' || p.status === 'paused') },
    { title: 'Finished', hint: 'See what the test found.', items: list.filter((p) => p.status === 'complete' || p.status === 'stopped') },
    { title: 'Declined', hint: '', items: list.filter((p) => p.status === 'declined') },
  ]

  return (
    <div className="patient-page">
      <div className="page-head">
        <div className="eyebrow">Patient</div>
        <h1>Hello, {patient.display_name.replace(/\s*\(.*\)$/, '')}</h1>
        <p className="muted">Your tests, in one place. You decide what's shared.</p>
      </div>
      {plans.error && <div className="alert alert-error">{plans.error}</div>}
      {plans.loading && !plans.data && <div className="spinner">Loading your tests…</div>}
      {plans.data && list.length === 0 && (
        <div className="card empty">
          <p style={{ fontSize: '1.2rem' }}>You don't have any tests yet.</p>
          <p>When your clinician sends one, it will appear here for you to review.</p>
        </div>
      )}
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.title} className="mb" style={{ marginTop: '1.5rem' }}>
          <h2>{g.title}</h2>
          {g.hint && <p className="muted">{g.hint}</p>}
          <div className="stack">
            {g.items.map((p) => (
              <button key={p.id} className="option" style={{ width: '100%' }} onClick={() => navigate(`/plans/${p.id}`)}>
                <span className="row-between" style={{ width: '100%' }}>
                  <span className="title" style={{ fontSize: '1.25rem' }}>{p.title}</span>
                  <StatusChip status={p.status} />
                </span>
                <span className="sub" style={{ fontSize: '1rem' }}>From {p.clinician_name} · {formatDate(p.window.start)} to {formatDate(p.window.end)}</span>
                <span style={{ color: 'var(--brand)', fontWeight: 700 }}>
                  {p.status === 'pending_approval' ? 'Review and decide →' : p.status === 'complete' || p.status === 'stopped' ? 'See results →' : 'Open →'}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
