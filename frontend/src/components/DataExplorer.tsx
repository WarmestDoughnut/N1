import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { api } from '../api'
import type { Patient, PatientSeries, Plan, SeriesRow, SignalId } from '../types'
import { useAsync } from '../lib/hooks'
import { addDays, formatDate, formatDateShort, formatValue, SIGNAL_INFO, signalLabel } from '../lib/util'
import { v15, type Symptom } from '../lib/v15'
import { SIGNAL_COLOR } from './Icon'
import { C } from './charts'
import { StatusChip } from './Verdict'

/* Data & graphs tab (overhaul fe-main #7 item 7; backend B4). Pick a shared collection or test,
 * pick variables and a chart. Data comes only from that plan's consented signals and window
 * (scope-enforced `GET /api/patients/{id}/series?plan_id=`), with symptom logs as `symptom:<id>` 0/1. */

type ChartKind = 'line' | 'weekly' | 'scatter'
const SHARED = ['active', 'paused', 'complete', 'stopped']
const axis = { tick: { fontSize: 11.5, fill: C.axis }, axisLine: false, tickLine: false } as const
const label = (s: string) => SIGNAL_INFO[s as SignalId]?.label ?? signalLabel(s)
const colorOf = (s: string) => SIGNAL_COLOR[s] ?? C.accent
/** compact axis ticks (tooltips keep the full formatValue) */
const tick = (s: string) => (v: number) => (s === 'sleep_min' ? `${Math.round((v / 60) * 10) / 10}h` : Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10))

export function DataExplorer({ patient }: { patient: Patient }) {
  const plansQ = useAsync<Plan[]>(() => api.listPlans(patient.id), [patient.id])
  const symQ = useAsync<Symptom[]>(() => v15.symptoms(patient.id), [patient.id])
  const sources = (plansQ.data ?? []).filter((p) => SHARED.includes(p.status)).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const [planId, setPlanId] = useState('')
  const plan = sources.find((p) => p.id === planId) ?? null
  const choices = (plan?.signals ?? []).filter((s) => s !== 'episode')
  const [vars, setVars] = useState<SignalId[]>([])
  const [kind, setKind] = useState<ChartKind>('line')
  const [marks, setMarks] = useState(true)
  const [xVar, setXVar] = useState<SignalId | ''>('')
  const [yVar, setYVar] = useState<SignalId | ''>('')

  const pick = (id: string) => { setPlanId(id); setVars([]); setXVar(''); setYVar('') }
  const toggle = (s: SignalId) => setVars((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))
  const need = kind === 'scatter' ? ([xVar, yVar].filter(Boolean) as SignalId[]) : vars
  const seriesQ = useAsync<PatientSeries | null>(
    () => (plan && need.length ? api.series(patient.id, [...new Set(need)], plan.id) : Promise.resolve(null)),
    [plan?.id, need.join(',')],
  )
  const rows = seriesQ.data?.rows ?? []
  const symptomKeys = rows.length ? Object.keys(rows[0]).filter((k) => k.startsWith('symptom:')) : []
  const symName = (k: string) => symQ.data?.find((s) => `symptom:${s.id}` === k)?.name ?? 'Symptom'
  const symptomDays = useMemo(() => rows.filter((r) => symptomKeys.some((k) => (r as unknown as Record<string, unknown>)[k] === 1)).map((r) => r.date), [rows, symptomKeys.join(',')])

  return (
    <div className="stack">
      <div><h3 style={{ margin: 0, fontSize: 18 }}>Data & graphs</h3><span className="muted small">Only data the patient shared, for the signals and dates they approved.</span></div>

      <article className="card stack" style={{ gap: 14 }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="dx-src">Data from</label>
          <select id="dx-src" value={planId} onChange={(e) => pick(e.target.value)}>
            <option value="">Choose a collection or test…</option>
            {sources.map((p) => <option key={p.id} value={p.id}>{p.title} · {formatDate(p.window.start)} – {formatDate(p.window.end)}</option>)}
          </select>
          {plansQ.data && sources.length === 0 && <span className="hint">No shared data yet. Data appears once the patient approves a collection or test.</span>}
        </div>

        {plan && (
          <>
            <div className="row" style={{ gap: 8 }}><StatusChip status={plan.status} /><span className="muted small">{plan.signals.map(label).join(', ')}</span></div>
            <div>
              <span className="td-slot-label">Chart</span>
              <div className="seg" style={{ marginTop: 6 }}>
                {([['line', 'Over time'], ['weekly', 'Weekly averages'], ['scatter', 'X vs Y']] as [ChartKind, string][]).map(([k, l]) => (
                  <button key={k} type="button" className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{l}</button>
                ))}
              </div>
            </div>
            {kind !== 'scatter' ? (
              <div>
                <span className="td-slot-label">Variables</span>
                <div className="td-tray-row" style={{ marginTop: 6 }}>
                  {choices.map((s) => <button key={s} type="button" className={`td-chip ${vars.includes(s) ? 'on' : ''}`} aria-pressed={vars.includes(s)} onClick={() => toggle(s)}><strong>{label(s)}</strong></button>)}
                </div>
              </div>
            ) : (
              <div className="td-inline" style={{ fontSize: 14 }}>
                <label htmlFor="dx-x">X</label>
                <select id="dx-x" value={xVar} onChange={(e) => setXVar(e.target.value as SignalId)} style={{ width: 'auto' }}>
                  <option value="">Choose…</option>{choices.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
                <label htmlFor="dx-y">Y</label>
                <select id="dx-y" value={yVar} onChange={(e) => setYVar(e.target.value as SignalId)} style={{ width: 'auto' }}>
                  <option value="">Choose…</option>{choices.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
              </div>
            )}
            {rows.length > 0 && symptomKeys.length === 0
              ? <span className="muted small">No symptom log was shared with this data, so symptom days can't be marked.</span>
              : (
                <label className="row" style={{ gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} style={{ width: 'auto' }} />
                  Mark logged symptom days{symptomKeys.length ? ` (${symptomKeys.map(symName).join(', ')})` : ''}
                </label>
              )}
          </>
        )}
      </article>

      {plan && need.length === 0 && <div className="muted small">{kind === 'scatter' ? 'Choose X and Y.' : 'Choose one or more variables.'}</div>}
      {seriesQ.error && <div className="alert alert-error">{seriesQ.error}</div>}
      {seriesQ.loading && need.length > 0 && <div className="spinner">Loading data…</div>}
      {rows.length > 0 && kind === 'line' && vars.map((s) => <LineCard key={s} rows={rows} signal={s} marks={marks ? symptomDays : []} />)}
      {rows.length > 0 && kind === 'weekly' && <WeeklyCard rows={rows} vars={vars} symptomDays={marks ? symptomDays : null} />}
      {rows.length > 0 && kind === 'scatter' && xVar && yVar && <ScatterCard rows={rows} x={xVar} y={yVar} symptomDays={marks ? new Set(symptomDays) : null} />}
    </div>
  )
}

function LineCard({ rows, signal, marks }: { rows: SeriesRow[]; signal: SignalId; marks: string[] }) {
  return (
    <article className="card">
      <div className="chart-title">{label(signal)}</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDateShort} minTickGap={24} {...axis} />
          <YAxis domain={['auto', 'auto']} width={52} tickFormatter={tick(signal)} {...axis} />
          <Tooltip labelFormatter={(d) => formatDate(String(d))} formatter={(v: number) => [formatValue(signal, v), label(signal)]} />
          {marks.map((d) => <ReferenceLine key={d} x={d} stroke={C.episode} strokeDasharray="3 3" />)}
          <Line type="monotone" dataKey={signal} stroke={colorOf(signal)} strokeWidth={2.2} dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      {marks.length > 0 && <div className="legend"><span><i style={{ background: C.episode, width: 3, height: 12 }} />Logged symptom day</span></div>}
    </article>
  )
}

/** Monday-start weekly means per variable (+ symptom days per week when marked). */
function WeeklyCard({ rows, vars, symptomDays }: { rows: SeriesRow[]; vars: SignalId[]; symptomDays: string[] | null }) {
  const weeks = useMemo(() => {
    const out = new Map<string, Record<string, number | string>>()
    rows.forEach((r) => {
      const d = new Date(r.date + 'T00:00:00Z')
      const wk = addDays(r.date, -((d.getUTCDay() + 6) % 7))
      const o = out.get(wk) ?? { week: wk }
      vars.forEach((s) => {
        const v = r[s as keyof SeriesRow]
        if (typeof v === 'number') { o[`${s}__sum`] = ((o[`${s}__sum`] as number) ?? 0) + v; o[`${s}__n`] = ((o[`${s}__n`] as number) ?? 0) + 1 }
      })
      if (symptomDays?.includes(r.date)) o.symptoms = ((o.symptoms as number) ?? 0) + 1
      out.set(wk, o)
    })
    return [...out.values()].map((o) => {
      const row: Record<string, number | string | null> = { week: o.week, symptoms: (o.symptoms as number) ?? 0 }
      vars.forEach((s) => { row[s] = o[`${s}__n`] ? Math.round(((o[`${s}__sum`] as number) / (o[`${s}__n`] as number)) * 10) / 10 : null })
      return row
    })
  }, [rows, vars.join(','), symptomDays])
  return (
    <>
      {vars.map((s) => (
        <article key={s} className="card">
          <div className="chart-title">{label(s)} · weekly average</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="week" tickFormatter={(w: string) => `wk of ${formatDateShort(w)}`} minTickGap={16} {...axis} />
              <YAxis domain={['auto', 'auto']} width={52} tickFormatter={tick(s)} {...axis} />
              <Tooltip labelFormatter={(w) => `Week of ${formatDate(String(w))}`} formatter={(v: number) => [formatValue(s, v), label(s)]} />
              <Bar dataKey={s} fill={colorOf(s)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </article>
      ))}
      {symptomDays && (
        <article className="card">
          <div className="chart-title">Logged symptom days per week</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="week" tickFormatter={(w: string) => formatDateShort(w)} minTickGap={16} {...axis} />
              <YAxis allowDecimals={false} width={40} {...axis} />
              <Tooltip labelFormatter={(w) => `Week of ${formatDate(String(w))}`} formatter={(v: number) => [v, 'symptom days']} />
              <Bar dataKey="symptoms" fill={C.episode} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </article>
      )}
    </>
  )
}

function ScatterCard({ rows, x, y, symptomDays }: { rows: SeriesRow[]; x: SignalId; y: SignalId; symptomDays: Set<string> | null }) {
  const pts = rows.filter((r) => typeof r[x as keyof SeriesRow] === 'number' && typeof r[y as keyof SeriesRow] === 'number')
    .map((r) => ({ x: r[x as keyof SeriesRow] as number, y: r[y as keyof SeriesRow] as number, date: r.date, sym: !!symptomDays?.has(r.date) }))
  const normal = pts.filter((p) => !p.sym), sym = pts.filter((p) => p.sym)
  return (
    <article className="card">
      <div className="chart-title">{label(y)} vs {label(x)} <span className="muted small">· {pts.length} days with both</span></div>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 12, left: -6 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 5" />
          <XAxis type="number" dataKey="x" name={label(x)} domain={['auto', 'auto']} tickFormatter={tick(x)} {...axis} />
          <YAxis type="number" dataKey="y" name={label(y)} domain={['auto', 'auto']} width={56} tickFormatter={tick(y)} {...axis} />
          <ZAxis range={[28, 28]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: number, n: string) => [formatValue(n === label(x) ? x : y, v), n]}
            labelFormatter={() => ''} />
          <Scatter name="Other days" data={normal} fill={C.accent} fillOpacity={0.55} isAnimationActive={false} />
          {sym.length > 0 && <Scatter name="Symptom days" data={sym} fill={C.episode} isAnimationActive={false} />}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i className="box" style={{ background: C.accent, opacity: 0.55 }} />Other days</span>
        {sym.length > 0 && <span><i className="box" style={{ background: C.episode }} />Logged symptom days</span>}
      </div>
      <p className="muted small" style={{ margin: '6px 0 0' }}>A picture of the data, not a test. To check a pattern against chance, run a pattern test.</p>
    </article>
  )
}
