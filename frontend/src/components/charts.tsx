import {
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

const C = {
  line: '#1f2937',
  window: '#fde68a',
  episode: '#b91c1c',
  a: '#1d4ed8',
  b: '#c2410c',
  washout: '#9ca3af',
  bar: '#9ca3af',
  barStrong: '#1d4ed8',
  grid: '#e5e7eb',
}

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

function tickEvery(n: number) { return Math.max(0, Math.ceil(n / 8) - 1) }

// ---------- observational: signal over time ----------
export function SignalChart({ series, signal, height = 300, showWindows = true }: {
  series: ResultSeriesPoint[]; signal: string; height?: number; showWindows?: boolean
}) {
  // Pre-episode windows are drawn as full-height background bars (works for 1-day windows too).
  const data = series.map((p) => ({ ...p, win: showWindows && p.in_window ? 1 : null }))
  const episodes = series.filter((p) => p.episode)
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 4 }} barCategoryGap={0}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDateShort} interval={tickEvery(data.length)} tick={{ fontSize: 13 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 13 }} width={56}
            tickFormatter={(v) => (signal === 'sleep_min' ? `${Math.round(v / 60 * 10) / 10}h` : String(v))} />
          <YAxis yAxisId="win" hide domain={[0, 1]} />
          <Bar yAxisId="win" dataKey="win" fill={C.window} fillOpacity={0.8} barSize={1000} maxBarSize={14} isAnimationActive={false} />
          {episodes.map((e) => (
            <ReferenceLine key={e.date} x={e.date} stroke={C.episode} strokeWidth={2} strokeDasharray="4 3" />
          ))}
          <Tooltip
            labelFormatter={(d) => formatDateShort(String(d))}
            formatter={(v: number, k) => (k === 'win' ? ['yes', 'Before an episode'] : [formatValue(signal, v), signalLabel(signal)])}
          />
          <Line type="monotone" dataKey="value" stroke={C.line} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><span className="sw" style={{ background: C.line, height: 3, verticalAlign: 4 }} />{signalLabel(signal)}</span>
        <span><span className="sw" style={{ background: C.episode, width: 3 }} />Episode</span>
        {showWindows && <span><span className="sw" style={{ background: C.window }} />Days before an episode (compared)</span>}
      </div>
    </div>
  )
}

// ---------- observational: lag scan ----------
export function LagScanChart({ lagScan, best }: { lagScan: LagScanEntry[]; best: number }) {
  const data = lagScan.map((l) => ({ ...l, name: `${l.lag_days} day${l.lag_days > 1 ? 's' : ''} before` }))
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 13 }} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 13 }} width={48}
          domain={[(min: number) => Math.floor(Math.min(0, min) - 1), (max: number) => Math.ceil(Math.max(0, max) + 1)]} />
        <ReferenceLine y={0} stroke="#6b7280" />
        <Tooltip formatter={(v: number, k) => (k === 'effect_pct' ? [pct(v), 'Difference vs normal days'] : [v, k])}
          labelFormatter={(l) => String(l)} />
        <Bar dataKey="effect_pct" isAnimationActive={false} radius={[4, 4, 4, 4]}>
          {data.map((d) => <Cell key={d.lag_days} fill={d.lag_days === best ? C.barStrong : C.bar} />)}
          <LabelList dataKey="p_value" position="top" formatter={(p: number) => `p=${p < 0.001 ? '<0.001' : p.toFixed(3)}`} style={{ fontSize: 12, fill: '#374151' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------- permutation null histogram ----------
export function NullHistogram({ nulls, observed, sign }: { nulls: number[]; observed: number; sign: 1 | -1 }) {
  if (!nulls.length) return <div className="muted small">No shuffle distribution provided.</div>
  const lo = Math.min(...nulls, observed)
  const hi = Math.max(...nulls, observed)
  const nb = 28
  const w = (hi - lo) / nb || 1
  const bins = Array.from({ length: nb }, (_, i) => ({ x0: lo + i * w, x: lo + (i + 0.5) * w, n: 0 }))
  nulls.forEach((v) => { bins[Math.min(nb - 1, Math.floor((v - lo) / w))].n++ })
  const obsBin = bins[Math.min(nb - 1, Math.floor((observed - lo) / w))]
  return (
    <div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={bins} margin={{ top: 26, right: 24, bottom: 0, left: 24 }} barCategoryGap={1}>
          <XAxis dataKey="x" type="category" tickFormatter={(v: number) => `${Math.round(v)}%`} interval={6} tick={{ fontSize: 12 }} />
          <YAxis hide />
          <Tooltip formatter={(v: number) => [v, 'shuffles']} labelFormatter={(x) => `≈ ${pct(Number(x), 0)}`} />
          <Bar dataKey="n" isAnimationActive={false}>
            {bins.map((b) => (
              <Cell key={b.x} fill={sign * b.x >= sign * observed ? '#6b7280' : '#d1d5db'} />
            ))}
          </Bar>
          <ReferenceLine x={obsBin.x} stroke={C.episode} strokeWidth={3}
            label={{ value: `This patient: ${pct(observed)}`, position: observed < (lo + hi) / 2 ? 'insideTopLeft' : 'insideTopRight', fill: C.episode, fontSize: 13, fontWeight: 700 }} />
        </BarChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><span className="sw" style={{ background: '#d1d5db' }} />Random shuffles</span>
        <span><span className="sw" style={{ background: '#6b7280' }} />Shuffles at least as strong</span>
        <span><span className="sw" style={{ background: C.episode, width: 3 }} />Real result</span>
      </div>
    </div>
  )
}

// ---------- intervention: outcome colored by arm ----------
export function ArmSeriesChart({ series, signal, height = 300 }: { series: ResultSeriesPoint[]; signal: string; height?: number }) {
  const data = series.map((p) => ({
    date: p.date,
    A: p.arm === 'A' ? p.value : null,
    B: p.arm === 'B' ? p.value : null,
    W: p.arm === 'washout' ? p.value : null,
  }))
  const bands = runs(series, (p) => p.arm)
  const fill: Record<string, string> = { A: '#dbeafe', B: '#ffedd5', washout: '#f3f4f6' }
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDateShort} interval={tickEvery(data.length)} tick={{ fontSize: 13 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 13 }} width={56}
            tickFormatter={(v) => (signal === 'sleep_min' ? `${Math.round(v / 60 * 10) / 10}h` : String(v))} />
          {bands.map((b) => (
            <ReferenceArea key={b.from} x1={series[b.from].date} x2={series[b.to].date} fill={fill[b.k] ?? '#fff'} fillOpacity={0.9} ifOverflow="extendDomain" />
          ))}
          <Tooltip labelFormatter={(d) => formatDateShort(String(d))}
            formatter={(v: number, k) => [formatValue(signal, v), k === 'W' ? 'Washout' : `Arm ${k}`]} />
          <Line dataKey="A" stroke={C.a} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="B" stroke={C.b} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="W" stroke={C.washout} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PeriodMeansChart({ periodMeans, signal, armA, armB }: { periodMeans: PeriodMean[]; signal: string; armA: string; armB: string }) {
  const data = periodMeans.map((p) => ({ ...p, name: `P${p.period}` }))
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 22, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 13 }} />
        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 13 }} width={56}
          tickFormatter={(v) => (signal === 'sleep_min' ? `${Math.round(v / 60 * 10) / 10}h` : String(v))} />
        <Tooltip formatter={(v: number, _k, item) => [formatValue(signal, v), (item?.payload as PeriodMean)?.arm === 'A' ? armA : armB]} />
        <Bar dataKey="mean" isAnimationActive={false} radius={[4, 4, 0, 0]}>
          {data.map((d) => <Cell key={d.period} fill={d.arm === 'A' ? C.a : C.b} />)}
          <LabelList dataKey="arm" position="top" style={{ fontSize: 13, fontWeight: 800, fill: '#374151' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ABMeansChart({ meanA, meanB, signal, armA, armB, height = 200 }: {
  meanA: number; meanB: number; signal: string; armA: string; armB: string; height?: number
}) {
  const data = [
    { name: `A: ${armA}`, v: meanA, arm: 'A' },
    { name: `B: ${armB}`, v: meanB, arm: 'B' },
  ]
  const lo = Math.min(meanA, meanB)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 70, bottom: 4, left: 8 }}>
        <XAxis type="number" hide domain={[Math.max(0, lo * 0.8), 'auto']} />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 14, fontWeight: 600 }} />
        <Bar dataKey="v" isAnimationActive={false} radius={[0, 6, 6, 0]} barSize={36}>
          {data.map((d) => <Cell key={d.arm} fill={d.arm === 'A' ? C.a : C.b} />)}
          <LabelList dataKey="v" position="right" formatter={(v: number) => formatValue(signal, v)} style={{ fontSize: 14, fontWeight: 700, fill: '#111827' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CoefficientChart({ coefficients }: { coefficients: { feature: string; weight: number }[] }) {
  const data = [...coefficients].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 50, bottom: 4, left: 8 }}>
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="feature" width={170} tick={{ fontSize: 13 }} />
        <ReferenceLine x={0} stroke="#6b7280" />
        <Bar dataKey="weight" isAnimationActive={false}>
          {data.map((d) => <Cell key={d.feature} fill={d.weight < 0 ? C.a : C.b} />)}
          <LabelList dataKey="weight" position="right" formatter={(v: number) => v.toFixed(2)} style={{ fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
