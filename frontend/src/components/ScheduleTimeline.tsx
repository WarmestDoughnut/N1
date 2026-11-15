import type { SchedulePeriod } from '../types'
import { daysBetween, formatDateShort } from '../lib/util'

interface Props {
  schedule: SchedulePeriod[]
  armA?: string
  armB?: string
  compact?: boolean
}

/** Colored A/B block timeline with washout hatching. Widths are proportional to days. */
export function ScheduleTimeline({ schedule, armA = 'A', armB = 'B', compact = false }: Props) {
  if (!schedule.length) return <div className="muted small">No schedule yet.</div>
  const first = schedule[0].start
  const last = schedule[schedule.length - 1].washout_end
  const total = daysBetween(first, last) + 1
  return (
    <div>
      <div className="timeline" role="img" aria-label={`Schedule: ${schedule.map((p) => p.arm).join('-')}`}>
        {schedule.map((p) => {
          const len = daysBetween(p.start, p.end) + 1
          const wo = daysBetween(p.end, p.washout_end)
          return [
            <div
              key={`p${p.period}`}
              className={p.arm === 'A' ? 'seg-a' : 'seg-b'}
              style={{ width: `${(len / total) * 100}%` }}
              title={`Period ${p.period}: ${p.arm === 'A' ? armA : armB} · ${p.start} → ${p.end}`}
            >
              {p.arm}
            </div>,
            wo > 0 ? (
              <div key={`w${p.period}`} className="seg-w" style={{ width: `${(wo / total) * 100}%` }} title={`Washout · until ${p.washout_end}`}>
              </div>
            ) : null,
          ]
        })}
      </div>
      <div className="timeline-dates">
        <span>{formatDateShort(first)}</span>
        <span className="muted">{schedule.map((p) => p.arm).join(' – ')}</span>
        <span>{formatDateShort(last)}</span>
      </div>
      {!compact && (
        <div className="legend">
          <span><span className="sw" style={{ background: 'var(--arm-a)' }} />A: {armA}</span>
          <span><span className="sw" style={{ background: 'var(--arm-b)' }} />B: {armB}</span>
          <span><span className="sw" style={{ background: 'repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 3px,#f9fafb 3px,#f9fafb 6px)', border: '1px solid #d1d5db' }} />Washout (not analyzed)</span>
        </div>
      )}
    </div>
  )
}
