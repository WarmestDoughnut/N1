import type { ReactNode } from 'react'
import type { SchedulePeriod } from '../types'
import { addDays, daysBetween, formatDateShort } from '../lib/util'

/* Building blocks for wizard step 4 ("Test design"), from FrontEndInspo/TestDesignStep.
 * Pure UI: PlanWizard owns all state. */

// ---------- slots ----------
export function Slot({ n, label, value, sub, open, onOpen, empty = false }: {
  n: number; label: string; value: ReactNode; sub?: ReactNode; open: boolean; onOpen: () => void
  /** nothing chosen yet: shown dashed, as a prompt */
  empty?: boolean
}) {
  return (
    <button type="button" className={`td-slot ${open ? 'open' : ''} ${empty ? 'empty' : ''}`} aria-expanded={open} onClick={onOpen}>
      <span className="td-slot-label">{n} · {label}</span>
      <span className="td-slot-value">{value}</span>
      {sub && <span className="td-slot-sub">{sub}</span>}
      <span className="td-slot-change">{open ? 'Editing' : empty ? 'Choose' : 'Change'}</span>
    </button>
  )
}

export function SlotEditor({ title, onDone, children }: { title: string; onDone: () => void; children: ReactNode }) {
  return (
    <div className="td-editor" role="region" aria-label={title}>
      <div className="td-editor-head">
        <strong>{title}</strong>
        <button type="button" className="button primary" onClick={onDone}>Done</button>
      </div>
      {children}
    </div>
  )
}

export function Stepper({ value, min, max, step = 1, onChange, label, disabled = false }: {
  /** null = not chosen yet (input shows empty; + / − start from the minimum) */
  value: number | null; min: number; max: number; step?: number; onChange: (n: number) => void; label: string; disabled?: boolean
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  return (
    <span className="td-stepper">
      <button type="button" aria-label={`Decrease ${label}`} disabled={disabled || value == null || value <= min} onClick={() => onChange(clamp((value ?? min) - step))}>−</button>
      <input type="number" aria-label={label} min={min} max={max} step={step} value={value ?? ''} placeholder="–" disabled={disabled}
        onChange={(e) => { if (e.target.value === '') return; const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(n) }}
        onBlur={(e) => { if (e.target.value !== '') onChange(clamp(Number(e.target.value) || min)) }} />
      <button type="button" aria-label={`Increase ${label}`} disabled={disabled || (value != null && value >= max)} onClick={() => onChange(value == null ? min : clamp(value + step))}>+</button>
    </span>
  )
}

export function Fact({ k, children }: { k: string; children: ReactNode }) {
  return <div className="td-fact"><span>{k}</span><div>{children}</div></div>
}

// ---------- evidence strength (A/B) ----------
/** k AB/BA blocks → 2^k equally likely schedules → smallest possible p = 1/2^k (CLAUDE.md §3). */
export function strengthFor(nPeriods: number) {
  const k = Math.floor(nPeriods / 2)
  const minP = 1 / 2 ** k
  if (nPeriods < 10 || nPeriods % 2) return { bars: 1, minP, text: "Too short: can't reach “likely real”", tone: 'bad' as const }
  if (k === 5) return { bars: 2, minP, text: 'Can reach “likely real”, with little margin', tone: 'ok' as const }
  if (k < 8) return { bars: 3, minP, text: 'Can reach “likely real”', tone: 'ok' as const }
  return { bars: 4, minP, text: 'Strongest evidence, longest commitment', tone: 'ok' as const }
}

export function StrengthMeter({ bars, tone = 'ok' }: { bars: number; tone?: 'ok' | 'bad' }) {
  return (
    <span className="td-meter" role="img" aria-label={`Evidence strength ${bars} of 4`}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= bars ? `on ${tone}` : ''} />)}
    </span>
  )
}

// ---------- pattern: days-before strip ----------
export function PatternStrip({ min, max, episodeLabel }: { min: number; max: number; episodeLabel: string }) {
  // Window L = the L days right before the episode, for each L in min..max: days 1..min are in every
  // tested window (strong), days min+1..max only in the longer ones (light).
  const days = Array.from({ length: max }, (_, i) => max - i) // max … 1
  return (
    <div className="td-scroll">
      <div className="td-strip">
        <div className="td-strip-group">
          <span className="td-strip-label">Normal days</span>
          <div className="td-days">{[0, 1, 2].map((i) => <div key={i} className="td-day" />)}</div>
        </div>
        <div className="td-strip-group">
          <span className="td-strip-label hot">{min === max ? `${max} day${max > 1 ? 's' : ''} before` : `${min}–${max} days before`}</span>
          <div className="td-days hot">
            {days.map((d) => <div key={d} className="td-day in" style={d > min ? { opacity: 0.55 } : undefined}>-{d}</div>)}
          </div>
        </div>
        <div className="td-strip-group">
          <span className="td-strip-label ep">{episodeLabel}</span>
          <div className="td-episode">Episode</div>
        </div>
      </div>
    </div>
  )
}

// ---------- A/B: two-lane dated timeline ----------
export function ABTimeline({ schedule, armA, armB }: { schedule: SchedulePeriod[]; armA: string; armB: string }) {
  if (!schedule.length) return <div className="muted small">No schedule yet.</div>
  const first = schedule[0].start
  const total = daysBetween(first, schedule[schedule.length - 1].washout_end) + 1
  const col = (iso: string) => daysBetween(first, iso) + 1
  const grid = { gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }
  // month labels at each month start inside the range
  const months: { label: string; start: number; span: number }[] = []
  for (let d = first; daysBetween(d, first) <= 0 && col(d) <= total;) {
    const dt = new Date(d + 'T00:00:00')
    const next = new Date(Date.UTC(dt.getFullYear(), dt.getMonth() + 1, 1)).toISOString().slice(0, 10)
    const start = col(d)
    const span = Math.min(total, col(next) - 1) - start + 1
    months.push({ label: dt.toLocaleDateString(undefined, { month: span < 24 ? 'short' : 'long' }), start, span })
    d = next
  }
  const lane = (arm: 'A' | 'B') => schedule.filter((p) => p.arm === arm).map((p) => (
    <div key={p.period} className={`td-block ${arm === 'A' ? 'a' : 'b'}`} style={{ gridColumn: `${col(p.start)} / span ${daysBetween(p.start, p.end) + 1}` }}
      title={`Period ${p.period}: ${arm === 'A' ? armA : armB}, ${formatDateShort(p.start)} to ${formatDateShort(p.end)}`}>
      {formatDateShort(p.start)}
    </div>
  ))
  return (
    <div className="td-scroll">
      <div className="td-timeline">
        <div className="td-lane"><span /><div className="td-months" style={grid}>
          {months.map((m, i) => <span key={m.start} className={i ? 'edge' : ''} style={{ gridColumn: `${m.start} / span ${m.span}` }}>{m.label}</span>)}
        </div></div>
        <div className="td-lane"><span className="td-lane-label b">B · {armB}</span><div className="td-track" style={grid}>{lane('B')}</div></div>
        <div className="td-lane"><span className="td-lane-label a">A · {armA}</span><div className="td-track" style={grid}>{lane('A')}</div></div>
        <div className="td-lane"><span className="td-lane-label muted">Break (not counted)</span><div className="td-track thin" style={grid}>
          {schedule.filter((p) => p.washout_end > p.end).map((p) => (
            <div key={p.period} className="td-break" style={{ gridColumn: `${col(addDays(p.end, 1))} / span ${daysBetween(p.end, p.washout_end)}` }} />
          ))}
        </div></div>
      </div>
    </div>
  )
}

// ---------- A/B: month calendar ----------
export function ABCalendar({ schedule, armA, armB }: { schedule: SchedulePeriod[]; armA: string; armB: string }) {
  if (!schedule.length) return <div className="muted small">No schedule yet.</div>
  const kind = new Map<string, 'A' | 'B' | 'W'>()
  schedule.forEach((p) => {
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) kind.set(d, p.arm)
    for (let d = addDays(p.end, 1); d <= p.washout_end; d = addDays(d, 1)) kind.set(d, 'W')
  })
  const first = new Date(schedule[0].start + 'T00:00:00')
  const last = new Date(schedule[schedule.length - 1].washout_end + 'T00:00:00')
  const months: Date[] = []
  for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(m)
  const iso = (y: number, mo: number, d: number) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return (
    <div>
      <div className="td-cal">
        {months.map((m) => {
          const y = m.getFullYear(), mo = m.getMonth()
          const n = new Date(y, mo + 1, 0).getDate()
          const lead = m.getDay()
          return (
            <div key={`${y}-${mo}`} className="td-month">
              <strong>{m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
              <div className="td-cal-grid">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="dow">{d}</span>)}
                {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
                {Array.from({ length: n }, (_, i) => {
                  const k = kind.get(iso(y, mo, i + 1))
                  const label = k === 'A' ? armA : k === 'B' ? armB : k === 'W' ? 'Break' : 'Not in the test'
                  return <span key={i} className={`day ${k ? k.toLowerCase() : ''}`} title={`${formatDateShort(iso(y, mo, i + 1))}: ${label}`}>{i + 1}</span>
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="legend">
        <span><i className="box" style={{ background: 'var(--arm-a)' }} />A · {armA}</span>
        <span><i className="box" style={{ background: 'var(--arm-b)' }} />B · {armB}</span>
        <span><i className="box td-hatch" />Break (not counted)</span>
      </div>
    </div>
  )
}

// ---------- A/B: what the patient sees ----------
export function PatientDayPreview({ schedule, armA, armB }: { schedule: SchedulePeriod[]; armA: string; armB: string }) {
  const p = schedule[0]
  if (!p) return null
  const len = daysBetween(p.start, p.end) + 1
  const name = (a: 'A' | 'B') => (a === 'A' ? armA : armB)
  const next = schedule[1]
  const brk = daysBetween(p.end, p.washout_end)
  return (
    <div className={`td-today ${p.arm === 'A' ? 'a' : 'b'}`}>
      <span className="when">Today · day {Math.min(3, len)} of {len}</span>
      <strong>{name(p.arm)}</strong>
      {next && <span className="next">Next: {brk > 0 ? `${brk}-day break from ${formatDateShort(addDays(p.end, 1))}, then ` : `from ${formatDateShort(next.start)}, `}{name(next.arm)}</span>}
    </div>
  )
}
