import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { api } from '../api'
import type { Patient, PatientSeries, Plan, SignalId } from '../types'
import { useAsync } from '../lib/hooks'
import { addDays, daysBetween, formatDate, formatDateShort, formatValue, SIGNAL_INFO, signalLabel } from '../lib/util'
import { asOf, v15, type Symptom } from '../lib/v15'
import { SIGNAL_COLOR } from './Icon'
import { C } from './charts'

/* Data & graphs tab (fe-main #17, our human): ALL data the patient has shared, over the whole time frame,
 * any variables overlaid, a date range, and summary statistics per variable.
 *
 * Consent: only shared data. The plan-free `GET /series` is used only once the backend scopes it to shared
 * windows (to-backend #17: the response carries `shared_windows`). Until then we merge each shared plan's own
 * scope-enforced `/series?plan_id=` (window-clipped), so values outside every approved window stay null. */

type Row = Record<string, number | string | null> & { date: string }
type Mode = 'time' | 'weekly' | 'scatter'
const SHARED = ['active', 'paused', 'complete', 'stopped']
const axis = { tick: { fontSize: 11.5, fill: C.axis }, axisLine: false, tickLine: false } as const
const label = (s: string) => SIGNAL_INFO[s as SignalId]?.label ?? signalLabel(s)
const colorOf = (s: string, i: number) => SIGNAL_COLOR[s] ?? ['#6258df', '#e0782f', '#19a583', '#e9566b', '#ad7c28', '#3b82f6'][Math.max(0, i) % 6]
const tick = (s: string) => (v: number) => (s === 'sleep_min' ? `${Math.round((v / 60) * 10) / 10}h` : Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10))
const isSym = (k: string) => k.startsWith('symptom:') || k === 'episode'

/** Union of every shared plan's data (scope-enforced per plan). */
async function loadShared(patientId: string, plans: Plan[]): Promise<{ rows: Row[]; signals: SignalId[] }> {
  const shared = plans.filter((p) => SHARED.includes(p.status))
  if (!shared.length) return { rows: [], signals: [] }
  const sigs = [...new Set(shared.flatMap((p) => p.signals.filter((s) => s !== 'episode')))] as SignalId[]
  // Preferred: the backend's consent-scoped union (to-backend #17), recognised by `shared_windows`.
  try {
    const all = await api.series(patientId, sigs, '') as PatientSeries & { shared_windows?: unknown }
    if (all.shared_windows) return { rows: all.rows as unknown as Row[], signals: sigs }
  } catch { /* fall back */ }
  const today = asOf()
  const byDate = new Map<string, Row>()
  for (const p of shared) {
    const ps = p.signals.filter((s) => s !== 'episode') as SignalId[]
    if (!ps.length) continue
    let res: PatientSeries
    try { res = await api.series(patientId, ps, p.id) } catch { continue }
    for (const r of res.rows as unknown as Row[]) {
      if (r.date > today) continue
      const o = byDate.get(r.date) ?? ({ date: r.date } as Row)
      for (const [k, v] of Object.entries(r)) {
        if (k === 'date' || v == null) continue
        if (isSym(k)) o[k] = Math.max(Number(o[k] ?? 0), Number(v))
        else if (o[k] == null) o[k] = v as number
      }
      byDate.set(r.date, o)
    }
  }
  const dates = [...byDate.keys()].sort()
  if (!dates.length) return { rows: [], signals: sigs }
  // a continuous day axis (gaps = no shared data that day)
  const rows: Row[] = []
  for (let d = dates[0]; d <= dates[dates.length - 1]; d = addDays(d, 1)) rows.push(byDate.get(d) ?? ({ date: d } as Row))
  return { rows, signals: sigs }
}

// ---------- stats ----------
function stats(rows: Row[], s: string) {
  const vals = rows.map((r) => r[s]).filter((v): v is number => typeof v === 'number')
  const n = vals.length, days = rows.length
  if (!n) return { n, days, missing: 100, mean: null, median: null, sd: null, min: null, max: null, first: null, last: null }
  const sorted = [...vals].sort((a, b) => a - b)
  const mean = vals.reduce((a, b) => a + b, 0) / n
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0
  const avg = (part: Row[]) => { const v = part.map((r) => r[s]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  return { n, days, missing: Math.round(1000 * (1 - n / Math.max(1, days))) / 10, mean, median, sd, min: sorted[0], max: sorted[n - 1], first: avg(rows.slice(0, 7)), last: avg(rows.slice(-7)) }
}

export function DataExplorer({ patient }: { patient: Patient }) {
  const plansQ = useAsync<Plan[]>(() => api.listPlans(patient.id), [patient.id])
  const symQ = useAsync<Symptom[]>(() => v15.symptoms(patient.id), [patient.id])
  const shared = (plansQ.data ?? []).filter((p) => SHARED.includes(p.status)).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const [planId, setPlanId] = useState('')
  const dataQ = useAsync(
    () => (plansQ.data ? loadShared(patient.id, planId ? shared.filter((p) => p.id === planId) : plansQ.data) : Promise.resolve({ rows: [] as Row[], signals: [] as SignalId[] })),
    [patient.id, plansQ.data?.map((p) => `${p.id}:${p.status}`).join(','), planId],
  )
  const all = dataQ.data?.rows ?? []
  const signals = dataQ.data?.signals ?? []

  const [vars, setVars] = useState<SignalId[] | null>(null)
  const sel = (vars ?? signals).filter((s) => signals.includes(s)) // default: every shared signal
  const [mode, setMode] = useState<Mode>('time')
  const [norm, setNorm] = useState(false)
  const [marks, setMarks] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [xVar, setXVar] = useState<SignalId | ''>('')
  const [yVar, setYVar] = useState<SignalId | ''>('')
  useEffect(() => { setVars(null); setFrom(''); setTo('') }, [planId, patient.id])

  const first = all[0]?.date ?? '', last = all[all.length - 1]?.date ?? ''
  const lo = from || first, hi = to || last
  const rows = useMemo(() => all.filter((r) => r.date >= lo && r.date <= hi), [all, lo, hi])
  const symKeys = useMemo(() => [...new Set(all.flatMap((r) => Object.keys(r).filter((k) => k.startsWith('symptom:'))))], [all])
  const symDays = useMemo(() => rows.filter((r) => symKeys.some((k) => r[k] === 1)).map((r) => r.date), [rows, symKeys])
  const symName = (k: string) => symQ.data?.find((s) => `symptom:${s.id}` === k)?.name ?? 'symptom'
  const toggle = (s: SignalId) => setVars((v) => { const cur = v ?? signals; return cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] })
  const quick = (days: number | null) => {
    if (days == null) { setFrom(''); setTo(''); return }
    const f = addDays(last, -(days - 1))
    setFrom(f < first ? first : f); setTo(last)
  }
  // more than two variables with different units can only share one axis when normalized
  const mustNorm = sel.length > 2
  const useNorm = norm || mustNorm
  const firstName = patient.display_name.replace(/,.*$/, '')

  return (
    <div className="stack">
      <div><h3 style={{ margin: 0, fontSize: 18 }}>Data & graphs</h3><span className="muted small">Everything {firstName} has shared with you, over the whole time frame. Only approved signals and dates.</span></div>

      <article className="card stack" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 240, flex: 1 }}>
            <label htmlFor="dx-src">Data from</label>
            <select id="dx-src" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">All shared data</option>
              {shared.map((p) => <option key={p.id} value={p.id}>{p.title} · {formatDate(p.window.start)} – {formatDate(p.window.end)}</option>)}
            </select>
          </div>
          {all.length > 0 && (
            <div className="field" style={{ margin: 0 }}>
              <span className="label">Dates</span>
              <div className="td-inline" style={{ fontSize: 14, gap: 8 }}>
                <input type="date" aria-label="From" value={lo} min={first} max={hi} onChange={(e) => e.target.value && setFrom(e.target.value)} style={{ width: 'auto' }} />
                <span>to</span>
                <input type="date" aria-label="To" value={hi} min={lo} max={last} onChange={(e) => e.target.value && setTo(e.target.value)} style={{ width: 'auto' }} />
                {([['All', null], ['Last 30 days', 30], ['Last 90 days', 90]] as [string, number | null][]).map(([l, n]) => (
                  <button key={l} type="button" className="button secondary sm" onClick={() => quick(n)}>{l}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {plansQ.data && !dataQ.loading && all.length === 0 && (
          <div className="muted">Nothing shared yet. Data appears here once {firstName} approves a data request or test.</div>
        )}
        {(plansQ.loading || dataQ.loading) && !all.length && <div className="spinner">Loading shared data…</div>}

        {all.length > 0 && (
          <>
            <div>
              <span className="td-slot-label">Variables</span>
              <div className="td-tray-row" style={{ marginTop: 6 }}>
                {signals.map((s, i) => (
                  <button key={s} type="button" className={`td-chip ${sel.includes(s) ? 'on' : ''}`} aria-pressed={sel.includes(s)} onClick={() => toggle(s)}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(s, i), display: 'inline-block' }} /><strong>{label(s)}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="seg" role="tablist" aria-label="Chart">
                {([['time', 'Over time'], ['weekly', 'Weekly averages'], ['scatter', 'X vs Y']] as [Mode, string][]).map(([k, l]) => (
                  <button key={k} type="button" className={mode === k ? 'active' : ''} onClick={() => setMode(k)}>{l}</button>
                ))}
              </div>
              {mode === 'time' && (
                <label className="row" style={{ gap: 6, fontSize: 14, cursor: mustNorm ? 'default' : 'pointer' }} title={mustNorm ? 'More than two variables share one axis only when normalized' : undefined}>
                  <input type="checkbox" checked={useNorm} disabled={mustNorm} onChange={(e) => setNorm(e.target.checked)} style={{ width: 'auto' }} /> Normalize (z-score)
                </label>
              )}
              {symKeys.length > 0
                ? <label className="row" style={{ gap: 6, fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} style={{ width: 'auto' }} /> Mark logged {symKeys.map(symName).join(', ').toLowerCase()} days</label>
                : <span className="muted small">No symptom log was shared, so symptom days can't be marked.</span>}
            </div>
          </>
        )}
      </article>

      {all.length > 0 && sel.length === 0 && mode !== 'scatter' && <div className="muted small">Choose at least one variable.</div>}
      {all.length > 0 && sel.length > 0 && mode === 'time' && <OverlayChart rows={rows} vars={sel} signals={signals} norm={useNorm} marks={marks ? symDays : []} />}
      {all.length > 0 && sel.length > 0 && mode === 'weekly' && <WeeklyCards rows={rows} vars={sel} signals={signals} symptomDays={marks && symKeys.length ? symDays : null} />}
      {all.length > 0 && mode === 'scatter' && (
        <article className="card">
          <div className="td-inline" style={{ fontSize: 14 }}>
            <label htmlFor="dx-x">X</label>
            <select id="dx-x" value={xVar} onChange={(e) => setXVar(e.target.value as SignalId)} style={{ width: 'auto' }}><option value="">Choose…</option>{signals.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
            <label htmlFor="dx-y">Y</label>
            <select id="dx-y" value={yVar} onChange={(e) => setYVar(e.target.value as SignalId)} style={{ width: 'auto' }}><option value="">Choose…</option>{signals.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          </div>
          {xVar && yVar ? <ScatterView rows={rows} x={xVar} y={yVar} symptomDays={marks && symKeys.length ? new Set(symDays) : null} /> : <div className="muted small mt">Choose X and Y.</div>}
        </article>
      )}
      {all.length > 0 && sel.length > 0 && <StatsTable rows={rows} vars={sel} signals={signals} range={[lo, hi]} />}
    </div>
  )
}

function OverlayChart({ rows, vars, signals, norm, marks }: { rows: Row[]; vars: SignalId[]; signals: SignalId[]; norm: boolean; marks: string[] }) {
  // z-score per variable over the selected range, so different units share one axis
  const data = useMemo(() => {
    if (!norm) return rows
    const z: Record<string, { m: number; sd: number }> = {}
    vars.forEach((s) => { const st = stats(rows, s); z[s] = { m: st.mean ?? 0, sd: st.sd || 1 } })
    return rows.map((r) => {
      const o: Row = { date: r.date }
      vars.forEach((s) => { const v = r[s]; o[s] = typeof v === 'number' ? Math.round(((v - z[s].m) / z[s].sd) * 100) / 100 : null; o[`${s}__raw`] = typeof v === 'number' ? v : null })
      return o
    })
  }, [rows, vars.join(','), norm])
  const dual = !norm && vars.length === 2
  return (
    <article className="card">
      <div className="chart-title">{vars.map(label).join(' · ')} <span className="muted small">{norm ? '· normalized (0 = average, ±1 = one standard deviation)' : dual ? '· left and right axes' : ''}</span></div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: dual ? 4 : 12, bottom: 0, left: -6 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDateShort} minTickGap={28} {...axis} />
          {norm
            ? <YAxis yAxisId="l" domain={['auto', 'auto']} width={40} {...axis} />
            : <YAxis yAxisId="l" domain={['auto', 'auto']} width={52} tickFormatter={tick(vars[0])} {...axis} />}
          {dual && <YAxis yAxisId="r" orientation="right" domain={['auto', 'auto']} width={52} tickFormatter={tick(vars[1])} {...axis} />}
          <Tooltip labelFormatter={(d) => formatDate(String(d))}
            formatter={(v: number, n: string, item) => {
              const s = vars.find((x) => label(x) === n) ?? vars[0]
              const raw = norm ? (item?.payload as Row | undefined)?.[`${s}__raw`] : v
              return [typeof raw === 'number' ? formatValue(s, raw) : '—', n]
            }} />
          <Legend verticalAlign="bottom" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12.5 }} />
          {marks.map((d) => <ReferenceLine key={d} yAxisId="l" x={d} stroke={C.episode} strokeDasharray="3 3" strokeOpacity={0.7} />)}
          {vars.map((s, i) => (
            <Line key={s} yAxisId={dual && i === 1 ? 'r' : 'l'} type="monotone" dataKey={s} name={label(s)} stroke={colorOf(s, signals.indexOf(s))}
              strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {marks.length > 0 && <div className="legend"><span><i style={{ background: C.episode, width: 3, height: 12 }} />Logged symptom day</span></div>}
    </article>
  )
}

function WeeklyCards({ rows, vars, signals, symptomDays }: { rows: Row[]; vars: SignalId[]; signals: SignalId[]; symptomDays: string[] | null }) {
  const weeks = useMemo(() => {
    const out = new Map<string, Row[]>()
    rows.forEach((r) => { const d = new Date(r.date + 'T00:00:00Z'); const wk = addDays(r.date, -((d.getUTCDay() + 6) % 7)); out.set(wk, [...(out.get(wk) ?? []), r]) })
    return [...out.entries()].map(([wk, rs]) => {
      const o: Row = { date: wk, symptoms: symptomDays ? rs.filter((r) => symptomDays.includes(r.date)).length : 0 }
      vars.forEach((s) => { const m = stats(rs, s).mean; o[s] = m == null ? null : Math.round(m * 10) / 10 })
      return o
    })
  }, [rows, vars.join(','), symptomDays])
  return (
    <>
      {vars.map((s) => (
        <article key={s} className="card">
          <div className="chart-title">{label(s)} · weekly average</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(w: string) => formatDateShort(w)} minTickGap={16} {...axis} />
              <YAxis domain={['auto', 'auto']} width={52} tickFormatter={tick(s)} {...axis} />
              <Tooltip labelFormatter={(w) => `Week of ${formatDate(String(w))}`} formatter={(v: number) => [formatValue(s, v), label(s)]} />
              <Bar dataKey={s} fill={colorOf(s, signals.indexOf(s))} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </article>
      ))}
      {symptomDays && (
        <article className="card">
          <div className="chart-title">Logged symptom days per week</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(w: string) => formatDateShort(w)} minTickGap={16} {...axis} />
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

/** Ordinary least squares y = a + b·x, Pearson r, over paired days (fe-main #18). */
function fit(pts: { x: number; y: number }[]) {
  const n = pts.length
  if (n < 2) return null
  const mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  pts.forEach((p) => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2 })
  if (!sxx || !syy) return null
  const b = sxy / sxx, a = my - b * mx, r = sxy / Math.sqrt(sxx * syy)
  return { a, b, r, r2: r * r, n }
}
/** "per 1,000 steps", "per hour of sleep", … with the matching x step size */
function perX(x: SignalId, xs: number[]) {
  if (x === 'sleep_min') return { step: 60, text: 'per hour of sleep' }
  const range = Math.max(...xs) - Math.min(...xs)
  const step = range >= 5000 ? 1000 : range >= 500 ? 100 : range >= 50 ? 10 : 1
  const unit = SIGNAL_INFO[x]?.unit ?? ''
  return { step, text: `per ${step.toLocaleString()}${unit ? ` ${unit === 'steps' && step === 1 ? 'step' : unit}` : ''}${unit ? '' : ` ${label(x).toLowerCase()}`}` }
}
function deltaY(y: SignalId, v: number) {
  const sign = v >= 0 ? '+' : '−'
  if (y === 'sleep_min') return `${sign}${Math.abs(Math.round(v))} min`
  const unit = SIGNAL_INFO[y]?.unit ?? ''
  const mag = Math.abs(v) >= 100 ? Math.round(Math.abs(v)).toLocaleString() : (Math.round(Math.abs(v) * 10) / 10).toString()
  return `${sign}${mag}${unit ? ` ${unit}` : ` ${label(y).toLowerCase()}`}`
}

function ScatterView({ rows, x, y, symptomDays }: { rows: Row[]; x: SignalId; y: SignalId; symptomDays: Set<string> | null }) {
  const [showTrend, setShowTrend] = useState(true)
  const pts = rows.filter((r) => typeof r[x] === 'number' && typeof r[y] === 'number').map((r) => ({ x: r[x] as number, y: r[y] as number, sym: !!symptomDays?.has(r.date) }))
  const normal = pts.filter((p) => !p.sym), sym = pts.filter((p) => p.sym)
  const f = pts.length >= 10 ? fit(pts) : null
  const xs = pts.map((p) => p.x)
  const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 0
  const per = xs.length ? perX(x, xs) : null
  return (
    <>
      <div className="row-between mt" style={{ alignItems: 'baseline' }}>
        <div className="chart-title" style={{ margin: 0 }}>{label(y)} vs {label(x)} <span className="muted small">· {pts.length} days with both</span></div>
        <label className="row" style={{ gap: 6, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={showTrend} onChange={(e) => setShowTrend(e.target.checked)} style={{ width: 'auto' }} /> Show trend line
        </label>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 12, left: -6 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 5" />
          <XAxis type="number" dataKey="x" name={label(x)} domain={['auto', 'auto']} tickFormatter={tick(x)} {...axis} />
          <YAxis type="number" dataKey="y" name={label(y)} domain={['auto', 'auto']} width={56} tickFormatter={tick(y)} {...axis} />
          <ZAxis range={[28, 28]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: number, n: string) => [formatValue(n === label(x) ? x : y, v), n]} labelFormatter={() => ''} />
          <Scatter name="Other days" data={normal} fill={C.accent} fillOpacity={0.55} isAnimationActive={false} />
          {sym.length > 0 && <Scatter name="Symptom days" data={sym} fill={C.episode} isAnimationActive={false} />}
          {showTrend && f && (
            <ReferenceLine segment={[{ x: minX, y: f.a + f.b * minX }, { x: maxX, y: f.a + f.b * maxX }]} stroke="#242430" strokeWidth={2} ifOverflow="extendDomain" />
          )}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i className="box" style={{ background: C.accent, opacity: 0.55 }} />Other days</span>
        {sym.length > 0 && <span><i className="box" style={{ background: C.episode }} />Logged symptom days</span>}
        {showTrend && f && <span><i style={{ background: '#242430' }} />Trend line</span>}
      </div>
      {showTrend && (f && per
        ? <p className="dx-trend" style={{ margin: '8px 0 0', fontSize: 14.5 }}>
            <strong>Trend:</strong> {label(y)} {deltaY(y, f.b * per.step)} {per.text} · r = {f.r.toFixed(2)} · R² = {f.r2.toFixed(2)} · {f.n} days
          </p>
        : <p className="muted small" style={{ margin: '8px 0 0' }}>Not enough paired days for a trend (needs at least 10; {pts.length} here).</p>)}
      <p className="muted small" style={{ margin: '4px 0 0' }}>A trend shows how the two move together, not that one causes the other. To check a pattern against chance, run a pattern test.</p>
    </>
  )
}

function StatsTable({ rows, vars, signals, range }: { rows: Row[]; vars: SignalId[]; signals: SignalId[]; range: [string, string] }) {
  const f = (s: string, v: number | null) => (v == null ? '—' : formatValue(s, Math.round(v * 10) / 10))
  return (
    <article className="card">
      <div className="chart-title">Summary statistics <span className="muted small">· {formatDate(range[0])} – {formatDate(range[1])} ({daysBetween(range[0], range[1]) + 1} days)</span></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" aria-label="Summary statistics">
          <thead><tr><th>Variable</th><th>Days with data</th><th>Missing</th><th>Average</th><th>Median</th><th>SD</th><th>Min</th><th>Max</th><th>First → last week</th></tr></thead>
          <tbody>
            {vars.map((s) => {
              const st = stats(rows, s)
              const change = st.first != null && st.last != null && st.first !== 0 ? Math.round(((st.last - st.first) / Math.abs(st.first)) * 100) : null
              return (
                <tr key={s}>
                  <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(s, signals.indexOf(s)), display: 'inline-block' }} /><strong>{label(s)}</strong></span></td>
                  <td>{st.n} of {st.days}</td>
                  <td>{st.missing}%</td>
                  <td><strong>{f(s, st.mean)}</strong></td>
                  <td>{f(s, st.median)}</td>
                  <td>{f(s, st.sd)}</td>
                  <td>{f(s, st.min)}</td>
                  <td>{f(s, st.max)}</td>
                  <td>{f(s, st.first)} → {f(s, st.last)}{change != null && <span className="muted small"> ({change > 0 ? '+' : ''}{change}%)</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </article>
  )
}
