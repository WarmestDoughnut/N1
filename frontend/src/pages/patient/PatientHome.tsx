import type { Plan, Results } from '../../types'
import { navigate } from '../../lib/hooks'
import { firstName, type Session } from '../../lib/session'
import { Icon, SIGNAL_ICON } from '../../components/Icon'
import { ChanceDonut, StatusChip, VerdictBadge } from '../../components/Verdict'
import { SignalChart, ABMeansChart } from '../../components/charts'
import { describe } from '../../components/ResultsView'
import { formatDate, SIGNAL_INFO } from '../../lib/util'
import type { PatientData } from './PatientApp'

export function PatientHome({ session, data }: { session: Session; data: PatientData }) {
  const plans = [...data.plans].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const pending = plans.filter((p) => p.status === 'pending_approval')
  const running = plans.filter((p) => p.status === 'active' || p.status === 'paused')
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
          <span className="sub">Your tests in one place. You decide what's shared.</span>
        </div>
      </section>

      {data.error && <div className="alert alert-error mb">{data.error}</div>}

      <section className="summary-grid" aria-label="Summary">
        <Tile icon="bell" tone="tone-yellow" k="Needs your review" v={pending.length} s={pending.length ? 'Tap to review' : 'Nothing to review'} onClick={() => navigate(pending[0] ? `/plans/${pending[0].id}` : '/tests')} />
        <Tile icon="activity" tone="tone-purple" k="In progress" v={running.length} s={running.some((p) => p.status === 'paused') ? 'Some paused' : 'Collecting data'} onClick={() => navigate(running[0] ? `/plans/${running[0].id}` : '/tests')} />
        <Tile icon="sparkles" tone="tone-green" k="Results ready" v={finished.length} s={finished.length ? 'See what we found' : 'None yet'} onClick={() => navigate(latest ? `/plans/${latest.id}` : '/tests')} />
      </section>

      {pending.map((p) => (
        <article key={p.id} className="card mb" style={{ borderColor: '#f0dcae', background: 'linear-gradient(150deg, #fffdf8, #fffaf0)' }}>
          <div className="row-between">
            <div className="row" style={{ gap: 14 }}>
              <span className="summary-icon tone-yellow" style={{ margin: 0 }}><Icon name="bell" /></span>
              <div>
                <p className="eyebrow" style={{ color: 'var(--yellow)', margin: 0 }}>{p.clinician_name} is asking</p>
                <h2 style={{ fontSize: 21 }}>{p.title}</h2>
              </div>
            </div>
            <button className="button primary lg" onClick={() => navigate(`/plans/${p.id}`)}>Review request <Icon name="chevron" size={16} /></button>
          </div>
          <p className="muted" style={{ margin: '12px 0 0' }}>Nothing is shared unless you approve. It would use only: {p.signals.map((s) => SIGNAL_INFO[s]?.plain ?? s).join(', ')}, from {formatDate(p.window.start)} to {formatDate(p.window.end)}.</p>
        </article>
      ))}

      <section className="bottom-grid">
        <article className="card">
          <div className="card-title">
            <div><h3 style={{ fontSize: 18 }}>Latest result</h3><p style={{ fontSize: 14 }}>{latest ? latest.title : 'Results appear here when a test finishes.'}</p></div>
            {lr && <VerdictBadge verdict={lr.verdict} patient small />}
          </div>
          {latest && lr ? (
            <>
              <p className="headline" style={{ fontSize: 19, marginBottom: 12 }}>{lr.patient_headline}</p>
              <LatestChart plan={latest} r={lr} />
              <div className="row mt"><a className="button secondary" href={`#/plans/${latest.id}`}>See full result <Icon name="chevron" size={15} /></a></div>
            </>
          ) : (
            <div className="empty" style={{ padding: 24 }}>
              <div className="summary-icon tone-purple"><Icon name="flask" /></div>
              <p>No results yet.</p>
            </div>
          )}
        </article>

        <aside className="card">
          <div className="card-title"><div><h3 style={{ fontSize: 18 }}>What you're sharing</h3><p style={{ fontSize: 14 }}>Only with tests you approved</p></div></div>
          {sharing.length === 0 ? (
            <div className="insight"><span><Icon name="shield" size={17} /></span><p><strong>Nothing right now</strong>No active test is collecting your data.</p></div>
          ) : (
            <>
              <ul className="shared-list">
                {sharing.map((s) => (
                  <li key={s}><span className="ic tone-purple"><Icon name={SIGNAL_ICON[s] ?? 'activity'} size={17} /></span>{SIGNAL_INFO[s]?.label ?? s}</li>
                ))}
              </ul>
              <p className="muted small mt">You can pause or stop any test from its page.</p>
            </>
          )}
          {latest && lr && (
            <div className="donut-row" style={{ borderTop: '1px solid var(--border-2)', marginTop: 14 }}>
              <ChanceDonut p={lr.p_value} />
              <p style={{ margin: 0, fontSize: 14.5, color: '#5d5e6b' }}>How your latest result compares with random chance. Higher means less likely to be luck.</p>
            </div>
          )}
        </aside>
      </section>

      <CareTeamStrip data={data} />

      <div className="section-title"><h2>My tests</h2><span>{plans.length} total</span></div>
      {data.loading && <div className="spinner">Loading your tests…</div>}
      {!data.loading && plans.length === 0 && (
        <div className="card empty">
          <div className="summary-icon tone-purple"><Icon name="clipboard" /></div>
          <p style={{ fontSize: 17, color: '#4c4c58' }}>You don't have any tests yet.</p>
          <p>When your clinician sends one, it will appear here for you to review.</p>
        </div>
      )}
      <div className="stack">{plans.slice(0, 4).map((p) => <TestTile key={p.id} plan={p} />)}</div>
      {plans.length > 4 && <div className="row mt"><a className="button secondary" href="#/tests">See all tests</a></div>}
    </>
  )
}

function LatestChart({ plan, r }: { plan: Plan; r: Results }) {
  const { signal } = describe(r, plan)
  if (r.type === 'observational') return <SignalChart series={r.series} signal={signal} height={210} showWindows={false} stoppedEarly={!r.complete} />
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
  const icon = plan.status === 'pending_approval' ? 'bell' : plan.status === 'complete' || plan.status === 'stopped' ? 'sparkles' : plan.status === 'paused' ? 'pause' : plan.status === 'declined' ? 'x' : 'activity'
  const tone = plan.status === 'pending_approval' ? 'tone-yellow' : plan.status === 'complete' ? 'tone-green' : plan.status === 'declined' || plan.status === 'paused' ? 'tone-gray' : plan.status === 'stopped' ? 'tone-coral' : 'tone-purple'
  const cta = plan.status === 'pending_approval' ? 'Review' : plan.status === 'complete' || plan.status === 'stopped' ? 'See result' : 'Open'
  return (
    <button className="test-tile" onClick={() => navigate(`/plans/${plan.id}`)}>
      <span className={`summary-icon ${tone}`}><Icon name={icon} /></span>
      <span className="body">
        <strong>{plan.title}</strong>
        <small>From {plan.clinician_name} · {formatDate(plan.window.start)} to {formatDate(plan.window.end)}</small>
      </span>
      <StatusChip status={plan.status} patient />
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
