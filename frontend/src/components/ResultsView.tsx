import { useState, type ReactNode } from 'react'
import type { Plan, Results } from '../types'
import { ChanceDonut, VerdictBadge } from './Verdict'
import { ScheduleTimeline } from './ScheduleTimeline'
import { Icon, SIGNAL_COLOR, SIGNAL_ICON } from './Icon'
import { ABMeansChart, ArmSeriesChart, CoefficientChart, LagScanChart, NullHistogram, PeriodMeansChart, SignalChart } from './charts'
import { formatValue, pct, shufflePct, signalLabel, SIGNAL_INFO, VERDICT_INFO, warningLabel } from '../lib/util'

interface Props {
  results: Results
  plan?: Plan | null
  audience?: 'clinician' | 'patient'
  /** extra card for the bottom-right slot (clinician view) */
  aside?: ReactNode
}

/** Which signal/direction the result is about, preferring the plan's config. */
export function describe(results: Results, plan?: Plan | null) {
  if (results.type === 'observational') {
    const signal = plan?.observational?.signal ?? 'sleep_min'
    const sign: 1 | -1 = plan?.observational ? (plan.observational.direction === 'lower' ? -1 : 1) : results.effect_pct < 0 ? -1 : 1
    return { signal, sign }
  }
  const signal = plan?.intervention?.outcome_signal ?? 'sleep_min'
  const sign: 1 | -1 = plan?.intervention ? (plan.intervention.better === 'higher' ? 1 : -1) : results.effect_pct < 0 ? -1 : 1
  return { signal, sign }
}

const fmtP = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3))
const plain = (s: string) => SIGNAL_INFO[s as keyof typeof SIGNAL_INFO]?.plain ?? s

export function ResultsView({ results, plan, audience = 'clinician', aside }: Props) {
  return audience === 'patient' ? <PatientResults results={results} plan={plan} /> : <ClinicianResults results={results} plan={plan} aside={aside} />
}

// ======================= clinician =======================

function ClinicianResults({ results, plan, aside }: { results: Results; plan?: Plan | null; aside?: ReactNode }) {
  const obs = results.observational
  const iv = results.intervention
  const cfg = plan?.intervention
  const { signal, sign } = describe(results, plan)
  const armA = cfg?.arm_a ?? 'A'
  const armB = cfg?.arm_b ?? 'B'
  const isObs = results.type === 'observational'
  type Tab = 'time' | 'lag' | 'periods' | 'chance' | 'model'
  const tabs: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { id: 'time', label: isObs ? `${signalLabel(signal)} over time` : 'Outcome by period', icon: SIGNAL_ICON[signal] ?? 'activity' },
    isObs ? { id: 'lag', label: 'Lag scan', icon: 'calendar' } : { id: 'periods', label: 'Period averages', icon: 'grid' },
    { id: 'chance', label: 'Chance check', icon: 'shuffle' },
    ...(results.model ? [{ id: 'model' as Tab, label: 'Personal risk model', icon: 'sparkles' as const }] : []),
  ]
  const [tab, setTab] = useState<Tab>('time')
  const passed = results.p_value < 0.05
  const nUnits = isObs ? results.n_episodes ?? 0 : (iv?.n_periods_a ?? 0) + (iv?.n_periods_b ?? 0)

  return (
    <div className="stack">
      <div className="card">
        <p className="eyebrow">{isObs ? 'Observational test' : 'A/B n-of-1 trial'} · result</p>
        <h1 style={{ marginBottom: 16 }}>{plan?.title ?? 'Test result'}</h1>
        <div className="verdict-hero">
          <VerdictBadge verdict={results.verdict} />
          <p className="headline">{results.headline}</p>
        </div>
        <p className="muted small" style={{ margin: '12px 0 0' }}>{VERDICT_INFO[results.verdict]?.blurb}</p>
        {results.warnings.includes('not_randomized') && (
          <div className="alert alert-warn mt" role="note" style={{ borderWidth: 2, fontWeight: 600 }}>
            <Icon name="info" /><span>Not a randomized result. The A/B order was set by hand, so other changes in the patient's life could explain the difference. Treat it as a lead to discuss, not as a controlled-trial result.</span>
          </div>
        )}
        {!results.complete && (
          <div className="alert alert-warn mt"><Icon name="info" /><span>This plan was stopped early. Results use only the data collected before it stopped, so they are incomplete.</span></div>
        )}
      </div>

      <section className="summary-grid four" aria-label="Key numbers">
        <Summary icon="activity" tone="tone-purple" k={isObs ? 'Effect before episodes' : 'Effect (B vs A)'} v={pct(results.effect_pct)}
          s={isObs ? `${signalLabel(signal)} vs normal days` : `${signalLabel(signal)} · ${cfg?.better ?? ''} is better`} />
        {isObs
          ? <Summary icon="calendar" tone="tone-yellow" k="Strongest lag" v={obs ? `${obs.best_lag_days} day${obs.best_lag_days > 1 ? 's' : ''}` : '—'} s="before episodes" />
          : <Summary icon={SIGNAL_ICON[signal] ?? 'activity'} tone="tone-yellow" k="A → B average" v={iv ? `${formatValue(signal, iv.mean_a)} → ${formatValue(signal, iv.mean_b)}` : '—'} s={`${armA} → ${armB}`} small />}
        <Summary icon="shuffle" tone={passed ? 'tone-green' : 'tone-gray'} k="Permutation p" v={fmtP(results.p_value)} s={`${results.n_permutations.toLocaleString()} shuffles`} />
        <Summary icon={isObs ? 'heart' : 'grid'} tone="tone-coral" k={isObs ? 'Episodes' : 'Periods'} v={String(nUnits)}
          s={isObs ? `over ${results.n_days} days` : `${iv?.n_periods_a ?? 0} A · ${iv?.n_periods_b ?? 0} B`} />
      </section>

      <section className="workspace">
        <div className="workspace-head">
          <div>
            <h2>Evidence</h2>
            <p>{isObs ? `The days before each episode compared against this patient's normal days.` : 'Randomized A/B periods compared, with washout days excluded.'}</p>
          </div>
          {cfg?.schedule?.length ? <span className="pill pill-purple no-dot">{cfg.schedule.map((p) => p.arm).join('-')}</span> : null}
        </div>
        <div className="signal-tabs" role="tablist" aria-label="Evidence views">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'selected' : ''} onClick={() => setTab(t.id)}>
              <span style={{ color: t.id === 'time' ? SIGNAL_COLOR[signal] : '#8d8d98' }}><Icon name={t.icon} size={17} /></span>{t.label}
            </button>
          ))}
        </div>
        <div className="analytics-grid">
          <article className="chart-card">
            {tab === 'time' && (
              <>
                <ChartHead k={isObs ? `Average ${plain(signal)} before episodes` : `Average ${plain(signal)} on B`}
                  v={isObs ? formatValue(signal, obs?.pre_episode_mean) : formatValue(signal, iv?.mean_b)}
                  delta={results.effect_pct} good={sign * results.effect_pct > 0 && results.verdict === 'likely_real'}
                  sub={isObs ? `vs ${formatValue(signal, obs?.baseline_mean)} on normal days` : `vs ${formatValue(signal, iv?.mean_a)} on A (${armA})`} />
                {isObs
                  ? <SignalChart series={results.series} signal={signal} baseline={obs?.baseline_mean} color={SIGNAL_COLOR[signal]} stoppedEarly={!results.complete} collectedUntil={results.collected_until} windowEnd={plan?.window.end} />
                  : <ArmSeriesChart series={results.series} signal={signal} armA={armA} armB={armB} stoppedEarly={!results.complete} collectedUntil={results.collected_until} windowEnd={plan?.window.end} />}
              </>
            )}
            {tab === 'lag' && obs && (
              <>
                <ChartHead k="How far ahead does the signal change?" v={`${obs.best_lag_days} day${obs.best_lag_days > 1 ? 's' : ''}`} sub="Highlighted bar is the strongest window. p-values are corrected for testing several lags." />
                <LagScanChart lagScan={obs.lag_scan} best={obs.best_lag_days} />
              </>
            )}
            {tab === 'periods' && iv && (
              <>
                <ChartHead k="Average per period" v={`${iv.n_periods_a + iv.n_periods_b} periods`} sub="Each pair of periods is randomly A-B or B-A." />
                {cfg?.schedule?.length ? <div className="mb"><ScheduleTimeline schedule={cfg.schedule} armA={armA} armB={armB} compact /></div> : null}
                <PeriodMeansChart periodMeans={iv.period_means} signal={signal} armA={armA} armB={armB} height={200} />
                <div className="chart-title mt">A vs B average</div>
                <ABMeansChart meanA={iv.mean_a} meanB={iv.mean_b} signal={signal} armA={armA} armB={armB} height={110} />
              </>
            )}
            {tab === 'chance' && (
              <>
                <ChartHead k="Where the real result falls among random shuffles" v={`${shufflePct(results.p_value)}`} sub={`of ${results.n_permutations.toLocaleString()} shuffles were at least this strong`} />
                <NullHistogram nulls={results.null_distribution} observed={results.effect_pct} sign={sign} height={240} />
              </>
            )}
            {tab === 'model' && results.model && <ModelPanel results={results} />}
          </article>

          <aside className="insights-card">
            <div className="card-title">
              <div>
                <h3>Chance check</h3>
                <p>{isObs ? 'Episode dates moved to random days' : 'A/B labels reassigned across periods'}</p>
              </div>
              <span className={`pill ${passed ? 'pill-green' : results.p_value < 0.15 ? 'pill-yellow' : 'pill-gray'}`}>{passed ? 'Passed' : results.p_value < 0.15 ? 'Borderline' : 'Not passed'}</span>
            </div>
            <div className="donut-row">
              <ChanceDonut p={results.p_value} />
              <div className="range-list">
                <span><i style={{ background: '#6258df' }} />Effect <b>{pct(results.effect_pct)}</b></span>
                {isObs && obs && <span><i style={{ background: '#d29a2c' }} />Lag <b>{obs.best_lag_days} d</b></span>}
                <span><i style={{ background: '#e05a5f' }} />{isObs ? 'Episodes' : 'Periods'} <b>{nUnits}</b></span>
                <span><i style={{ background: '#c9c9d3' }} />p-value <b>{fmtP(results.p_value)}</b></span>
              </div>
            </div>
            <div className={`insight ${passed ? '' : 'warn'}`}>
              <span><Icon name="sparkles" size={17} /></span>
              <p>
                <strong>{passed ? 'Unlikely to be chance' : results.verdict === 'not_enough_data' ? 'Not enough data to judge' : 'Chance explains it easily'}</strong>
                A pattern this strong appeared in {passed ? 'only ' : ''}{shufflePct(results.p_value)} of {results.n_permutations.toLocaleString()} random shuffles.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="bottom-grid">
        <article className="card">
          <div className="card-title">
            <h3>Statistical analysis</h3>
            <VerdictBadge verdict={results.verdict} small />
          </div>
          <div className="results">
            <div><span>p-value</span><strong>{fmtP(results.p_value)}</strong><small className={passed ? 'good' : ''}>{passed ? 'Below 0.05' : 'Not below 0.05'}</small></div>
            <div><span>Effect size</span><strong>{pct(results.effect_pct)}</strong><small className={Math.abs(results.effect_pct) >= 5 ? 'good' : ''}>{Math.abs(results.effect_pct) >= 5 ? '≥ 5% threshold' : 'Under 5% threshold'}</small></div>
            {isObs
              ? <div><span>Before vs normal</span><strong style={{ fontSize: 16 }}>{formatValue(signal, obs?.pre_episode_mean)} / {formatValue(signal, obs?.baseline_mean)}</strong><small>Average {plain(signal)}</small></div>
              : <div><span>A vs B</span><strong style={{ fontSize: 16 }}>{formatValue(signal, iv?.mean_a)} / {formatValue(signal, iv?.mean_b)}</strong><small>Average {plain(signal)}</small></div>}
            <div><span>Data</span><strong>{results.n_days} days</strong><small>{isObs ? `${nUnits} episodes` : `${nUnits} periods`}</small></div>
          </div>
          <p className="method-note">
            <Icon name="flask" size={16} />
            <span><b>Interpretation:</b> {interpretation(results, signal)}</span>
          </p>
          <div className="row mt">
            {results.warnings.map((w) => <span key={w} className="chip warn"><Icon name="info" size={13} />{warningLabel(w)}</span>)}
            {results.warnings.length === 0 && <span className="chip"><Icon name="check" size={13} />No data warnings</span>}
          </div>
          <div className="disclaimer mt"><Icon name="shield" size={16} /><span><strong>Not diagnostic.</strong> Results describe this one patient over this window and are worth discussing with them.</span></div>
        </article>
        {aside}
      </section>
    </div>
  )
}

function interpretation(r: Results, signal: string) {
  const what = plain(signal)
  switch (r.verdict) {
    case 'likely_real': return r.type === 'observational'
      ? `Strong evidence that ${what} changes in the days before this patient's episodes, beyond what random timing would produce.`
      : `Strong evidence that the intervention changed this patient's ${what}, beyond what random A/B labeling would produce.`
    case 'suggestive': return `The effect points the hypothesized way but isn't strong enough to rule out chance. Consider a longer or repeated plan.`
    case 'probably_chance': return `An effect this size shows up routinely when the data is shuffled. There's no reliable evidence for the hypothesis in this window.`
    default: return `Too few ${r.type === 'observational' ? 'episodes' : 'periods per arm'} or too much missing data to judge. Extend the window or run the plan again.`
  }
}

function Summary({ icon, tone, k, v, s, small }: { icon: Parameters<typeof Icon>[0]['name']; tone: string; k: string; v: string; s: string; small?: boolean }) {
  return (
    <article className="summary-card">
      <div className={`summary-icon ${tone}`}><Icon name={icon} /></div>
      <div style={{ minWidth: 0 }}>
        <span className="k">{k}</span>
        <div className="v"><strong style={small ? { fontSize: 18 } : undefined}>{v}</strong></div>
        <small>{s}</small>
      </div>
    </article>
  )
}

function ChartHead({ k, v, sub, delta, good }: { k: string; v: string; sub?: string; delta?: number; good?: boolean }) {
  return (
    <div className="chart-head">
      <div>
        <span className="k">{k}</span>
        <div className="v">
          <strong>{v}</strong>
          {delta != null && <span className={`delta ${good ? 'good' : 'neutral'}`}>{pct(delta)}</span>}
        </div>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  )
}

function ModelPanel({ results }: { results: Results }) {
  const m = results.model!
  if (!m.trained) {
    const why: Record<string, [string, string]> = {
      no_primary_signal: ['No candidate signal from the screening test',
        "No risk model was fit. The screening test found no signal beyond chance, and fitting a multi-signal model anyway would be fishing for patterns that aren't there."],
      too_few_episodes: ['Too few episodes to train a model',
        'A personal risk model needs at least 8 episodes. Extend the window or run the plan again later.'],
    }
    const [title, body] = why[m.reason ?? ''] ?? ['No risk model', `The model wasn't trained: ${m.reason ?? 'not enough data'}.`]
    return (
      <div className="insight" style={{ marginTop: 4 }}>
        <span><Icon name="info" size={17} /></span>
        <p><strong>{title}</strong>{body}</p>
      </div>
    )
  }
  const technical = `${m.kind === 'logistic_l2' ? 'L2 logistic regression' : m.kind} · AUC ${m.auc?.toFixed(2) ?? '—'}${m.auc_null_p != null ? ` (vs chance p = ${m.auc_null_p.toFixed(3)})` : ''}`
  return (
    <>
      <ChartHead k="Chance of an episode tomorrow" v={m.risk_tomorrow != null ? `${Math.round(m.risk_tomorrow * 100)}%` : '—'}
        sub={m.plain ?? technical} />
      {(m.quality || m.beats_chance != null) && (
        <div className="row" style={{ gap: 8, margin: '2px 0 12px' }}>
          {m.quality && <span className={`pill ${m.quality === 'strong' ? 'pill-green' : m.quality === 'moderate' ? 'pill-purple' : 'pill-gray'}`}>{m.quality[0].toUpperCase() + m.quality.slice(1)} model</span>}
          {m.beats_chance != null && <span className={`pill ${m.beats_chance ? 'pill-green' : 'pill-yellow'}`}>{m.beats_chance ? 'Predicts better than chance' : 'No better than chance'}</span>}
        </div>
      )}
      <div className="chart-sub">What drives the prediction. A bar to the left means lower values raise episode risk.</div>
      <CoefficientChart coefficients={m.coefficients} />
      <p className="muted small">Exploratory. Not validated for clinical use.</p>
      {m.plain && <details className="tech-details"><summary>Technical details</summary>{technical}</details>}
    </>
  )
}

// ======================= patient =======================

function PatientResults({ results, plan }: { results: Results; plan?: Plan | null }) {
  const { signal } = describe(results, plan)
  const iv = results.intervention
  const cfg = plan?.intervention
  const passed = results.p_value < 0.05
  return (
    <div className="stack">
      <div className="card">
        <p className="eyebrow">Your result</p>
        <h1 style={{ marginBottom: 16 }}>{plan?.title ?? 'Your test'}</h1>
        <div className="verdict-hero">
          <VerdictBadge verdict={results.verdict} patient />
        </div>
        <p className="headline" style={{ marginTop: 14, fontSize: 21, lineHeight: 1.45 }}>{results.patient_headline}</p>
        {results.warnings.includes('not_randomized') && (
          <div className="alert alert-warn mt" role="note" style={{ borderWidth: 2, fontWeight: 600 }}>
            <Icon name="info" /><span>Your clinician chose which days were A and which were B, so this isn't a randomized result. Other things going on could explain the difference.</span>
          </div>
        )}
        {!results.complete && <div className="alert alert-warn mt"><Icon name="info" /><span>You stopped this test early, so these results are incomplete.</span></div>}
      </div>

      <section className="bottom-grid">
        <article className="card">
          <div className="card-title">
            <div>
              <h3 style={{ fontSize: 18 }}>What we looked at</h3>
              <p style={{ fontSize: 14.5 }}>
                {results.type === 'observational'
                  ? `Your ${plain(signal)} each day. Red lines are days you had an episode.`
                  : `Your average ${plain(signal)} during "${cfg?.arm_a ?? 'A'}" and "${cfg?.arm_b ?? 'B'}" periods.`}
              </p>
            </div>
          </div>
          {results.type === 'observational'
            ? <SignalChart series={results.series} signal={signal} height={260} showWindows={false} color={SIGNAL_COLOR[signal]} stoppedEarly={!results.complete} collectedUntil={results.collected_until} windowEnd={plan?.window.end} />
            : iv && <ABMeansChart meanA={iv.mean_a} meanB={iv.mean_b} signal={signal} armA={cfg?.arm_a ?? 'A'} armB={cfg?.arm_b ?? 'B'} height={140} />}
        </article>
        <aside className="card">
          <div className="card-title"><div><h3 style={{ fontSize: 18 }}>Could this be chance?</h3></div></div>
          <div className="donut-row" style={{ paddingTop: 4 }}>
            <ChanceDonut p={results.p_value} />
            <p style={{ margin: 0, fontSize: 15.5, color: '#4c4c58' }}>
              We mixed up your data {results.n_permutations.toLocaleString()} times.
              {passed
                ? ` A pattern this strong showed up ${shufflePct(results.p_value).startsWith('<') ? shufflePct(results.p_value).replace('<', 'less than ') : `only ${shufflePct(results.p_value)}`} of the time, so it's unlikely to be luck.`
                : ` A pattern like this showed up ${shufflePct(results.p_value)} of the time, so it could easily be luck.`}
            </p>
          </div>
          <div className="row">
            <span className="chip">{results.type === 'observational' ? `${results.n_episodes ?? 0} episodes` : `${(iv?.n_periods_a ?? 0) + (iv?.n_periods_b ?? 0)} periods`}</span>
            <span className="chip">{results.n_days} days</span>
          </div>
        </aside>
      </section>

      <div className="disclaimer" style={{ fontSize: 15 }}><Icon name="shield" size={17} /><span><strong>This is not a diagnosis.</strong> It's worth discussing with your clinician, who sees the same result.</span></div>
    </div>
  )
}
