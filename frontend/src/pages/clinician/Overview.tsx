import { useEffect, useState } from 'react'
import type { Plan } from '../../types'
import { navigate } from '../../lib/hooks'
import { firstName, initials, type Session } from '../../lib/session'
import { Icon, SIGNAL_COLOR, SIGNAL_ICON } from '../../components/Icon'
import { ChanceDonut, StatusChip, VerdictBadge } from '../../components/Verdict'
import { ArmSeriesChart, SignalChart } from '../../components/charts'
import { describe } from '../../components/ResultsView'
import { formatDate, formatValue, pct, shufflePct, signalLabel, SIGNAL_INFO } from '../../lib/util'
import type { ClinicianData } from './ClinicianApp'
import { RequestRow } from '../../components/Connections'

export const AVATAR_TONES = ['tone-purple', 'tone-coral', 'tone-yellow', 'tone-green']
export const toneFor = (id: string) => AVATAR_TONES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Overview({ session, data }: { session: Session; data: ClinicianData }) {
  const { plans, patients, results } = data
  const byNewest = [...plans].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const finished = byNewest.filter((p) => results[p.id])
  const active = plans.filter((p) => p.status === 'active' || p.status === 'paused')
  const pending = plans.filter((p) => p.status === 'pending_approval')
  const [sel, setSel] = useState<string>('')
  useEffect(() => { if (!finished.find((p) => p.id === sel)) setSel(finished[0]?.id ?? '') }, [finished, sel])
  const plan = finished.find((p) => p.id === sel)
  const r = plan ? results[plan.id] : undefined
  const name = (id: string) => patients.find((p) => p.id === id)?.display_name ?? id
  const attention = byNewest.filter((p) => p.status === 'pending_approval' || p.status === 'active' || p.status === 'paused').slice(0, 5)
  const likely = finished.filter((p) => results[p.id].verdict === 'likely_real').length

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Clinician workspace</p>
          <h1>{greeting()}, {session.name}</h1>
          <span className="sub">Here's where your n-of-1 tests stand.</span>
        </div>
        <div className="heading-actions">
          <a className="button secondary" href="#/validation"><Icon name="flask" /> Validation</a>
          <a className="button primary" href="#/new"><Icon name="plus" /> New test plan</a>
        </div>
      </section>

      <section className="summary-grid four" aria-label="Summary">
        <SummaryButton icon="people" tone="tone-purple" k="Connected patients" v={patients.length}
          s={data.requests.length ? <><b style={{ color: 'var(--yellow)' }}>{data.requests.length}</b> new request{data.requests.length > 1 ? 's' : ''}</> : <><b>{patients.filter((p) => (p.source === 'real' || p.source === 'pmdata')).length}</b> with real-world data</>} href={data.requests.length ? '#/connections' : '#/patients'} />
        <SummaryButton icon="activity" tone="tone-green" k="Active tests" v={active.length} s={<>{active.filter((p) => p.status === 'paused').length} paused by patient</>} href="#/plans" />
        <SummaryButton icon="bell" tone="tone-yellow" k="Awaiting approval" v={pending.length} s={<>patient must consent first</>} href="#/plans" />
        <SummaryButton icon="sparkles" tone="tone-coral" k="Results ready" v={finished.length} s={<><b>{likely}</b> likely real</>} href="#/plans" />
      </section>

      <section className="workspace">
        <div className="workspace-head">
          <div>
            <h2>Latest results</h2>
            <p>Each test is checked against thousands of random shuffles of the patient's own data.</p>
          </div>
          {plan && <a className="button secondary sm" href={`#/plans/${plan.id}`}>Open full result <Icon name="chevron" size={14} /></a>}
        </div>
        {finished.length === 0 ? (
          <div className="empty" style={{ borderTop: '1px solid var(--border-2)' }}>
            <div className="summary-icon tone-purple"><Icon name="flask" /></div>
            <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>No results yet.</strong></p>
            <p>Create a test plan, have the patient approve it, then run it. Results appear here.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <a className="button primary" href="#/new"><Icon name="plus" /> New test plan</a>
              <a className="button secondary" href="#/validation">See validation examples</a>
            </div>
          </div>
        ) : (
          <>
            <div className="signal-tabs" role="tablist" aria-label="Finished tests">
              {finished.slice(0, 6).map((p) => {
                const { signal } = describe(results[p.id], p)
                return (
                  <button key={p.id} role="tab" aria-selected={sel === p.id} className={sel === p.id ? 'selected' : ''} onClick={() => setSel(p.id)}>
                    <span style={{ color: SIGNAL_COLOR[signal] }}><Icon name={SIGNAL_ICON[signal] ?? 'activity'} size={17} /></span>
                    {name(p.patient_id).replace(/\s*\(.*\)$/, '')} · {p.type === 'observational' ? 'Observational' : 'A/B'}
                  </button>
                )
              })}
            </div>
            {plan && r && <LatestResult plan={plan} r={r} />}
          </>
        )}
      </section>

      <section className="bottom-grid mt">
        <article className="card">
          <div className="card-title">
            <div>
              <h3>Statistical analysis</h3>
              <p>{plan ? plan.title : 'Run a test to see its statistics here.'}</p>
            </div>
            {r && <VerdictBadge verdict={r.verdict} small />}
          </div>
          {r && plan ? (
            <>
              <div className="results">
                <div><span>Permutation p-value</span><strong>{r.p_value < 0.001 ? '<0.001' : r.p_value.toFixed(3)}</strong><small className={r.p_value < 0.05 ? 'good' : ''}>{r.p_value < 0.05 ? 'Passed chance check' : 'Did not pass'}</small></div>
                <div><span>Effect size</span><strong>{pct(r.effect_pct)}</strong><small>{r.type === 'observational' ? 'vs normal days' : 'B vs A'}</small></div>
                <div><span>{r.type === 'observational' ? 'Best lag' : 'Periods'}</span><strong>{r.type === 'observational' ? `${r.observational?.best_lag_days ?? '—'} days` : `${(r.intervention?.n_periods_a ?? 0) + (r.intervention?.n_periods_b ?? 0)}`}</strong><small>{r.type === 'observational' ? `${r.n_episodes ?? 0} episodes` : `${r.n_days} days`}</small></div>
              </div>
              <p className="method-note"><Icon name="flask" size={16} /><span><b>Method:</b> {r.type === 'observational'
                ? `episode dates were moved to random days ${r.n_permutations.toLocaleString()} times; lags 1–${r.observational?.lag_scan.length ?? 3} were tested with max-statistic correction.`
                : `A/B labels were reassigned across periods ${r.n_permutations.toLocaleString()} times; washout days were excluded.`}</span></p>
            </>
          ) : <div className="empty" style={{ padding: 20 }}>Nothing to show yet.</div>}
        </article>

        <article className="card">
          <div className="card-title">
            <div>
              <h3>Needs attention</h3>
              <p>Connection requests, plans awaiting consent, and active tests</p>
            </div>
            <a className="link-btn" href="#/plans">View all <Icon name="chevron" size={14} /></a>
          </div>
          {data.requests.map((c) => <RequestRow key={c.id} conn={c} />)}
          {attention.length === 0 && data.requests.length === 0 && <div className="muted small" style={{ padding: '8px 0' }}>Nothing waiting.</div>}
          {attention.map((p) => <PlanRow key={p.id} plan={p} patientName={name(p.patient_id)} />)}
        </article>
      </section>
    </>
  )
}

function LatestResult({ plan, r }: { plan: Plan; r: NonNullable<ClinicianData['results'][string]> }) {
  const { signal, sign } = describe(r, plan)
  const isObs = r.type === 'observational'
  const passed = r.p_value < 0.05
  return (
    <div className="analytics-grid">
      <article className="chart-card">
        <div className="chart-head">
          <div>
            <span className="k">{isObs ? `Average ${SIGNAL_INFO[signal as keyof typeof SIGNAL_INFO]?.plain ?? signal} before episodes` : `Average ${signalLabel(signal).toLowerCase()} on "${plan.intervention?.arm_b}"`}</span>
            <div className="v">
              <strong>{formatValue(signal, isObs ? r.observational?.pre_episode_mean : r.intervention?.mean_b)}</strong>
              <span className={`delta ${sign * r.effect_pct > 0 && passed ? 'good' : 'neutral'}`}>{pct(r.effect_pct)}</span>
            </div>
            <small>{isObs ? `vs ${formatValue(signal, r.observational?.baseline_mean)} on normal days` : `vs ${formatValue(signal, r.intervention?.mean_a)} on "${plan.intervention?.arm_a}"`} · {formatDate(plan.window.start)} – {formatDate(plan.window.end)}</small>
          </div>
        </div>
        {isObs
          ? <SignalChart series={r.series} signal={signal} baseline={r.observational?.baseline_mean} height={250} color={SIGNAL_COLOR[signal]} stoppedEarly={!r.complete} />
          : <ArmSeriesChart series={r.series} signal={signal} height={250} armA={plan.intervention?.arm_a} armB={plan.intervention?.arm_b} stoppedEarly={!r.complete} />}
      </article>
      <aside className="insights-card">
        <div className="card-title">
          <div><h3>Result snapshot</h3><p>{plan.id}</p></div>
          <VerdictBadge verdict={r.verdict} small />
        </div>
        <div className="donut-row">
          <ChanceDonut p={r.p_value} />
          <div className="range-list">
            <span><i style={{ background: '#6258df' }} />Effect <b>{pct(r.effect_pct)}</b></span>
            <span><i style={{ background: '#d29a2c' }} />{isObs ? 'Lag' : 'Periods'} <b>{isObs ? `${r.observational?.best_lag_days ?? '—'} d` : (r.intervention?.n_periods_a ?? 0) + (r.intervention?.n_periods_b ?? 0)}</b></span>
            <span><i style={{ background: '#c9c9d3' }} />p-value <b>{r.p_value < 0.001 ? '<0.001' : r.p_value.toFixed(3)}</b></span>
          </div>
        </div>
        <div className={`insight ${passed ? '' : 'warn'}`}>
          <span><Icon name="sparkles" size={17} /></span>
          <p><strong>{r.headline}</strong>A pattern this strong appeared in {passed ? 'only ' : ''}{shufflePct(r.p_value)} of random shuffles.</p>
        </div>
      </aside>
    </div>
  )
}

export function PlanRow({ plan, patientName }: { plan: Plan; patientName: string }) {
  return (
    <button className="patient-row" onClick={() => navigate(`/plans/${plan.id}`)}>
      <span className={`mini-avatar ${toneFor(plan.patient_id)}`}>{initials(patientName)}</span>
      <span>
        <strong>{plan.title}</strong>
        <small>{firstName(patientName)} · {plan.type === 'observational' ? 'Observational' : 'A/B trial'}</small>
      </span>
      <StatusChip status={plan.status} />
      <Icon name="chevron" size={15} />
    </button>
  )
}

function SummaryButton({ icon, tone, k, v, s, href }: { icon: Parameters<typeof Icon>[0]['name']; tone: string; k: string; v: number; s: React.ReactNode; href: string }) {
  return (
    <button className="summary-card" onClick={() => navigate(href.replace(/^#/, ''))}>
      <div className={`summary-icon ${tone}`}><Icon name={icon} /></div>
      <div style={{ minWidth: 0 }}>
        <span className="k">{k}</span>
        <div className="v"><strong>{v}</strong></div>
        <small>{s}</small>
      </div>
    </button>
  )
}

