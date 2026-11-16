import { useState } from 'react'
import type { Plan, Results } from '../../types'
import type { ResultsV15 } from '../../lib/v15'
import { deliveryOf, sharedOn } from '../../components/DeliveryBadge'
import { navigate } from '../../lib/hooks'
import { firstName, type Session } from '../../lib/session'
import { Icon, SIGNAL_ICON } from '../../components/Icon'
import { ChanceDonut, isExactTest, StatusChip, VerdictBadge } from '../../components/Verdict'
import { SignalChart, ABMeansChart } from '../../components/charts'
import { describe } from '../../components/ResultsView'
import { formatDate, SIGNAL_INFO } from '../../lib/util'
import type { PatientData } from './PatientApp'

export function PatientHome({ session, data }: { session: Session; data: PatientData }) {
  const plans = [...data.plans].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const pending = plans.filter((p) => p.status === 'pending_approval')
  // Past-data-only requests are shared on approval and never collect, so they aren't "in progress".
  const running = plans.filter((p) => (p.status === 'active' || p.status === 'paused') && deliveryOf(p) !== 'retrospective')
  const finished = plans.filter((p) => data.results[p.id])
  const latest = finished[0]
  const lr = latest ? data.results[latest.id] : undefined
  const sharing = Array.from(new Set(running.filter((p) => p.status === 'active').flatMap((p) => p.signals)))

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">My health</p>
          <h1>Hello, {firstName(session.name)}</h1>
        </div>
      </section>

      {data.error && <div className="alert alert-error mb">{data.error}</div>}

      <section className="summary-grid" aria-label="Summary">
        <Tile icon="bell" tone="tone-yellow" k="Needs your review" v={pending.length} s={pending.length ? 'In My tests' : 'Nothing to review'} onClick={() => navigate('/tests')} />
        <Tile icon="activity" tone="tone-purple" k="In progress" v={running.length} s={running.some((p) => p.status === 'paused') ? 'Some paused' : 'Collecting data'} onClick={() => navigate(running[0] ? `/plans/${running[0].id}` : '/tests')} />
        <Tile icon="sparkles" tone="tone-green" k="Results ready" v={finished.length} s={finished.length ? 'Open latest' : 'None yet'} onClick={() => navigate(latest ? `/plans/${latest.id}` : '/tests')} />
      </section>

      <section className="bottom-grid">
        <article className="card">
          <div className="card-title">
            <h3 style={{ fontSize: 18 }}>Latest results</h3>
            {finished.length > 0 && <span className="muted small">{finished.length}</span>}
          </div>
          {finished.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>
              <div className="summary-icon tone-purple"><Icon name="flask" /></div>
              <p>No results yet.</p>
            </div>
          ) : finished.map((p) => <ResultItem key={p.id} plan={p} r={data.results[p.id]} />)}
        </article>

        <aside className="card">
          <div className="card-title"><div><h3 style={{ fontSize: 18 }}>What you're sharing</h3></div></div>
          {sharing.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Nothing right now.</p>
          ) : (
            <ul className="shared-list">
              {sharing.map((s) => (
                <li key={s}><span className="ic tone-purple"><Icon name={SIGNAL_ICON[s] ?? 'activity'} size={17} /></span>{SIGNAL_INFO[s]?.label ?? s}</li>
              ))}
            </ul>
          )}
          {latest && lr && (
            <div className="donut-row" style={{ borderTop: '1px solid var(--border-2)', marginTop: 14 }}>
              <ChanceDonut p={lr.p_value} n={lr.n_permutations} exact={isExactTest(lr.type, lr.n_permutations)} />
              <p style={{ margin: 0, fontSize: 14.5, color: '#5d5e6b' }}>Chance check</p>
            </div>
          )}
        </aside>
      </section>

      <CareTeamStrip data={data} />

    </>
  )
}

/** One finished test: collapsed to a title + verdict; expands to the plain result and the clinician's comment. */
function ResultItem({ plan, r }: { plan: Plan; r: Results }) {
  const [open, setOpen] = useState(false)
  const comment = (r as ResultsV15).clinician_comment
  return (
    <div className={`result-item ${open ? 'open' : ''}`}>
      <button className="result-item-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="tests-caret"><Icon name="chevron" size={15} /></span>
        <span className="result-item-title"><strong>{plan.title}</strong><small>{formatDate(plan.window.start)} to {formatDate(plan.window.end)}{comment ? ' · comment from your clinician' : ''}</small></span>
        <VerdictBadge verdict={r.verdict} patient small />
      </button>
      {open && (
        <div className="result-item-body">
          <p className="headline" style={{ fontSize: 19, margin: '0 0 12px' }}>{r.patient_headline}</p>
          <LatestChart plan={plan} r={r} />
          {comment && (
            <div className="insight" style={{ marginTop: 14 }}>
              <span><Icon name="stethoscope" size={17} /></span>
              <p><strong>{plan.clinician_name} · {formatDate(comment.at)}</strong>{comment.text}</p>
            </div>
          )}
          <div className="row mt">
            <a className="button secondary" href={`#/plans/${plan.id}`}>See full result <Icon name="chevron" size={15} /></a>
            <a className="link-btn" style={{ fontSize: 15 }} href={`#/plans/${plan.id}?focus=notes`}><Icon name="pencil" size={15} /> Add a comment</a>
          </div>
        </div>
      )}
    </div>
  )
}

function LatestChart({ plan, r }: { plan: Plan; r: Results }) {
  const { signal } = describe(r, plan)
  if (r.type === 'observational') return <SignalChart series={r.series} signal={signal} height={210} showWindows={false} stoppedEarly={!r.complete} collectedUntil={r.collected_until} windowEnd={plan.window.end} />
  const iv = r.intervention
  return iv ? <ABMeansChart meanA={iv.mean_a} meanB={iv.mean_b} signal={signal} armA={plan.intervention?.arm_a ?? 'A'} armB={plan.intervention?.arm_b ?? 'B'} height={120} /> : null
}

function CareTeamStrip({ data }: { data: PatientData }) {
  const active = data.connections.filter((c) => c.status === 'active')
  const pending = data.connections.filter((c) => c.status === 'pending')
  return (
    <article className="card mt">
      <div className="row-between">
        <div className="row" style={{ gap: 14 }}>
          <span className="summary-icon tone-purple" style={{ margin: 0 }}><Icon name="stethoscope" /></span>
          <div>
            <h3 style={{ fontSize: 18 }}>My care team</h3>
            <span className="muted" style={{ fontSize: 15 }}>
              {active.length ? active.map((c) => c.clinician_name).join(', ') : 'No clinicians yet'}
              {pending.length ? ` · ${pending.length} waiting to accept` : ''}
            </span>
          </div>
        </div>
        <a className="button secondary" href="#/care-team">{active.length ? 'Manage' : <><Icon name="plus" /> Add a clinician</>}</a>
      </div>
    </article>
  )
}

export function TestTile({ plan }: { plan: Plan }) {
  const past = deliveryOf(plan) === 'retrospective'
  const shared = sharedOn(plan)
  // approved (or later): the past data has been shared
  const settled = plan.status !== 'pending_approval' && plan.status !== 'declined'
  const icon = plan.status === 'pending_approval' ? 'bell' : plan.status === 'complete' || plan.status === 'stopped' ? 'sparkles' : plan.status === 'paused' ? 'pause' : plan.status === 'declined' ? 'x' : 'activity'
  const tone = plan.status === 'pending_approval' ? 'tone-yellow' : plan.status === 'complete' ? 'tone-green' : plan.status === 'declined' || plan.status === 'paused' ? 'tone-gray' : plan.status === 'stopped' ? 'tone-coral' : 'tone-purple'
  const cta = plan.status === 'pending_approval' ? 'Review' : plan.status === 'complete' || plan.status === 'stopped' ? 'See result' : 'Open'
  return (
    <button className="test-tile" onClick={() => navigate(`/plans/${plan.id}`)}>
      <span className={`summary-icon ${tone}`}><Icon name={icon} /></span>
      <span className="body">
        <strong>{plan.title}</strong>
        <small>From {plan.clinician_name} · {past && shared ? `Shared on ${formatDate(shared)}` : `${formatDate(plan.window.start)} to ${formatDate(plan.window.end)}`}</small>
      </span>
      {past && settled ? <span className="pill pill-green">Shared</span> : <StatusChip status={plan.status} patient />}
      <span className="link-btn" style={{ fontSize: 14.5 }}>{cta} <Icon name="chevron" size={15} /></span>
    </button>
  )
}

function Tile({ icon, tone, k, v, s, onClick }: { icon: Parameters<typeof Icon>[0]['name']; tone: string; k: string; v: number; s: string; onClick: () => void }) {
  return (
    <button className="summary-card" onClick={onClick}>
      <div className={`summary-icon ${tone}`}><Icon name={icon} /></div>
      <div style={{ minWidth: 0 }}>
        <span className="k" style={{ fontSize: 14.5 }}>{k}</span>
        <div className="v"><strong style={{ fontSize: 28 }}>{v}</strong></div>
        <small style={{ fontSize: 13.5 }}>{s}</small>
      </div>
    </button>
  )
}
