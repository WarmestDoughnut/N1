import type { PlanStatus, Verdict } from '../types'
import { VERDICT_INFO } from '../lib/util'

export function VerdictBadge({ verdict, patient = false, small = false }: { verdict: Verdict; patient?: boolean; small?: boolean }) {
  const info = VERDICT_INFO[verdict] ?? VERDICT_INFO.not_enough_data
  return (
    <span className={`verdict-badge ${info.className} ${small ? 'small' : ''}`} title={info.blurb}>
      <span className="dot" aria-hidden />
      {patient ? info.patientLabel : info.label}
    </span>
  )
}

export const STATUS_INFO: Record<PlanStatus, { label: string; patientLabel: string; tone: string }> = {
  pending_approval: { label: 'Awaiting patient', patientLabel: 'Needs your review', tone: 'pill-yellow' },
  active: { label: 'Active', patientLabel: 'In progress', tone: 'pill-purple' },
  paused: { label: 'Paused', patientLabel: 'Paused', tone: 'pill-gray' },
  stopped: { label: 'Stopped early', patientLabel: 'Stopped', tone: 'pill-coral' },
  complete: { label: 'Complete', patientLabel: 'Finished', tone: 'pill-green' },
  declined: { label: 'Declined', patientLabel: 'Declined', tone: 'pill-gray' },
}

export function StatusChip({ status, patient = false }: { status: PlanStatus; patient?: boolean }) {
  const info = STATUS_INFO[status] ?? { label: status, patientLabel: status, tone: 'pill-gray' }
  return <span className={`pill ${info.tone}`}>{patient ? info.patientLabel : info.label}</span>
}

/** Donut used for the "chance check": share of random shuffles the real result beat. */
export function ChanceDonut({ p, size }: { p: number; size?: number }) {
  const beat = Math.max(0, Math.min(1, 1 - p))
  const color = p < 0.05 ? '#149274' : p < 0.15 ? '#d29a2c' : '#9b9ba8'
  const label = beat >= 0.999 ? '>99.9%' : `${(beat * 100).toFixed(beat > 0.99 ? 1 : 0)}%`
  return (
    <div className="donut" style={{ '--progress': `${beat * 100}%`, '--donut': color, ...(size ? { width: size, height: size } : {}) } as React.CSSProperties}>
      <div>
        <strong>{label}</strong>
        <span>of shuffles beaten</span>
      </div>
    </div>
  )
}
