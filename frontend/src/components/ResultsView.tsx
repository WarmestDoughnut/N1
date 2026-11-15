import { useState } from 'react'
import type { Plan, Results } from '../types'
import { VerdictBadge } from './Verdict'
import { ScheduleTimeline } from './ScheduleTimeline'
import {
  ABMeansChart,
  ArmSeriesChart,
  CoefficientChart,
  LagScanChart,
  NullHistogram,
  PeriodMeansChart,
  SignalChart,
} from './charts'
import { formatValue, pct, shufflePct, signalLabel, SIGNAL_INFO, VERDICT_INFO, warningLabel } from '../lib/util'

interface Props {
  results: Results
  plan?: Plan | null
  audience?: 'clinician' | 'patient'
}

/** Infers which signal/direction the result is about, preferring the plan's config. */
function describe(results: Results, plan?: Plan | null) {
  if (results.type === 'observational') {
    const signal = plan?.observational?.signal ?? 'sleep_min'
    const sign: 1 | -1 = plan?.observational ? (plan.observational.direction === 'lower' ? -1 : 1) : results.effect_pct < 0 ? -1 : 1
    return { signal, sign }
  }
  const signal = plan?.intervention?.outcome_signal ?? 'sleep_min'
  const sign: 1 | -1 = plan?.intervention ? (plan.intervention.better === 'higher' ? 1 : -1) : results.effect_pct < 0 ? -1 : 1
  return { signal, sign }
}

export function ResultsView({ results, plan, audience = 'clinician' }: Props) {
  const [tab, setTab] = useState<'results' | 'model'>('results')
  const showModelTab = audience === 'clinician' && results.model != null
  const patient = audience === 'patient'

  return (
    <div className="stack">
      <VerdictHero results={results} plan={plan} patient={patient} />

      {showModelTab && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'results'} className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Results</button>
          <button role="tab" aria-selected={tab === 'model'} className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')}>Personal risk model</button>
        </div>
      )}

      {tab === 'model' && showModelTab ? (
        <ModelPanel results={results} />
      ) : patient ? (
        <PatientBody results={results} plan={plan} />
      ) : results.type === 'observational' ? (
        <ObservationalBody results={results} plan={plan} />
      ) : (
        <InterventionBody results={results} plan={plan} />
      )}

      <ResultsFooter results={results} patient={patient} />
    </div>
  )
}

function VerdictHero({ results, plan, patient }: { results: Results; plan?: Plan | null; patient: boolean }) {
  const question = plan?.title
  return (
    <div className="card">
      {question && (
        <>
          <div className="eyebrow">{patient ? 'The question' : results.type === 'observational' ? 'Observational test' : 'A/B n-of-1 trial'}</div>
          <h1 style={{ marginBottom: '1rem' }}>{question}</h1>
        </>
      )}
      <div className="verdict-hero">
        <VerdictBadge verdict={results.verdict} patient={patient} />
        <p className="headline">{patient ? results.patient_headline : results.headline}</p>
      </div>
      {!patient && <p className="muted small mt" style={{ marginBottom: 0 }}>{VERDICT_INFO[results.verdict]?.blurb}</p>}
      {!results.complete && (
        <div className="alert alert-warn mt" style={{ marginBottom: 0 }}>
          This plan was stopped early. These results use only the data collected before it stopped and are incomplete.
        </div>
      )}
    </div>
  )
}

function ChanceCard({ results, sign, shuffledWhat }: { results: Results; sign: 1 | -1; shuffledWhat: string }) {
  const p = results.p_value
  const n = results.n_permutations.toLocaleString()
  const passed = p < 0.05
  const borderline = !passed && p < 0.15
  return (
    <div className="card chance-card">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Chance check</h2>
        <span className={`chip ${passed ? '' : 'chip-warn'}`} style={passed ? { background: 'var(--real-bg)', color: 'var(--real)', borderColor: '#22c55e' } : undefined}>
          {passed ? '✓ Passed' : borderline ? 'Borderline' : '✗ Not passed'}
        </span>
      </div>
      <p className="big mt">
        {passed ? (
          <>A pattern this strong appeared in only <strong>{shufflePct(p)}</strong> of {n} random shuffles.</>
        ) : (
          <>A pattern this strong appeared in <strong>{shufflePct(p)}</strong> of {n} random shuffles, so chance explains it {borderline ? 'fairly often' : 'easily'}.</>
        )}
      </p>
      <p className="muted small">
        We {shuffledWhat} {n} times and recomputed the effect each time. Permutation p = {p < 0.001 ? '<0.001' : p.toFixed(3)}.
      </p>
      <NullHistogram nulls={results.null_distribution} observed={results.effect_pct} sign={sign} />
    </div>
  )
}

function ObservationalBody({ results, plan }: { results: Results; plan?: Plan | null }) {
  const obs = results.observational
  const { signal, sign } = describe(results, plan)
  return (
    <>
      <div className="stat-grid">
        <div className="stat"><div className="k">Effect</div><div className="v">{pct(results.effect_pct)}</div><div className="s">{signalLabel(signal)} before episodes vs normal days</div></div>
        <div className="stat"><div className="k">Lag</div><div className="v">{obs ? `${obs.best_lag_days} day${obs.best_lag_days > 1 ? 's' : ''}` : '—'}</div><div className="s">strongest window before episodes</div></div>
        <div className="stat"><div className="k">Permutation p</div><div className="v">{results.p_value < 0.001 ? '<0.001' : results.p_value.toFixed(3)}</div><div className="s">{results.n_permutations.toLocaleString()} shuffles</div></div>
        <div className="stat"><div className="k">Episodes</div><div className="v">{results.n_episodes ?? '—'}</div><div className="s">over {results.n_days} days</div></div>
        {obs && (
          <div className="stat"><div className="k">Before episodes / normal</div><div className="v" style={{ fontSize: '1.1rem' }}>{formatValue(signal, obs.pre_episode_mean)} / {formatValue(signal, obs.baseline_mean)}</div><div className="s">average {SIGNAL_INFO[signal as keyof typeof SIGNAL_INFO]?.plain ?? signal}</div></div>
        )}
      </div>

      <div className="card">
        <div className="chart-title">{signalLabel(signal)} over the test window</div>
        <div className="chart-sub">Shaded days are the {obs?.best_lag_days ?? ''}-day windows before each episode. These are compared against all other days.</div>
        <SignalChart series={results.series} signal={signal} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="chart-title">How far ahead? (lag scan)</div>
          <div className="chart-sub">Difference from normal days, looking 1 to {obs?.lag_scan.length ?? 3} days before episodes. The highlighted bar is the strongest. p-values are corrected for testing several lags.</div>
          {obs ? <LagScanChart lagScan={obs.lag_scan} best={obs.best_lag_days} /> : <div className="muted">No lag scan.</div>}
        </div>
        <ChanceCard results={results} sign={sign} shuffledWhat="moved the episode dates to random days" />
      </div>
    </>
  )
}

function InterventionBody({ results, plan }: { results: Results; plan?: Plan | null }) {
  const iv = results.intervention
  const cfg = plan?.intervention
  const { signal, sign } = describe(results, plan)
  const armA = cfg?.arm_a ?? 'A'
  const armB = cfg?.arm_b ?? 'B'
  return (
    <>
      <div className="stat-grid">
        <div className="stat"><div className="k">Effect (B vs A)</div><div className="v">{pct(results.effect_pct)}</div><div className="s">{signalLabel(signal)}, {cfg ? `${cfg.better} is better` : ''}</div></div>
        <div className="stat"><div className="k">Mean A</div><div className="v" style={{ color: 'var(--arm-a)' }}>{iv ? formatValue(signal, iv.mean_a) : '—'}</div><div className="s">{armA}</div></div>
        <div className="stat"><div className="k">Mean B</div><div className="v" style={{ color: 'var(--arm-b)' }}>{iv ? formatValue(signal, iv.mean_b) : '—'}</div><div className="s">{armB}</div></div>
        <div className="stat"><div className="k">Permutation p</div><div className="v">{results.p_value < 0.001 ? '<0.001' : results.p_value.toFixed(3)}</div><div className="s">{results.n_permutations.toLocaleString()} shuffles</div></div>
        <div className="stat"><div className="k">Periods</div><div className="v">{iv ? `${iv.n_periods_a} A · ${iv.n_periods_b} B` : '—'}</div><div className="s">over {results.n_days} days</div></div>
      </div>

      {cfg?.schedule?.length ? (
        <div className="card">
          <div className="chart-title">Randomized schedule</div>
          <div className="chart-sub">Each pair of periods is randomly A-B or B-A. Washout days are not analyzed.</div>
          <ScheduleTimeline schedule={cfg.schedule} armA={armA} armB={armB} />
        </div>
      ) : null}

      <div className="card">
        <div className="chart-title">{signalLabel(signal)} by period</div>
        <div className="chart-sub">Blue = A ({armA}), orange = B ({armB}), gray dashes = washout.</div>
        <ArmSeriesChart series={results.series} signal={signal} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="chart-title">A vs B average</div>
          {iv && <ABMeansChart meanA={iv.mean_a} meanB={iv.mean_b} signal={signal} armA={armA} armB={armB} height={140} />}
          <div className="chart-title mt">Each period's average</div>
          {iv && <PeriodMeansChart periodMeans={iv.period_means} signal={signal} armA={armA} armB={armB} />}
        </div>
        <ChanceCard results={results} sign={sign} shuffledWhat="randomly reassigned the A/B labels across periods" />
      </div>
    </>
  )
}

function PatientBody({ results, plan }: { results: Results; plan?: Plan | null }) {
  const { signal } = describe(results, plan)
  const p = results.p_value
  const plain = SIGNAL_INFO[signal as keyof typeof SIGNAL_INFO]?.plain ?? signal
  const iv = results.intervention
  const cfg = plan?.intervention
  return (
    <>
      <div className="card">
        <h2>What we looked at</h2>
        {results.type === 'observational' ? (
          <>
            <p>Your {plain} each day. Red lines are days you had an episode.</p>
            <SignalChart series={results.series} signal={signal} height={260} showWindows={false} />
          </>
        ) : (
          <>
            <p>Your {plain} during "{cfg?.arm_a ?? 'A'}" and "{cfg?.arm_b ?? 'B'}" periods.</p>
            {iv && <ABMeansChart meanA={iv.mean_a} meanB={iv.mean_b} signal={signal} armA={cfg?.arm_a ?? 'A'} armB={cfg?.arm_b ?? 'B'} height={150} />}
          </>
        )}
      </div>
      <div className="card">
        <h2>Could this be chance?</h2>
        <p style={{ fontSize: '1.15rem' }}>
          {p < 0.05
            ? `We mixed up your data ${results.n_permutations.toLocaleString()} times. A pattern this strong showed up only ${shufflePct(p).replace('<', 'less than ')} of the time, so it's unlikely to be luck.`
            : `We mixed up your data ${results.n_permutations.toLocaleString()} times. A pattern like this showed up ${shufflePct(p)} of the time, so it could easily be luck.`}
        </p>
      </div>
    </>
  )
}

function ResultsFooter({ results, patient }: { results: Results; patient: boolean }) {
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        {results.type === 'observational' ? (
          <span className="chip">{results.n_episodes ?? 0} episodes</span>
        ) : (
          <span className="chip">{(results.intervention?.n_periods_a ?? 0) + (results.intervention?.n_periods_b ?? 0)} periods</span>
        )}
        <span className="chip">{results.n_days} days</span>
        {!patient && <span className="chip">{results.n_permutations.toLocaleString()} permutations</span>}
        {results.warnings.filter((w) => !patient || w !== 'multiple_lags_tested').map((w) => (
          <span key={w} className="chip chip-warn">⚠ {warningLabel(w)}</span>
        ))}
      </div>
      <div className="disclaimer">
        <strong>Not diagnostic</strong> — worth discussing with your clinician.
        {!patient && ' Results describe this one patient over this window only.'}
      </div>
    </div>
  )
}

function ModelPanel({ results }: { results: Results }) {
  const m = results.model!
  if (!m.trained) {
    return <div className="card"><h2>Personal risk model</h2><p className="muted">The model wasn't trained: {m.reason ?? 'not enough data'}.</p></div>
  }
  return (
    <div className="grid-2">
      <div className="card">
        <h2>Personal risk model</h2>
        <p className="muted small">{m.kind === 'logistic_l2' ? 'L2-regularized logistic regression' : m.kind} trained on this patient's own history.</p>
        <div className="stat-grid">
          <div className="stat"><div className="k">AUC</div><div className="v">{m.auc?.toFixed(2) ?? '—'}</div><div className="s">0.5 = coin flip</div></div>
          <div className="stat"><div className="k">AUC vs chance</div><div className="v">{m.auc_null_p != null ? `p=${m.auc_null_p.toFixed(3)}` : '—'}</div><div className="s">{m.auc_null_p != null && m.auc_null_p < 0.05 ? 'better than chance' : 'not better than chance'}</div></div>
          <div className="stat"><div className="k">Risk tomorrow</div><div className="v">{m.risk_tomorrow != null ? `${Math.round(m.risk_tomorrow * 100)}%` : '—'}</div><div className="s">chance of an episode</div></div>
        </div>
        <p className="muted small mt">Exploratory and not validated for clinical use.</p>
      </div>
      <div className="card">
        <div className="chart-title">What drives the prediction</div>
        <div className="chart-sub">Negative weight means lower values raise episode risk.</div>
        <CoefficientChart coefficients={m.coefficients} />
      </div>
    </div>
  )
}
