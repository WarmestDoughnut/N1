import type { SignalId, Verdict, Warning } from '../types'

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gauss(rng: () => number) {
  const u = Math.max(rng(), 1e-9)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
}

export function nowIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`
}

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const SIGNAL_INFO: Record<SignalId, { label: string; unit: string; plain: string; noun: string }> = {
  sleep_min: { label: 'Sleep', unit: 'min', plain: 'sleep', noun: 'sleep' },
  resting_hr: { label: 'Resting heart rate', unit: 'bpm', plain: 'resting heart rate', noun: 'heart rate' },
  hrv: { label: 'Heart rate variability', unit: 'ms', plain: 'heart rate variability', noun: 'HRV' },
  steps: { label: 'Steps', unit: 'steps', plain: 'daily steps', noun: 'activity' },
  episode: { label: 'Episode log', unit: '', plain: 'episode log', noun: 'episodes' },
}

export const ALL_SIGNALS: SignalId[] = ['sleep_min', 'resting_hr', 'hrv', 'steps', 'episode']

export function signalLabel(s: string): string {
  return SIGNAL_INFO[s as SignalId]?.label ?? s
}

export function formatValue(signal: string, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  if (signal === 'sleep_min') {
    const h = Math.floor(v / 60)
    const m = Math.round(v % 60)
    return `${h}h ${m}m`
  }
  const unit = SIGNAL_INFO[signal as SignalId]?.unit ?? ''
  return `${Math.round(v).toLocaleString()}${unit ? ' ' + unit : ''}`
}

export const VERDICT_INFO: Record<Verdict, { label: string; patientLabel: string; className: string; blurb: string }> = {
  likely_real: {
    label: 'Likely real',
    patientLabel: 'A clear pattern',
    className: 'verdict-real',
    blurb: 'Strong, consistent effect that rarely appears by chance.',
  },
  suggestive: {
    label: 'Suggestive',
    patientLabel: 'A possible pattern',
    className: 'verdict-suggestive',
    blurb: 'Points in the expected direction, but not strong enough to be confident.',
  },
  probably_chance: {
    label: 'Probably chance',
    patientLabel: 'No clear pattern',
    className: 'verdict-chance',
    blurb: 'An effect this size shows up often in random shuffles of the data.',
  },
  not_enough_data: {
    label: 'Not enough data',
    patientLabel: 'Not enough data yet',
    className: 'verdict-nodata',
    blurb: 'Too few episodes, periods, or too much missing data to judge.',
  },
}

export const WARNING_INFO: Record<string, string> = {
  incomplete_plan: 'Stopped early — results are incomplete',
  missing_data: 'Some days are missing data',
  few_episodes: 'Few episodes recorded',
  multiple_lags_tested: 'Several lags tested (p-value corrected)',
}

export function warningLabel(w: Warning): string {
  return WARNING_INFO[w] ?? w.replace(/_/g, ' ')
}

export function pct(n: number, digits = 1): string {
  const s = n.toFixed(digits)
  return n > 0 ? `+${s}%` : `${s}%`
}

/** "1.2%" style percentage of shuffles from a p-value. */
export function shufflePct(p: number): string {
  const v = p * 100
  if (v < 0.1) return '<0.1%'
  if (v < 10) return `${v.toFixed(1)}%`
  return `${Math.round(v)}%`
}
