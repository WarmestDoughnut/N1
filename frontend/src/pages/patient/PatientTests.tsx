import type { Plan } from '../../types'
import { Icon } from '../../components/Icon'
import { TestTile } from './PatientHome'
import { deliveryOf } from '../../components/DeliveryBadge'
import type { PatientData } from './PatientApp'

const pastOnly = (p: Plan) => deliveryOf(p) === 'retrospective'

export function PatientTests({ data }: { data: PatientData }) {
  const plans = [...data.plans].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const groups: { title: string; items: Plan[] }[] = [
    { title: 'Needs your review', items: plans.filter((p) => p.status === 'pending_approval') },
    // A request that only uses past data has nothing left to collect once approved, so it is never "in progress".
    { title: 'In progress', items: plans.filter((p) => (p.status === 'active' || p.status === 'paused') && !pastOnly(p)) },
    { title: 'Finished', items: plans.filter((p) => p.status === 'complete' || p.status === 'stopped' || ((p.status === 'active' || p.status === 'paused') && pastOnly(p))) },
    { title: 'Declined', items: plans.filter((p) => p.status === 'declined') },
  ]
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">My tests</p>
          <h1>All my tests</h1>
        </div>
      </section>
      {data.error && <div className="alert alert-error mb">{data.error}</div>}
      {data.loading && <div className="spinner">Loading…</div>}
      {!data.loading && plans.length === 0 && (
        <div className="card empty">
          <div className="summary-icon tone-purple"><Icon name="clipboard" /></div>
          <p style={{ fontSize: 17, color: '#4c4c58' }}>You don't have any tests yet.</p>
        </div>
      )}
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.title}>
          <div className="section-title"><h2>{g.title}</h2><span>{g.items.length}</span></div>
          <div className="stack">{g.items.map((p) => <TestTile key={p.id} plan={p} />)}</div>
        </section>
      ))}
    </>
  )
}
