import { useEffect, useMemo, useRef, useState } from 'react'
import type { SchedulePeriod } from '../types'
import { addDays, daysBetween, formatDateShort } from '../lib/util'
import { Icon } from './Icon'
import { StrengthMeter, strengthFor } from './TestDesign'

/* A/B schedule editor: the clinician PLACES each period on a calendar (when); a coin flip per
 * consecutive pair decides which option each period gets (which). Keeping the order random is what
 * makes the block-permutation chance check valid (CLAUDE.md §3), so arms are never hand-assigned. */

export interface Stint { id: string; start: string; end: string; arm: 'A' | 'B' | null }

let nextId = 1
export const newStintId = () => `st${nextId++}`
const len = (s: { start: string; end: string }) => daysBetween(s.start, s.end) + 1
const sortStints = (xs: Stint[]) => [...xs].sort((a, b) => a.start.localeCompare(b.start))
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && b.start <= a.end

/** Most common value (ties → smallest); null for an empty list. */
function mode(xs: number[]): number | null {
  if (!xs.length) return null
  const c = new Map<number, number>()
  xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1))
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
}

/** Shape the clinician's periods for the summary + the plan. Gaps between periods are breaks (washout). */
export function stintStats(stints: Stint[]) {
  const s = sortStints(stints)
  const lengths = s.map(len)
  const gaps = s.slice(1).map((x, i) => daysBetween(s[i].end, x.start) - 1)
  const pairs = Math.floor(s.length / 2)
  const randomized = s.length > 0 && s.length % 2 === 0 && s.every((x) => x.arm)
  return {
    count: s.length, pairs, lengths, gaps,
    periodDays: mode(lengths), breakDays: mode(gaps),
    countedDays: lengths.reduce((a, b) => a + b, 0),
    span: s.length ? daysBetween(s[0].start, s[s.length - 1].end) + 1 : 0,
    unequalPairs: Array.from({ length: pairs }, (_, k) => k).filter((k) => lengths[2 * k] !== lengths[2 * k + 1]).map((k) => k + 1),
    randomized,
  }
}

/** Placed + randomized periods → the contract's schedule. A period's break runs until the next period starts. */
export function stintsToSchedule(stints: Stint[]): SchedulePeriod[] {
  const s = sortStints(stints)
  const lastGap = mode(s.slice(1).map((x, i) => daysBetween(s[i].end, x.start) - 1)) ?? 0
  return s.map((x, i) => ({
    period: i + 1, arm: x.arm as 'A' | 'B', start: x.start, end: x.end,
    washout_end: i < s.length - 1 ? addDays(s[i + 1].start, -1) : addDays(x.end, lastGap),
  }))
}

export function scheduleToStints(schedule: SchedulePeriod[]): Stint[] {
  return schedule.map((p) => ({ id: newStintId(), start: p.start, end: p.end, arm: p.arm }))
}

/** A fresh coin flip per consecutive pair (crypto RNG when available). */
export function randomizeStints(stints: Stint[]): Stint[] {
  const s = sortStints(stints)
  const flips = new Uint8Array(Math.ceil(s.length / 2))
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(flips)
  else flips.forEach((_, i) => { flips[i] = Math.floor(Math.random() * 256) })
  return s.map((x, i) => {
    const bFirst = (flips[Math.floor(i / 2)] & 1) === 1
    return { ...x, arm: (i % 2 === 0) === bFirst ? 'B' : 'A' }
  })
}

type Drag =
  | { mode: 'create'; origin: string; current: string; moved: boolean }
  | { mode: 'move' | 'resize-start' | 'resize-end'; id: string; origin: string; current: string; moved: boolean }

const FILLS = [10, 12, 16]

export function StintCalendar({ range, stints, onChange, armA, armB }: {
  /** the patient's data range: periods can only be placed inside it */
  range: { start: string; end: string }
  stints: Stint[]; onChange: (s: Stint[]) => void; armA: string; armB: string
}) {
  const sorted = useMemo(() => sortStints(stints), [stints])
  const [drag, setDrag] = useState<Drag | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const st = stintStats(sorted)

  /** A pair keeps its coin flip only while both its periods keep their positions; other pairs need randomizing again. */
  const commit = (next: Stint[]) => {
    const n = sortStints(next)
    let p = 0
    while (p < n.length && p < sorted.length && n[p].id === sorted[p].id) p++
    const keep = Math.floor(p / 2) * 2
    onChange(n.map((x, i) => (i < keep ? x : { ...x, arm: null })))
    setNote(null)
  }

  const valid = (cand: { start: string; end: string }, exceptId?: string) =>
    cand.start >= range.start && cand.end <= range.end && cand.start <= cand.end &&
    sorted.every((x) => x.id === exceptId || !overlaps(x, cand))

  /** Length to use for a single click: the pair partner's length, else the last period's. */
  const defaultLen = (day: string) => {
    if (!sorted.length) return null
    const before = sorted.filter((x) => x.end < day)
    if (before.length % 2 === 1) return len(before[before.length - 1])
    return len(sorted[sorted.length - 1])
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
      if (d.moved) {
        const c = candidate(d)!
        if (valid(c)) { commit([...sorted, { id: newStintId(), ...c, arm: null }]); setPending(null) } else setNote('Periods can’t overlap or go past the patient’s data.')
        return
      }
      // a click on an empty day
      if (pending) {
        const c = pending <= d.origin ? { start: pending, end: d.origin } : { start: d.origin, end: pending }
        setPending(null)
        if (valid(c)) commit([...sorted, { id: newStintId(), ...c, arm: null }]); else setNote('Periods can’t overlap or go past the patient’s data.')
        return
      }
      const L = defaultLen(d.origin)
      if (L == null) { setPending(d.origin); setNote('Now click the last day of this period (or drag across the days).'); return }
      const c = { start: d.origin, end: addDays(d.origin, L - 1) }
      if (valid(c)) commit([...sorted, { id: newStintId(), ...c, arm: null }])
      else { setPending(d.origin); setNote('A full-length period doesn’t fit here. Click its last day.') }
      return
    }
    if (!d.moved) { setSelected(selected === d.id ? null : d.id); return }
    const c = candidate(d)!
    if (valid(c, d.id)) commit(sorted.map((x) => (x.id === d.id ? { ...x, start: c.start, end: c.end } : x)))
    else setNote('Periods can’t overlap or go past the patient’s data.')
  }

  const remove = (id: string) => { commit(sorted.filter((x) => x.id !== id)); setSelected(null) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || !(e.key === 'Delete' || e.key === 'Backspace')) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      remove(selected)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** "Repeat this rhythm": continue the first pair's lengths and break until `target` periods. */
  const fillTo = (target: number) => {
    if (sorted.length < 2) return
    const L = [len(sorted[0]), len(sorted[1])]
    const gap = Math.max(0, daysBetween(sorted[0].end, sorted[1].start) - 1)
    const out = [...sorted]
    while (out.length < target) {
      const last = out[out.length - 1]
      const start = addDays(last.end, gap + 1)
      const end = addDays(start, L[out.length % 2] - 1)
      if (end > range.end) break
      out.push({ id: newStintId(), start, end, arm: null })
    }
    commit(out)
    if (out.length < target) setNote(`Only ${out.length} periods fit before the patient’s data ends (${formatDateShort(range.end)}).`)
  }

  // ----- render -----
  const preview = drag && drag.moved ? candidate(drag) : null
  const previewOk = preview ? valid(preview, 'id' in preview ? preview.id : undefined) : true
  const stintOf = new Map<string, { s: Stint; i: number }>()
  sorted.forEach((s, i) => { for (let d = s.start; d <= s.end; d = addDays(d, 1)) stintOf.set(d, { s, i }) })
  const first = sorted[0]?.start, last = sorted[sorted.length - 1]?.end
  const months: Date[] = []
  const r0 = new Date(range.start + 'T00:00:00'), r1 = new Date(range.end + 'T00:00:00')
  for (let m = new Date(r0.getFullYear(), r0.getMonth(), 1); m <= r1; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(m)
  const iso = (y: number, mo: number, d: number) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const sel = sorted.find((x) => x.id === selected)
  const selIdx = sel ? sorted.indexOf(sel) : -1

  return (
    <div className="sc">
      <div className="sc-toolbar">
        <span className="muted small">
          {st.count === 0
            ? 'Drag across days to place a period (or click its first day, then its last). Gaps between periods become breaks.'
            : `${st.count} period${st.count === 1 ? '' : 's'} placed · ${st.pairs} complete pair${st.pairs === 1 ? '' : 's'}${st.count % 2 ? ' · add one more to finish the last pair' : ''}`}
        </span>
        {st.count > 0 && <button type="button" className="link-btn" onClick={() => { commit([]); setSelected(null); setPending(null) }}>Clear all</button>}
      </div>

      {st.count >= 2 && (
        <div className="sc-fill">
          <span className="td-slot-label">Repeat the first pair’s rhythm ({len(sorted[0])}-day periods{daysBetween(sorted[0].end, sorted[1].start) - 1 > 0 ? `, ${daysBetween(sorted[0].end, sorted[1].start) - 1}-day breaks` : ''})</span>
          <div className="row" style={{ gap: 8 }}>
            {FILLS.map((n) => {
              const s = strengthFor(n)
              return (
                <button key={n} type="button" className="button secondary sm sc-fill-btn" disabled={st.count >= n} onClick={() => fillTo(n)}>
                  Fill to {n} periods <StrengthMeter bars={s.bars} />
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div ref={gridRef} className={`sc-months ${drag ? 'dragging' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)} role="grid" aria-label="Place A/B periods">
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
                  const gap = !hit && first && last && d > first && d < last
                  const cls = [
                    'day sc-day',
                    out && 'out',
                    hit && !moving && (hit.s.arm ? hit.s.arm.toLowerCase() : 'p'),
                    hit && !moving && d === hit.s.start && 'first',
                    hit && !moving && d === hit.s.end && 'last',
                    hit && hit.s.id === selected && 'sel',
                    gap && !inPrev && 'w',
                    inPrev && (previewOk ? 'prev' : 'bad'),
                    pending === d && 'pending',
                  ].filter(Boolean).join(' ')
                  return (
                    <span key={d} data-date={out ? undefined : d} className={cls}
                      title={hit ? `Period ${hit.i + 1} (pair ${Math.floor(hit.i / 2) + 1})${hit.s.arm ? `: ${hit.s.arm === 'A' ? armA : armB}` : ''} · ${formatDateShort(hit.s.start)}–${formatDateShort(hit.s.end)}` : out ? 'Outside the patient’s data' : formatDateShort(d)}>
                      {hit && !moving && d === hit.s.start ? <b>{hit.i + 1}</b> : i + 1}
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
          <span><strong>Period {selIdx + 1}</strong> (pair {Math.floor(selIdx / 2) + 1}) · {formatDateShort(sel.start)} – {formatDateShort(sel.end)} · {len(sel)} day{len(sel) > 1 ? 's' : ''}{sel.arm ? ` · ${sel.arm === 'A' ? armA : armB}` : ''}</span>
          <span className="muted small">Drag it to move, drag its first or last day to resize.</span>
          <button type="button" className="button ghost sm" onClick={() => remove(sel.id)}><Icon name="x" size={14} /> Delete</button>
        </div>
      )}
      {st.unequalPairs.length > 0 && (
        <div className="small" style={{ color: 'var(--yellow)' }}>
          Pair{st.unequalPairs.length > 1 ? 's' : ''} {st.unequalPairs.join(', ')} {st.unequalPairs.length > 1 ? 'have' : 'has'} periods of different lengths. Equal lengths within a pair compare like with like.
        </div>
      )}
      <div className="legend">
        <span><i className="box" style={{ background: '#cfcfda' }} />Placed (not randomized)</span>
        <span><i className="box" style={{ background: 'var(--arm-a)' }} />A · {armA}</span>
        <span><i className="box" style={{ background: 'var(--arm-b)' }} />B · {armB}</span>
        <span><i className="box td-hatch" />Break (not counted)</span>
      </div>
    </div>
  )
}
