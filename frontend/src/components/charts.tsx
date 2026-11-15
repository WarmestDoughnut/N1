import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LagScanEntry, PeriodMean, ResultSeriesPoint } from '../types'
import { formatDateShort, formatValue, pct, signalLabel } from '../lib/util'

export const C = {
  accent: '#6258df',
  window: '#fde4e5',
  episode: '#e05a5f',
  a: '#6258df',
  b: '#e0782f',
  washout: '#b8b9c5',
  grid: '#ececf1',
  axis: '#8c8d99',
  bar: '#d9d7f7',
  barStrong: '#6258df',
  nul: '#e2e1ea',
  nulStrong: '#9b95ea',
}

const axisProps = { tick: { fontSize: 12, fill: C.axis }, axisLine: false, tickLine: false } as const

function runs<T>(items: T[], key: (t: T) => string | null): { k: string; from: number; to: number }[] {
  const out: { k: string; from: number; to: number }[] = []
  items.forEach((it, i) => {
    const k = key(it)
    if (k == null) return
    const last = out[out.length - 1]
    if (last && last.k === k && last.to === i - 1) last.to = i
    else out.push({ k, from: i, to: i })
  })
  return out
}

const tickEvery = (n: number) => Math.max(0, Math.ceil(n / 8) - 1)
const yFmt = (signal: string) => (v: number) => (signal === 'sleep_min' ? `${Math.round((v / 60) * 10) / 10}h` : String(Math.round(v)))

// ---------- observational: signal over time ----------
export function SignalChart({ series, signal, baseline, height = 280, showWindows = true, color = C.accent }: {
  series: ResultSeriesPoint[]; signal: string; baseline?: number | null; height?: number; showWindows?: boolean; color?: string
}) {
  // Pre-episode windows are drawn as full-height background bars (works for 1-day windows too).
  const data = series.map((p) => ({ ...p, win: showWindows && p.in_window ? 1 : null }))
  const episodes = series.filter((p) => p.episode)
  const gid = `g-${signal}-${color.slice(1)}`
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -6 }} barCategoryGap={0}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDateShort} interval={tickEvery(data.length)} {...axisProps} />
          <YAxis domain={['auto', 'auto']} width={52} tickFormatter={yFmt(signal)} {...axisProps} />
          {showWindows && <YAxis yAxisId="win" hide domain={[0, 1]} />}
          {showWindows && <Bar yAxisId="win" dataKey="win" fill={C.window} barSize={1000} maxBarSize={14} isAnimationActive={false} />}
          {episodes.map((e) => (
            <ReferenceLine key={e.date} x={e.date} stroke={C.episode} strokeWidth={1.6} strokeDasharray="3 3" />
          ))}
          {baseline != null && <ReferenceLine y={baseline} stroke="#b8b9c5" strokeWidth={2} strokeDasharray="5 6" />}
          <Tooltip
            labelFormatter={(d) => formatDateShort(String(d))}
            formatter={(v: number, k) => (k === 'win' ? ['yes', 'Before an episode'] : [formatValue(signal, v), signalLabel(signal)])}
          />
          <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gid})`} connectNulls isAnimationActive={false} tooltipType="none" />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.4} dot={false} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i style={{ background: color }} />{signalLabel(signal)}</span>
        <span><i style={{ background: C.episode, width: 3, height: 12 }} />Episode</span>
        {showWindows && <span><i className="box" style={{ background: C.window }} />Days before an episode</span>}
        {baseline != null && <span><i className="dashed" />Normal-day average</span>}
      </div>
    </div>
  )
}

// ---------- observational: lag scan ----------
export function LagScanChart({ lagScan, best }: { lagScan: LagScanEntry[]; best: number }) {
  const data = lagScan.map((l) => ({ ...l, name: `${l.lag_days} day${l.lag_days > 1 ? 's' : ''} before` }))
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 26, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis tickFormatter={(v) => `${v}%`} width={48} {...axisProps}
          domain={[(min: number) => Math.floor(Math.min(0, min) - 1), (max: number) => Math.ceil(Math.max(0, max) + 1)]} />
        <ReferenceLine y={0} stroke="#c9c9d3" />
        <Tooltip formatter={(v: number, k) => (k === 'effect_pct' ? [pct(v), 'Difference vs normal days'] : [v, k])} />
        <Bar dataKey="effect_pct" isAnimationActive={false} radius={[6, 6, 6, 6]} maxBarSize={90}>
          {data.map((d) => <Cell key={d.lag_days} fill={d.lag_days === best ? C.barStrong : C.bar} />)}
          <LabelList dataKey="p_value" position="top" formatter={(p: number) => `p = ${p < 0.001 ? '<0.001' : p.toFixed(3)}`} style={{ fontSize: 12, fill: '#5d5e6b', fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------- permutation null histogram ----------
export function NullHistogram({ nulls, observed, sign, height = 200 }: { nulls: number[]; observed: number; sign: 1 | -1; height?: number }) {
  if (!nulls.length) return <div className="muted small">No shuffle distribution provided.</div>
  const lo = Math.min(...nulls, observed)
  const hi = Math.max(...nulls, observed)
  const nb = 28
  const w = (hi - lo) / nb || 1
  const bins = Array.from({ length: nb }, (_, i) => ({ x: lo + (i + 0.5) * w, n: 0 }))
  nulls.forEach((v) => { bins[Math.min(nb - 1, Math.floor((v - lo) / w))].n++ })
  const obsBin = bins[Math.min(nb - 1, Math.floor((observed - lo) / w))]
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={bins} margin={{ top: 26, right: 22, bottom: 0, left: 22 }} barCategoryGap={1}>
          <XAxis dataKey="x" type="category" tickFormatter={(v: number) => `${Math.round(v)}%`} interval={6} {...axisProps} />
          <YAxis hide />
          <Tooltip formatter={(v: number) => [v, 'shuffles']} labelFormatter={(x) => `≈ ${pct(Number(x), 0)}`} />
          <Bar dataKey="n" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {bins.map((b) => <Cell key={b.x} fill={sign * b.x >= sign * observed ? C.nulStrong : C.nul} />)}
          </Bar>
          <ReferenceLine x={obsBin.x} stroke={C.episode} strokeWidth={3}
            label={{ value: `This patient: ${pct(observed)}`, position: observed < (lo + hi) / 2 ? 'insideTopLeft' : 'insideTopRight', fill: C.episode, fontSize: 12.5, fontWeight: 700 }} />
        </BarChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i className="box" style={{ background: C.nul }} />Random shuffles</span>
        <span><i className="box" style={{ background: C.nulStrong }} />At least as strong</span>
        <span><i style={{ background: C.episode, width: 3, height: 12 }} />Real result</span>
      </div>
    </div>
  )
}

// ---------- intervention: outcome colored by arm ----------
export function ArmSeriesChart({ series, signal, height = 280 }: { series: ResultSeriesPoint[]; signal: string; height?: number }) {
  const data = series.map((p) => ({
    date: p.date,
    A: p.arm === 'A' ? p.value : null,
    B: p.arm === 'B' ? p.value : null,
    W: p.arm === 'washout' ? p.value : null,
  }))
  const bands = runs(series, (p) => p.arm)
  const fill: Record<string, string> = { A: '#eeecfc', B: '#fdeee2', washout: '#f6f6f9' }
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -6 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDateShort} interval={tickEvery(data.length)} {...axisProps} />
          <YAxis domain={['auto', 'auto']} width={52} tickFormatter={yFmt(signal)} {...axisProps} />
          {bands.map((b) => (
            <ReferenceArea key={b.from} x1={series[b.from].date} x2={series[b.to].date} fill={fill[b.k] ?? '#fff'} fillOpacity={1} ifOverflow="extendDomain" />
          ))}
          <Tooltip labelFormatter={(d) => formatDateShort(String(d))}
            formatter={(v: number, k) => [formatValue(signal, v), k === 'W' ? 'Washout' : `Arm ${k}`]} />
          <Line dataKey="A" stroke={C.a} strokeWidth={2.6} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="B" stroke={C.b} strokeWidth={2.6} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="W" stroke={C.washout} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PeriodMeansChart({ periodMeans, signal, armA, armB, height = 230 }: { periodMeans: PeriodMean[]; signal: string; armA: string; armB: string; height?: number }) {
  const data = periodMeans.map((p) => ({ ...p, name: `P${p.period}` }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis domain={['auto', 'auto']} width={52} tickFormatter={yFmt(signal)} {...axisProps} />
        <Tooltip formatter={(v: number, _k, item) => [formatValue(signal, v), (item?.payload as PeriodMean)?.arm === 'A' ? armA : armB]} />
        <Bar dataKey="mean" isAnimationActive={false} radius={[6, 6, 0, 0]} maxBarSize={46}>
          {data.map((d) => <Cell key={d.period} fill={d.arm === 'A' ? C.a : C.b} />)}
          <LabelList dataKey="arm" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#5d5e6b' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ABMeansChart({ meanA, meanB, signal, armA, armB, height = 150 }: {
  meanA: number; meanB: number; signal: string; armA: string; armB: string; height?: number
}) {
  const data = [
    { name: `A · ${armA}`, v: meanA, arm: 'A' },
    { name: `B · ${armB}`, v: meanB, arm: 'B' },
  ]
  const lo = Math.min(meanA, meanB)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }}>
        <XAxis type="number" hide domain={[Math.max(0, lo * 0.8), 'auto']} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 13.5, fill: '#4c4c58', fontWeight: 600 }} axisLine={false} tickLine={false} />
        <Bar dataKey="v" isAnimationActive={false} radius={[0, 8, 8, 0]} barSize={30}>
          {data.map((d) => <Cell key={d.arm} fill={d.arm === 'A' ? C.a : C.b} />)}
          <LabelList dataKey="v" position="right" formatter={(v: number) => formatValue(signal, v)} style={{ fontSize: 14, fontWeight: 700, fill: '#2f2f3b' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CoefficientChart({ coefficients }: { coefficients: { feature: string; weight: number }[] }) {
  const data = [...coefficients].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 50, bottom: 4, left: 4 }}>
        <XAxis type="number" {...axisProps} />
        <YAxis type="category" dataKey="feature" width={160} tick={{ fontSize: 12.5, fill: '#4c4c58' }} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke="#c9c9d3" />
        <Bar dataKey="weight" isAnimationActive={false} radius={4} barSize={22}>
          {data.map((d) => <Cell key={d.feature} fill={d.weight < 0 ? C.a : C.b} />)}
          <LabelList dataKey="weight" position="right" formatter={(v: number) => v.toFixed(2)} style={{ fontSize: 12, fill: '#5d5e6b' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
