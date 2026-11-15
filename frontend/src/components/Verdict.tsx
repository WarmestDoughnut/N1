import type { Verdict } from '../types'
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

export function StatusChip({ status }: { status: string }) {
  const label: Record<string, string> = {
    pending_approval: 'Awaiting patient',
    active: 'Active',
    paused: 'Paused',
    stopped: 'Stopped early',
    complete: 'Complete',
    declined: 'Declined',
  }
  return <span className={`status status-${status}`}>{label[status] ?? status}</span>
}
