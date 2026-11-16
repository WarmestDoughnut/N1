import { useEffect, useMemo, useRef, useState } from 'react'
import type { SchedulePeriod } from '../types'
import { addDays, daysBetween, formatDateShort } from '../lib/util'
import { Icon } from './Icon'

/* A/B schedule editor (overhaul fe-main #7 item 5). The clinician paints the calendar with a brush:
 * A, B or Break. Days that aren't painted are NORMAL days (usual routine, not part of the test).
 * Order is set by hand by default; "Randomize for me" re-flips each consecutive A/B pair with a coin,
 * which is the only way the result keeps full randomized-trial strength (human's decision, #24). */

export type StintKind = 'A' | 'B' | 'W'
export interface Stint { id: string; start: string; end: string; arm: StintKind }
export type Assignment = 'manual' | 'randomized'

let nextId = 1
export const newStintId = () => `st${nextId++}`
const len = (s: { start: string; end: string }) => daysBetween(s.start, s.end) + 1
const sortStints = (xs: Stint[]) => [...xs].sort((a, b) => a.start.localeCompare(b.start))
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && b.start <= a.end
const periodsOf = (xs: Stint[]) => sortStints(xs).filter((x) => x.arm !== 'W')

function mode(xs: number[]): number | null {
  if (!xs.length) return null
  const c = new Map<number, number>()
  xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1))
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
}

/** The break placed directly after a period (adjacent), if any. */
function breakAfter(all: Stint[], p: Stint) {
  return all.find((x) => x.arm === 'W' && x.start === addDays(p.end, 1)) ?? null
}

export function stintStats(stints: Stint[]) {
  const all = sortStints(stints)
  const ps = periodsOf(all)
  const lengths = ps.map(len)
  const breaks = all.filter((x) => x.arm === 'W')
  const first = all[0]?.start, last = all.reduce((a, x) => (x.end > a ? x.end : a), all[0]?.end ?? '')
  return {
    count: ps.length,
    nA: ps.filter((x) => x.arm === 'A').length,
    nB: ps.filter((x) => x.arm === 'B').length,
    nBreaks: breaks.length,
    periodDays: mode(lengths), breakDays: mode(breaks.map(len)),
    countedDays: lengths.reduce((a, b) => a + b, 0),
    span: first ? daysBetween(first, last) + 1 : 0,
    first, last,
    /** consecutive periods form AB/BA pairs (required for a randomized result) */
    pairedAB: ps.length >= 2 && ps.length % 2 === 0 && Array.from({ length: ps.length / 2 }, (_, k) => ps[2 * k].arm !== ps[2 * k + 1].arm).every(Boolean),
  }
}

/** Placed periods (+ optional adjacent breaks) → the contract's schedule. */
export function stintsToSchedule(stints: Stint[]): SchedulePeriod[] {
  const all = sortStints(stints)
  return periodsOf(all).map((p, i) => ({
    period: i + 1, arm: p.arm as 'A' | 'B', start: p.start, end: p.end,
    washout_end: breakAfter(all, p)?.end ?? p.end,
  }))
}

export function scheduleToStints(schedule: SchedulePeriod[]): Stint[] {
  return schedule.flatMap((p) => {
    const s: Stint[] = [{ id: newStintId(), start: p.start, end: p.end, arm: p.arm }]
    if (p.washout_end > p.end) s.push({ id: newStintId(), start: addDays(p.end, 1), end: p.washout_end, arm: 'W' })
    return s
  })
}

/** Coin flip per consecutive pair of periods (crypto RNG). Breaks are untouched. */
export function randomizeStints(stints: Stint[]): Stint[] {
  const ps = periodsOf(stints)
  const flips = new Uint8Array(Math.ceil(ps.length / 2))
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(flips)
  else flips.forEach((_, i) => { flips[i] = Math.floor(Math.random() * 256) })
  const armOf = new Map(ps.map((x, i) => {
    const bFirst = (flips[Math.floor(i / 2)] & 1) === 1
    return [x.id, ((i % 2 === 0) === bFirst ? 'B' : 'A') as StintKind]
  }))
  return sortStints(stints).map((x) => (armOf.has(x.id) ? { ...x, arm: armOf.get(x.id)! } : x))
}

type Drag =
  | { mode: 'create'; origin: string; current: string; moved: boolean }
  | { mode: 'move' | 'resize-start' | 'resize-end'; id: string; origin: string; current: string; moved: boolean }

const COLORS: Record<StintKind, { bg: string; fg: string }> = {
  A: { bg: 'var(--arm-a)', fg: '#fff' },
  B: { bg: 'var(--arm-b)', fg: '#2b1503' },
  W: { bg: 'repeating-linear-gradient(45deg, #c9c9d6, #c9c9d6 3px, #ececf2 3px, #ececf2 6px)', fg: '#3c3c47' },
}

export function StintCalendar({ range, stints, onChange, armA, armB, assignment, onAssignment, defaultRepeatWeeks }: {
  range: { start: string; end: string }
  stints: Stint[]; onChange: (s: Stint[]) => void; armA: string; armB: string
  assignment: Assignment; onAssignment: (a: Assignment) => void
  /** seeds "Repeat this pattern for N weeks" (e.g. from an assistant draft) */
  defaultRepeatWeeks?: number
}) {
  const sorted = useMemo(() => sortStints(stints), [stints])
  const [brush, setBrush] = useState<StintKind>('A')
  const [drag, setDrag] = useState<Drag | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [repMode, setRepMode] = useState<'until' | 'weeks'>('weeks')
  const [repWeeks, setRepWeeks] = useState(defaultRepeatWeeks ? String(defaultRepeatWeeks) : '')
  const [repUntil, setRepUntil] = useState('')
  const [rhythm, setRhythm] = useState<'back' | 'spread'>('back')
  const gridRef = useRef<HTMLDivElement>(null)
  const st = stintStats(sorted)
  const name = (k: StintKind) => (k === 'A' ? `A · ${armA}` : k === 'B' ? `B · ${armB}` : 'Break')

  /** content changes (add/remove/re-assign) make the order hand-set; moves/resizes don't */
  const commit = (next: Stint[], orderChanged: boolean) => {
    onChange(sortStints(next))
    if (orderChanged && assignment === 'randomized') onAssignment('manual')
    setNote(null)
  }
  const valid = (cand: { start: string; end: string }, exceptId?: string) =>
    cand.start >= range.start && cand.end <= range.end && cand.start <= cand.end &&
    sorted.every((x) => x.id === exceptId || !overlaps(x, cand))

  /** single-click length: the last stint of the same brush, else the last period */
  const defaultLen = () => {
    const same = [...sorted].reverse().find((x) => x.arm === brush)
    if (same) return len(same)
    const p = [...sorted].reverse().find((x) => x.arm !== 'W')
    return brush === 'W' ? null : p ? len(p) : null
  }

  const candidate = (d: Drag): { start: string; end: string; id?: string } | null => {
    if (d.mode === 'create') return d.origin <= d.current ? { start: d.origin, end: d.current } : { start: d.current, end: d.origin }
    const s = sorted.find((x) => x.id === d.id)
    if (!s) return null
    const delta = daysBetween(d.origin, d.current)
    if (d.mode === 'move') return { id: s.id, start: addDays(s.start, delta), end: addDays(s.end, delta) }
    if (d.mode === 'resize-start') return { id: s.id, start: d.current <= s.end ? d.current : s.end, end: s.end }
    return { id: s.id, start: s.start, end: d.current >= s.start ? d.current : s.start }
  }
  const dateAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-date]')?.dataset.date ?? null
  const add = (c: { start: string; end: string }) => {
    if (valid(c)) commit([...sorted, { id: newStintId(), ...c, arm: brush }], brush !== 'W')
    else setNote('Days can’t overlap another period or go past the patient’s data.')
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const date = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset.date
    if (!date || date < range.start || date > range.end) return
    e.preventDefault()
    gridRef.current?.setPointerCapture(e.pointerId)
    const s = sorted.find((x) => x.start <= date && date <= x.end)
    if (s) {
      const m = len(s) > 1 && date === s.start ? 'resize-start' : len(s) > 1 && date === s.end ? 'resize-end' : 'move'
      setDrag({ mode: m, id: s.id, origin: date, current: date, moved: false })
    } else setDrag({ mode: 'create', origin: date, current: date, moved: false })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const d = dateAt(e.clientX, e.clientY)
    if (d && d !== drag.current) setDrag({ ...drag, current: d, moved: drag.moved || d !== drag.origin })
  }
  const onPointerUp = () => {
    const d = drag
    setDrag(null)
    if (!d) return
    if (d.mode === 'create') {
      if (d.moved) { add(candidate(d)!); setPending(null); return }
      if (pending) {
        const c = pending <= d.origin ? { start: pending, end: d.origin } : { start: d.origin, end: pending }
        setPending(null); add(c); return
      }
      const L = defaultLen()
      if (L == null) { setPending(d.origin); setNote('Now click the last day (or drag across the days).'); return }
      const c = { start: d.origin, end: addDays(d.origin, L - 1) }
      if (valid(c)) add(c)
      else { setPending(d.origin); setNote('That length doesn’t fit here. Click the last day.') }
      return
    }
    if (!d.moved) { setSelected(selected === d.id ? null : d.id); return }
    const c = candidate(d)!
    if (valid(c, d.id)) commit(sorted.map((x) => (x.id === d.id ? { ...x, start: c.start, end: c.end } : x)), false)
    else setNote('Days can’t overlap another period or go past the patient’s data.')
  }

  const remove = (id: string) => { commit(sorted.filter((x) => x.id !== id), true); setSelected(null) }
  const reassign = (id: string, arm: StintKind) => commit(sorted.map((x) => (x.id === id ? { ...x, arm } : x)), true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || !(e.key === 'Delete' || e.key === 'Backspace')) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      remove(selected)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** Repeat everything placed so far (the pattern) until a date / for N weeks. */
  const repeat = () => {
    if (!sorted.length) return
    const pStart = sorted[0].start
    const pEnd = sorted.reduce((a, x) => (x.end > a ? x.end : a), sorted[0].end)
    const span = daysBetween(pStart, pEnd) + 1
    const step = rhythm === 'back' ? span : span * 2 // spread out: one pattern-length of normal days between repeats
    const limit = repMode === 'until' ? repUntil : repWeeks ? addDays(pStart, Number(repWeeks) * 7 - 1) : ''
    if (!limit) { setNote(repMode === 'until' ? 'Pick an end date.' : 'Enter the number of weeks.'); return }
    const end = limit < range.end ? limit : range.end
    const base = sorted
    const out = [...sorted]
    for (let k = 1; ; k++) {
      const shift = step * k
      const copy = base.map((x) => ({ id: newStintId(), start: addDays(x.start, shift), end: addDays(x.end, shift), arm: x.arm }))
      if (copy.some((x) => x.end > end)) break
      if (copy.some((c) => out.some((x) => overlaps(x, c)))) break
      out.push(...copy)
    }
    if (out.length === sorted.length) { setNote('The pattern doesn’t fit again before that date.'); return }
    commit(out, true)
    if (limit > range.end) setNote(`Stopped at the end of the patient’s data (${formatDateShort(range.end)}).`)
  }

  // ----- render -----
  const preview = drag && drag.moved ? candidate(drag) : null
  const previewOk = preview ? valid(preview, 'id' in preview ? preview.id : undefined) : true
  const stintOf = new Map<string, { s: Stint; n: number }>()
  const ps = periodsOf(sorted)
  sorted.forEach((s) => { const n = ps.indexOf(s); for (let d = s.start; d <= s.end; d = addDays(d, 1)) stintOf.set(d, { s, n }) })
  const months: Date[] = []
  const r0 = new Date(range.start + 'T00:00:00'), r1 = new Date(range.end + 'T00:00:00')
  for (let m = new Date(r0.getFullYear(), r0.getMonth(), 1); m <= r1; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(m)
  const iso = (y: number, mo: number, d: number) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const sel = sorted.find((x) => x.id === selected)

  return (
    <div className="sc">
      <div className="sc-toolbar">
        <div className="row" style={{ gap: 6 }} role="radiogroup" aria-label="Paint">
          <span className="td-slot-label" style={{ marginRight: 4 }}>Paint</span>
          {(['A', 'B', 'W'] as StintKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={brush === k} onClick={() => { setBrush(k); setPending(null) }}
              className="button sm" style={{
                background: brush === k ? COLORS[k].bg : '#fff', color: brush === k ? COLORS[k].fg : '#3c3c47',
                border: `2px solid ${brush === k ? '#242430' : 'var(--border)'}`, fontWeight: 700, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{name(k)}</button>
          ))}
        </div>
        {sorted.length > 0 && <button type="button" className="link-btn" onClick={() => { commit([], true); setSelected(null); setPending(null) }}>Clear all</button>}
      </div>
      <span className="muted small">
        {sorted.length === 0
          ? 'Pick A, B or Break, then drag across days (or click the first day, then the last). Unpainted days are normal days.'
          : `${st.count} period${st.count === 1 ? '' : 's'} (${st.nA} A · ${st.nB} B)${st.nBreaks ? ` · ${st.nBreaks} break${st.nBreaks > 1 ? 's' : ''}` : ''} · click a period to change or delete it`}
      </span>

      {sorted.length > 0 && (
        <div className="sc-fill">
          <span className="td-slot-label">Repeat this pattern</span>
          <div className="td-inline" style={{ fontSize: 14, fontWeight: 600 }}>
            <select aria-label="Repeat until or for" value={repMode} onChange={(e) => setRepMode(e.target.value as 'until' | 'weeks')} style={{ width: 'auto' }}>
              <option value="weeks">for</option>
              <option value="until">until</option>
            </select>
            {repMode === 'weeks'
              ? <><input aria-label="Weeks" type="number" min={1} max={52} value={repWeeks} placeholder="–" onChange={(e) => setRepWeeks(e.target.value)} style={{ width: 80 }} /><span>weeks in total</span></>
              : <input aria-label="Repeat until" type="date" value={repUntil} min={st.last} max={range.end} onChange={(e) => setRepUntil(e.target.value)} style={{ width: 'auto' }} />}
            <select aria-label="Rhythm" value={rhythm} onChange={(e) => setRhythm(e.target.value as 'back' | 'spread')} style={{ width: 'auto' }}>
              <option value="back">back to back</option>
              <option value="spread">spread out (normal days in between)</option>
            </select>
            <button type="button" className="button secondary sm" onClick={repeat}><Icon name="calendar" size={14} /> Repeat</button>
          </div>
        </div>
      )}

      <div ref={gridRef} className={`sc-months ${drag ? 'dragging' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)} role="grid" aria-label="Paint A/B periods">
        {months.map((m) => {
          const y = m.getFullYear(), mo = m.getMonth()
          const n = new Date(y, mo + 1, 0).getDate()
          return (
            <div key={`${y}-${mo}`} className="td-month">
              <strong>{m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
              <div className="td-cal-grid">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="dow">{d}</span>)}
                {Array.from({ length: m.getDay() }, (_, i) => <span key={`l${i}`} />)}
                {Array.from({ length: n }, (_, i) => {
                  const d = iso(y, mo, i + 1)
                  const out = d < range.start || d > range.end
                  const hit = stintOf.get(d)
                  const moving = drag && drag.mode !== 'create' && drag.moved && hit?.s.id === drag.id
                  const inPrev = preview && d >= preview.start && d <= preview.end
                  const k = hit && !moving ? hit.s.arm : null
                  const style: React.CSSProperties = inPrev
                    ? { background: previewOk ? COLORS[drag?.mode === 'create' ? brush : (hit?.s.arm ?? brush)].bg : '#fde4e5', opacity: 0.6, color: '#242430' }
                    : k ? { background: COLORS[k].bg, color: COLORS[k].fg, fontWeight: 700 } : {}
                  const cls = ['day sc-day', out && 'out', k && 'p', k && d === hit!.s.start && 'first', k && d === hit!.s.end && 'last',
                    hit && hit.s.id === selected && 'sel', pending === d && 'pending', !k && !out && !inPrev && 'normal'].filter(Boolean).join(' ')
                  return (
                    <span key={d} data-date={out ? undefined : d} className={cls} style={style}
                      title={hit ? `${hit.s.arm === 'W' ? 'Break' : `Period ${hit.n + 1}: ${name(hit.s.arm)}`} · ${formatDateShort(hit.s.start)}–${formatDateShort(hit.s.end)}` : out ? 'Outside the patient’s data' : `${formatDateShort(d)} · normal day`}>
                      {k && k !== 'W' && d === hit!.s.start ? <b>{hit!.n + 1}</b> : i + 1}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {note && <div className="small" style={{ color: 'var(--yellow)' }}>{note}</div>}
      {sel && (
        <div className="sc-selected">
          <span><strong>{sel.arm === 'W' ? 'Break' : `Period ${ps.indexOf(sel) + 1}`}</strong> · {formatDateShort(sel.start)} – {formatDateShort(sel.end)} · {len(sel)} day{len(sel) > 1 ? 's' : ''}</span>
          <span className="row" style={{ gap: 6 }}>
            {(['A', 'B', 'W'] as StintKind[]).filter((k) => k !== sel.arm).map((k) => (
              <button key={k} type="button" className="button secondary sm" onClick={() => reassign(sel.id, k)}>Make {k === 'W' ? 'break' : k}</button>
            ))}
            <button type="button" className="button ghost sm" onClick={() => remove(sel.id)}><Icon name="x" size={14} /> Delete</button>
          </span>
        </div>
      )}
      <div className="legend">
        <span><i className="box" style={{ background: COLORS.A.bg }} />A · {armA}</span>
        <span><i className="box" style={{ background: COLORS.B.bg }} />B · {armB}</span>
        <span><i className="box" style={{ background: COLORS.W.bg }} />Break (not counted)</span>
        <span><i className="box" style={{ background: '#fff', border: '1px solid #d6d6de' }} />Normal day (usual routine, not in the test)</span>
      </div>
    </div>
  )
}
