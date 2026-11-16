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

/** An A/B result whose chance check tried every possible A/B order (2^blocks, up to 4096; CLAUDE.md §3)
 *  rather than random shuffles. There the real order is one of the n, and p = k / n. */
export const isExactTest = (type: string, n: number) => type === 'intervention' && n > 1 && n <= 4096 && (n & (n - 1)) === 0

/** Turns a p-value back into a count the reader can check.
 *  Random shuffles: p = (k + 1) / (n + 1), where k of the n shuffles were at least as strong as the real result.
 *  Exact test: p = k / n, where k of the n possible orders (the real one included) were at least as strong.
 *  `atFloor`: nothing beat the real result, so p can't go lower with this n. The backend rounds p, so the
 *  floor is found from the recovered count, not by comparing floats. */
export function chanceCount(p: number, n: number, exact = false) {
  const raw = exact ? Math.round(p * n) : Math.round(p * (n + 1)) - 1
  const k = Math.max(exact ? 1 : 0, Math.min(n, raw))
  const atFloor = n > 0 && k === (exact ? 1 : 0)
  const share = n > 0 ? k / n : p
  const v = share * 100
  const pctText = v === 0 ? '0%' : v < 0.1 ? '<0.1%' : v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`
  return { exact, atFloor, k, n, beaten: n - k, pctText, nText: n.toLocaleString(), kText: k.toLocaleString() }
}

/** Donut used for the "chance check". One framing everywhere: the share of shuffles (or possible A/B orders)
 *  that were at least as strong as the real result. The ring fills by that share, so a strong result is a
 *  nearly empty ring; the centre is the count, e.g. "0 of 2,000 shuffles as strong", "1 of 64 orders as strong".
 *  Pass `n` (results.n_permutations) to get the count; without it the centre falls back to the percentage. */
export function ChanceDonut({ p, n, exact = false, size }: { p: number; n?: number; exact?: boolean; size?: number }) {
  const c = n ? chanceCount(p, n, exact) : null
  const share = c ? c.k / c.n : Math.max(0, Math.min(1, p))
  const color = p < 0.05 ? '#149274' : p < 0.15 ? '#d29a2c' : '#9b9ba8'
  const unit = exact ? 'orders' : 'shuffles'
  return (
    <div className="donut" style={{ '--progress': `${share * 100}%`, '--donut': color, ...(size ? { width: size, height: size } : {}) } as React.CSSProperties}>
      <div>
        <strong>{c ? c.kText : `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`}</strong>
        <span>{c ? `of ${c.nText} ${unit} as strong` : 'of shuffles as strong'}</span>
      </div>
    </div>
  )
}
