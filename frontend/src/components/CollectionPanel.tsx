import { useState } from 'react'
import { api, friendlyError, ApiError } from '../api'
import type { Direction, Patient, Plan, SignalId } from '../types'
import { navigate, useAsync } from '../lib/hooks'
import { daysBetween, formatDate, signalLabel, SIGNAL_INFO } from '../lib/util'
import { ANALYSIS_ERRORS, isCollection, v15, v15Plan, type Analysis, type CollectionResults, type Symptom } from '../lib/v15'
import { resultsWithRetry } from './RunProgress'
import { ResultsView } from './ResultsView'
import { Icon } from './Icon'
import { StatusChip, VerdictBadge } from './Verdict'
import { Stepper } from './TestDesign'

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
      {collections.map((c) => <CollectionCard key={c.id} plan={c} patient={patient} />)}
    </div>
  )
}

function CollectionCard({ plan, patient }: { plan: Plan; patient: Patient }) {
  const finished = plan.status === 'complete' || plan.status === 'stopped'
  const resQ = useAsync<CollectionResults | null>(() => (finished ? resultsWithRetry(plan.id) as Promise<CollectionResults | null> : Promise.resolve(null)), [plan.id, finished])
  const [tick, setTick] = useState(0)
  const anQ = useAsync<Analysis[]>(() => (finished ? v15.analyses(plan.id) : Promise.resolve([])), [plan.id, finished, tick])
  const [designing, setDesigning] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const instructions = v15Plan(plan).instructions
  const sensors = plan.signals.filter((s) => s !== 'episode')
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

      {!finished && (
        <p className="muted small" style={{ marginBottom: 0 }}>
          {plan.status === 'pending_approval' ? 'Waiting for the patient to approve.' : plan.status === 'declined' ? 'The patient declined.' : 'Collecting. You can run tests once data is in.'}
        </p>
      )}

      {finished && (
        <>
          <div className="mt"><CollectionCoverage results={resQ.data ?? null} loading={resQ.loading} error={resQ.error} /></div>
          <div className="row-between mt">
            <strong style={{ fontSize: 15 }}>Tests run on this data</strong>
            {!designing && <button className="button primary sm" onClick={() => setDesigning(true)}><Icon name="flask" size={14} /> Run a test on this data</button>}
          </div>
          {designing && (
            <AnalysisForm plan={plan} patient={patient} sensors={sensors} onCancel={() => setDesigning(false)}
              onDone={(a) => { setDesigning(false); setTick((t) => t + 1); setOpenId(a.id) }} />
          )}
          {anQ.data && anQ.data.length === 0 && !designing && <div className="muted small" style={{ marginTop: 6 }}>None yet.</div>}
          {(anQ.data ?? []).slice().reverse().map((a) => (
            <div key={a.id} style={{ borderTop: '1px solid var(--border-2)', marginTop: 10, paddingTop: 10 }}>
              <button type="button" className="row-between" onClick={() => setOpenId(openId === a.id ? null : a.id)}
                style={{ width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                <span><strong style={{ fontSize: 14.5 }}>{analysisTitle(a)}</strong><span className="muted small"> · run {formatDate(a.created_at)}</span></span>
                <span className="row" style={{ gap: 8 }}>{a.verdict && <VerdictBadge verdict={a.verdict} small />}<Icon name="chevron" size={14} /></span>
              </button>
              {openId === a.id && <div className="mt"><ResultsView results={a} plan={{ ...plan, type: a.type, observational: a.type === 'observational' ? planObs(a) : null } as Plan} audience="clinician" /></div>}
            </div>
          ))}
        </>
      )}
    </article>
  )
}

const planObs = (a: Analysis) => (a.config?.observational ?? null) as Plan['observational']
function analysisTitle(a: Analysis) {
  const o = planObs(a)
  return o ? `${signalLabel(o.signal)} ${o.direction}, ${o.min_lag_days ?? 1}–${o.max_lag_days} days before` : a.type === 'observational' ? 'Pattern test' : 'A/B test'
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

/** Pattern test on collected data: symptom + signal + direction + look-back. */
function AnalysisForm({ plan, patient, sensors, onCancel, onDone }: {
  plan: Plan; patient: Patient; sensors: SignalId[]; onCancel: () => void; onDone: (a: Analysis) => void
}) {
  const symQ = useAsync<Symptom[]>(() => v15.symptoms(patient.id), [patient.id])
  const healthQ = useAsync(() => api.health(), [])
  const lagMax = parseFloat(healthQ.data?.contract_version ?? '1.4') >= 1.5 ? 30 : 14
  const loggable = (symQ.data ?? []).filter((x) => x.kind !== 'condition')
  const [symptomId, setSymptomId] = useState<string | null>(null)
  const [signal, setSignal] = useState<SignalId | null>(null)
  const [direction, setDirection] = useState<Direction | null>(null)
  const [minLag, setMinLag] = useState<number | null>(null)
  const [maxLag, setMaxLag] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // The chance check shifts episode dates by 7..n-7 days, so it needs a window of at least 15 days
  // (the backend currently 500s below that; reported as to-backend). Say so instead of calling it.
  const windowDays = daysBetween(plan.window.start, plan.window.end) + 1
  const tooShort = windowDays < 15
  const ready = !tooShort && !!symptomId && !!signal && !!direction && minLag != null && maxLag != null
  const run = async () => {
    if (!ready) return
    setBusy(true); setErr(null)
    try {
      const a = await v15.runAnalysis(plan.id, { observational: { signal: signal!, direction: direction!, min_lag_days: minLag!, max_lag_days: maxLag!, symptom_id: symptomId } })
      onDone(a)
    } catch (e) {
      setErr(e instanceof ApiError && ANALYSIS_ERRORS[e.code] ? ANALYSIS_ERRORS[e.code] : friendlyError(e))
      setBusy(false)
    }
  }
  const chip = (on: boolean) => `td-chip ${on ? 'on' : ''}`
  return (
    <div className="td-editor mt">
      <div className="td-editor-head"><strong>Pattern test on this data</strong><button type="button" className="button ghost sm" onClick={onCancel}>Cancel</button></div>
      <div>
        <span className="td-slot-label">1 · What you want to explain</span>
        <div className="td-tray-row" style={{ marginTop: 6 }}>
          {loggable.map((x) => <button key={x.id} type="button" className={chip(symptomId === x.id)} onClick={() => setSymptomId(x.id)}><strong>{x.name}</strong></button>)}
          {symQ.data && loggable.length === 0 && <span className="muted small">No symptoms logged for this patient yet.</span>}
        </div>
      </div>
      <div>
        <span className="td-slot-label">2 · What might come first</span>
        <div className="td-tray-row" style={{ marginTop: 6 }}>
          {sensors.map((s) => <button key={s} type="button" className={chip(signal === s)} onClick={() => setSignal(s)}><strong>{SIGNAL_INFO[s]?.label ?? s}</strong></button>)}
        </div>
        <div className="td-inline" style={{ marginTop: 8 }}>
          <span>Before episodes it is</span>
          <div className="seg">{(['lower', 'higher'] as Direction[]).map((d) => <button key={d} type="button" className={direction === d ? 'active' : ''} onClick={() => setDirection(d)}>{d}</button>)}</div>
          <span>than usual</span>
        </div>
      </div>
      <div>
        <span className="td-slot-label">3 · How far back</span>
        <div className="td-inline" style={{ marginTop: 6 }}>
          <span>Look back between</span>
          <Stepper label="Shortest look-back" value={minLag} min={1} max={maxLag ?? lagMax} onChange={(n) => { setMinLag(n); if (maxLag != null && maxLag < n) setMaxLag(n) }} />
          <span>and</span>
          <Stepper label="Longest look-back" value={maxLag} min={minLag ?? 1} max={lagMax} onChange={(n) => { setMaxLag(n); if (minLag != null && minLag > n) setMinLag(n) }} />
          <span>days</span>
        </div>
      </div>
      <p className="td-note">Uses only this collection’s data ({formatDate(plan.window.start)} – {formatDate(plan.window.end)}). A/B tests need a schedule the patient follows, so start those from New.</p>
      {tooShort && <div className="alert alert-warn" role="alert"><Icon name="info" />{ANALYSIS_ERRORS.window_too_short} ({windowDays} days; at least 15 are needed.)</div>}
      {err && <div className="alert alert-warn" role="alert"><Icon name="info" />{err}</div>}
      <div className="td-inline"><button type="button" className="button primary" disabled={!ready || busy} onClick={run}>{busy ? 'Running…' : 'Run test'}</button></div>
    </div>
  )
}
