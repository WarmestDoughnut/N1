/**
 * In-browser mock of the backend that follows docs/CONTRACT.md v1.0.
 * Used when USE_FIXTURES is on or the live API is unreachable.
 * If backend fixtures exist in src/fixtures (copied from shared/fixtures), they replace
 * the hand-written devices/patients here. Stats below are a simplified stand-in for the
 * backend's analysis — the backend is the source of truth.
 */
import type {
  Device,
  EpisodeCreate,
  Patient,
  PatientSeries,
  Plan,
  PlanAction,
  PlanCreate,
  PlanStatus,
  Results,
  ResultSeriesPoint,
  SchedulePeriod,
  SchedulePreviewParams,
  SeriesRow,
  SignalId,
  Verdict,
} from '../types'
import { addDays, gauss, mulberry32, nowIso, SIGNAL_INFO } from './util'
import { fixtureDevices, fixturePatients } from './fixtures'

export class MockHttpError extends Error {
  constructor(public status: number, public body: { error: string }) {
    super(body.error)
  }
}

// TEMP (see to-backend #2): patients.json references these ids but the 17-device catalog doesn't
// include them. Definitions copied from backend/data/synthetic/devices.json. Remove once fixed.
const LEGACY_DEVICES: Device[] = [
  { id: 'fitbit', name: 'Fitbit', availability: 'now', signals: ['sleep_min', 'resting_hr', 'hrv', 'steps', 'spo2', 'skin_temp_dev'] },
  { id: 'smart_ring', name: 'Smart ring (Oura-class)', availability: 'now', signals: ['sleep_min', 'resting_hr', 'hrv', 'skin_temp_dev', 'resp_rate'] },
  { id: 'cgm', name: 'Continuous glucose monitor', availability: 'now', signals: ['glucose_tir'] },
  { id: 'bp_wearable', name: 'Cuffless BP wearable', availability: 'emerging', signals: ['systolic_bp'] },
]
const withLegacy = (cat: Device[]) => [...cat, ...LEGACY_DEVICES.filter((l) => !cat.some((d) => d.id === l.id))]

const DEVICES: Device[] = fixtureDevices ? withLegacy(fixtureDevices) : [
  { id: 'iphone', name: 'iPhone', signals: ['steps', 'episode'] },
  { id: 'apple_watch', name: 'Apple Watch', signals: ['sleep_min', 'resting_hr', 'hrv', 'steps'] },
  { id: 'fitbit', name: 'Fitbit', signals: ['sleep_min', 'resting_hr', 'hrv', 'steps'] },
]

interface PatientSpec {
  patient: Patient
  seed: number
  episodes: number
  /** observational ground truth: sleep drop (min) `lag` days before episodes */
  sleepDrop?: { minutes: number; lag: number }
  /** intervention ground truth: added minutes of sleep on B days */
  treatEffect?: number
  missingRate?: number
}

const START = '2026-01-01'
const SPECS: PatientSpec[] = [
  { patient: mk('SYN-PATTERN', 'Patient A (synthetic)', 'synthetic', ['iphone', 'fitbit'], 120, 14), seed: 11, episodes: 14, sleepDrop: { minutes: 85, lag: 2 } },
  { patient: mk('SYN-NULL', 'Patient B (synthetic)', 'synthetic', ['iphone', 'fitbit'], 120, 14), seed: 22, episodes: 14 },
  { patient: mk('SYN-TREAT', 'Patient C (synthetic)', 'synthetic', ['iphone', 'apple_watch'], 120, 6), seed: 33, episodes: 6, treatEffect: 38 },
  { patient: mk('SYN-TREAT-NULL', 'Patient D (synthetic)', 'synthetic', ['iphone', 'apple_watch'], 120, 6), seed: 44, episodes: 6, treatEffect: 0 },
  { patient: mk('PMD-P01', 'Participant p01 (PMData)', 'pmdata', ['fitbit'], 150, 11, '2019-11-01'), seed: 55, episodes: 11, sleepDrop: { minutes: 30, lag: 1 }, missingRate: 0.06 },
]

function mk(id: string, name: string, source: string, devices: string[], n_days: number, n_episodes: number, start = START): Patient {
  return { id, display_name: name, source, devices, date_range: [start, addDays(start, n_days - 1)], n_days, n_episodes }
}

export const PATIENTS: Patient[] = fixturePatients ?? SPECS.map((s) => s.patient)

// ---------- data generation ----------
const seriesCache = new Map<string, SeriesRow[]>()
const extraEpisodes: Record<string, string[]> = load('n1mock.episodes', {})

/** Backend demo patients → mock generator with the same planted ground truth (CLAUDE.md §3). */
const ALIASES: Record<string, string> = {
  'P01-MARIA': 'SYN-PATTERN', 'P02-JAMES': 'SYN-NULL', 'P03-AISHA': 'SYN-TREAT', 'P04-ROBERT': 'SYN-TREAT-NULL',
  'P06-LEO': 'SYN-PATTERN', 'REAL-P07': 'PMD-P01',
}

function specFor(pid: string): PatientSpec {
  const known = SPECS.find((s) => s.patient.id === pid)
  if (known) return known
  const p = PATIENTS.find((x) => x.id === pid)!
  const alias = SPECS.find((s) => s.patient.id === ALIASES[pid])
  if (alias && p) return { ...alias, patient: p, episodes: p.n_episodes }
  let h = 0
  for (const c of pid) h = (h * 31 + c.charCodeAt(0)) | 0
  return { patient: p, seed: Math.abs(h) || 1, episodes: p.n_episodes }
}

function baseSeries(pid: string): SeriesRow[] {
  const cached = seriesCache.get(pid)
  if (cached) return cached
  const spec = specFor(pid)
  const p = spec.patient
  const rng = mulberry32(spec.seed)
  const n = p.n_days
  const rows: SeriesRow[] = []
  for (let i = 0; i < n; i++) {
    rows.push({
      date: addDays(p.date_range[0], i),
      sleep_min: Math.round(425 + 32 * gauss(rng)),
      resting_hr: Math.round(62 + 3 * gauss(rng)),
      hrv: Math.round(48 + 8 * gauss(rng)),
      steps: Math.max(500, Math.round(7200 + 2200 * gauss(rng))),
      episode: 0,
    })
  }
  // spread episodes roughly evenly with jitter, never in the first 4 days
  const gap = (n - 6) / spec.episodes
  for (let k = 0; k < spec.episodes; k++) {
    const idx = Math.min(n - 1, Math.round(5 + k * gap + rng() * (gap - 2)))
    rows[idx].episode = 1
  }
  if (spec.sleepDrop) {
    rows.forEach((r, i) => {
      if (r.episode) {
        for (let d = 1; d <= spec.sleepDrop!.lag; d++) {
          const j = i - d
          if (j >= 0 && !rows[j].episode) rows[j].sleep_min = Math.round((rows[j].sleep_min as number) - spec.sleepDrop!.minutes * (d === spec.sleepDrop!.lag ? 1 : 0.5))
        }
      }
    })
  }
  if (spec.missingRate) {
    rows.forEach((r) => {
      if (rng() < spec.missingRate!) { r.sleep_min = null; r.hrv = null }
    })
  }
  seriesCache.set(pid, rows)
  return rows
}

function seriesWithLogs(pid: string): SeriesRow[] {
  const extra = new Set(extraEpisodes[pid] ?? [])
  return baseSeries(pid).map((r) => (extra.has(r.date) ? { ...r, episode: 1 } : r))
}

// ---------- persistence ----------
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
}

let plans: Plan[] = load('n1mock.plans', [])
let results: Record<string, Results> = load('n1mock.results', {})
const persist = () => { save('n1mock.plans', plans); save('n1mock.results', results) }

export function resetMock() {
  plans = []
  results = {}
  for (const k of Object.keys(extraEpisodes)) delete extraEpisodes[k]
  persist()
  save('n1mock.episodes', extraEpisodes)
}

// ---------- schedule ----------
export function makeSchedule(p: SchedulePreviewParams): SchedulePeriod[] {
  const rng = mulberry32(p.seed)
  const out: SchedulePeriod[] = []
  let cur = p.start
  for (let pair = 0; pair < Math.ceil(p.n_periods / 2); pair++) {
    const arms: ('A' | 'B')[] = rng() < 0.5 ? ['A', 'B'] : ['B', 'A']
    for (const arm of arms) {
      if (out.length >= p.n_periods) break
      const end = addDays(cur, p.period_days - 1)
      const washout_end = addDays(end, p.washout_days)
      out.push({ period: out.length + 1, arm, start: cur, end, washout_end })
      cur = addDays(washout_end, 1)
    }
  }
  return out
}

// ---------- analysis (simplified mirror of contract rules) ----------
function mean(xs: number[]) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN }

function verdictFor(p: number, effect: number, matches: boolean, enough: boolean): Verdict {
  if (!enough) return 'not_enough_data'
  if (p < 0.05 && Math.abs(effect) >= 5 && matches) return 'likely_real'
  if (p < 0.15 && matches) return 'suggestive'
  return 'probably_chance'
}

function computeObservational(plan: Plan, incomplete: boolean): Results {
  const cfg = plan.observational!
  const rows = seriesWithLogs(plan.patient_id).filter((r) => r.date >= plan.window.start && r.date <= plan.window.end)
  // Stopped early: only the first half of the window was collected (same stand-in as the
  // intervention mock). Later days are never seen, so neither readings nor episodes count.
  const collected = incomplete ? Math.ceil(rows.length / 2) : rows.length
  const vals = rows.map((r, i) => (i < collected ? (r[cfg.signal] ?? null) : null) as number | null)
  const eps = rows.map((r, i) => (i < collected && r.episode ? 1 : 0))
  const n = rows.length
  const sign = cfg.direction === 'lower' ? -1 : 1
  const rng = mulberry32(1234)

  const effectAt = (epIdx: number[], lag: number) => {
    const inWin = new Array(n).fill(false)
    const isEp = new Array(n).fill(false)
    epIdx.forEach((i) => { isEp[i] = true })
    epIdx.forEach((i) => { for (let d = 1; d <= lag; d++) if (i - d >= 0) inWin[i - d] = true })
    const a: number[] = [], b: number[] = []
    for (let i = 0; i < n; i++) {
      const v = vals[i]
      if (v == null || isEp[i]) continue
      ;(inWin[i] ? a : b).push(v)
    }
    const m1 = mean(a), m0 = mean(b)
    return { eff: ((m1 - m0) / m0) * 100, m1, m0, inWin }
  }

  const epIdx = eps.flatMap((e, i) => (e ? [i] : []))
  const lags = Array.from({ length: Math.max(1, cfg.max_lag_days) }, (_, i) => i + 1)
  const observed = lags.map((l) => effectAt(epIdx, l))
  const N_PERM = 2000
  const nullMax: number[] = []
  const nullPerLag: number[][] = lags.map(() => [])
  for (let k = 0; k < N_PERM; k++) {
    const shuffled = new Set<number>()
    while (shuffled.size < epIdx.length) shuffled.add(Math.floor(rng() * n))
    const idx = [...shuffled]
    let best = -Infinity
    let bestRaw = 0
    lags.forEach((l, li) => {
      const e = effectAt(idx, l).eff
      nullPerLag[li].push(e)
      if (sign * e > best) { best = sign * e; bestRaw = e }
    })
    nullMax.push(bestRaw)
  }
  const lag_scan = lags.map((l, li) => {
    const e = observed[li].eff
    const p = (nullMax.filter((x) => sign * x >= sign * e).length + 1) / (N_PERM + 1)
    return { lag_days: l, effect_pct: round1(e), p_value: round3(p) }
  })
  const bestIdx = lag_scan.reduce((bi, x, i, arr) => (sign * x.effect_pct > sign * arr[bi].effect_pct ? i : bi), 0)
  const best = lag_scan[bestIdx]
  const bestObs = observed[bestIdx]
  const missingFrac = vals.slice(0, collected).filter((v) => v == null).length / Math.max(1, collected)
  const warnings: string[] = []
  if (incomplete) warnings.push('incomplete_plan')
  if (missingFrac > 0.05) warnings.push('missing_data')
  if (epIdx.length < 8) warnings.push('few_episodes')
  if (lags.length > 1) warnings.push('multiple_lags_tested')
  const enough = epIdx.length >= 5 && missingFrac <= 0.4
  const matches = sign * best.effect_pct > 0
  const verdict = verdictFor(best.p_value, best.effect_pct, matches, enough)
  const sig = SIGNAL_INFO[cfg.signal]
  const word = best.effect_pct < 0 ? 'lower' : 'higher'
  const headline = !enough
    ? `Only ${epIdx.length} episodes so far — not enough to judge.`
    : `${sig.label} was ${Math.abs(best.effect_pct).toFixed(0)}% ${word} in the ${best.lag_days} day${best.lag_days > 1 ? 's' : ''} before episodes.`
  const patient_headline = {
    likely_real: `${cap(word === 'lower' ? 'less' : 'more')} ${sig.plain} often came before your episodes. Worth discussing with your clinician.`,
    suggestive: `There may be a link between your ${sig.plain} and your episodes, but it isn't clear yet. Worth discussing with your clinician.`,
    probably_chance: `Your ${sig.plain} didn't change in a consistent way before your episodes. Worth discussing with your clinician.`,
    not_enough_data: `There isn't enough data yet to tell. Worth discussing with your clinician.`,
  }[verdict]

  const series: ResultSeriesPoint[] = rows.map((r, i) => ({
    date: r.date, value: vals[i], episode: eps[i], arm: null, in_window: bestObs.inWin[i] && !eps[i],
  }))
  return {
    plan_id: plan.id, type: 'observational', complete: !incomplete, verdict, headline, patient_headline,
    effect_pct: best.effect_pct, p_value: best.p_value, n_permutations: N_PERM, n_episodes: epIdx.length, n_days: n, warnings,
    observational: { best_lag_days: best.lag_days, lag_scan, pre_episode_mean: round1(bestObs.m1), baseline_mean: round1(bestObs.m0) },
    intervention: null, null_distribution: nullMax.slice(0, 500).map(round1), series, model: mockModel(plan, verdict),
  }
}

function computeIntervention(plan: Plan, incomplete: boolean): Results {
  const cfg = plan.intervention!
  const spec = specFor(plan.patient_id)
  const treat = spec.treatEffect ?? 0
  const all = seriesWithLogs(plan.patient_id)
  const byDate = new Map(all.map((r) => [r.date, r]))
  // stopped early: only the first half of the periods were collected
  const periods = incomplete ? cfg.schedule.slice(0, Math.ceil(cfg.schedule.length / 2)) : cfg.schedule
  const series: ResultSeriesPoint[] = []
  const period_means: { period: number; arm: 'A' | 'B'; mean: number }[] = []
  let missing = 0, total = 0
  for (const p of cfg.schedule) {
    const used = periods.includes(p)
    const vs: number[] = []
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) {
      const r = byDate.get(d)
      let v = r ? ((r[cfg.outcome_signal] ?? null) as number | null) : null
      if (v != null && p.arm === 'B' && cfg.outcome_signal === 'sleep_min') v = Math.round(v + treat)
      if (!used) v = null
      series.push({ date: d, value: v, episode: r?.episode ?? 0, arm: p.arm, in_window: false })
      if (used) { total++; if (v == null) missing++; else vs.push(v) }
    }
    for (let d = addDays(p.end, 1); d <= p.washout_end; d = addDays(d, 1)) {
      const r = byDate.get(d)
      series.push({ date: d, value: used && r ? ((r[cfg.outcome_signal] ?? null) as number | null) : null, episode: r?.episode ?? 0, arm: 'washout', in_window: false })
    }
    if (used && vs.length) period_means.push({ period: p.period, arm: p.arm, mean: round1(mean(vs)) })
  }
  const a = period_means.filter((x) => x.arm === 'A').map((x) => x.mean)
  const b = period_means.filter((x) => x.arm === 'B').map((x) => x.mean)
  const mean_a = mean(a), mean_b = mean(b)
  const eff = ((mean_b - mean_a) / mean_a) * 100
  // Exact permutation test under the block design (CLAUDE.md §3): each AB/BA block can be
  // flipped independently, so there are 2^k labelings for k blocks; smallest p = 1/2^k.
  const nulls: number[] = []
  const used = period_means
  const k = Math.floor(used.length / 2)
  if (k >= 1 && k <= 12) {
    for (let mask = 0; mask < 1 << k; mask++) {
      const arms = used.map((pm, i) => {
        const b = Math.floor(i / 2)
        const flip = b < k && (mask >> b) & 1
        return flip ? (pm.arm === 'A' ? 'B' : 'A') : pm.arm
      })
      const ma = mean(used.filter((_, i) => arms[i] === 'A').map((x) => x.mean))
      const mb = mean(used.filter((_, i) => arms[i] === 'B').map((x) => x.mean))
      nulls.push(((mb - ma) / ma) * 100)
    }
  }
  const N_PERM = nulls.length
  const sign = cfg.better === 'higher' ? 1 : -1
  const p = N_PERM ? nulls.filter((x) => sign * x >= sign * eff - 1e-9).length / N_PERM : 1
  const enoughBlocks = k >= 5
  const enough = a.length >= 2 && b.length >= 2 && enoughBlocks && missing / Math.max(1, total) <= 0.4
  const verdict = verdictFor(p, eff, sign * eff > 0, enough)
  const warnings: string[] = []
  if (incomplete) warnings.push('incomplete_plan')
  if (!enoughBlocks) warnings.push('too_few_periods')
  const sig = SIGNAL_INFO[cfg.outcome_signal]
  const headline = enough
    ? `${sig.label} was ${Math.abs(eff).toFixed(0)}% ${eff >= 0 ? 'higher' : 'lower'} on "${cfg.arm_b}" than on "${cfg.arm_a}".`
    : `Only ${k} A/B block${k === 1 ? '' : 's'} — at least 5 are needed to judge.`
  const patient_headline = {
    likely_real: `Your ${sig.plain} was ${eff >= 0 ? 'better' : 'worse'} during "${cfg.arm_b}" periods. Worth discussing with your clinician.`,
    suggestive: `"${cfg.arm_b}" may have made a difference to your ${sig.plain}, but it isn't clear yet. Worth discussing with your clinician.`,
    probably_chance: `Your ${sig.plain} was about the same with and without "${cfg.arm_b}". Worth discussing with your clinician.`,
    not_enough_data: `There isn't enough data yet to tell. Worth discussing with your clinician.`,
  }[verdict]
  return {
    plan_id: plan.id, type: 'intervention', complete: !incomplete, verdict, headline, patient_headline,
    effect_pct: round1(eff), p_value: round3(p), n_permutations: N_PERM, n_episodes: null, n_days: series.length, warnings,
    observational: null,
    intervention: { mean_a: round1(mean_a), mean_b: round1(mean_b), effect_pct: round1(eff), n_periods_a: a.length, n_periods_b: b.length, period_means },
    null_distribution: nulls.slice(0, 500).map(round1), series, model: null,
  }
}

function mockModel(plan: Plan, verdict: Verdict): Results['model'] {
  if (plan.type !== 'observational') return null
  // Backend rule (to-frontend 11:55): only fit when the screening test found a candidate signal.
  if (verdict === 'not_enough_data') return { kind: 'logistic_l2', auc: null, auc_null_p: null, coefficients: [], risk_tomorrow: null, trained: false, reason: 'too_few_episodes' }
  if (verdict === 'probably_chance') return { kind: 'logistic_l2', auc: null, auc_null_p: null, coefficients: [], risk_tomorrow: null, trained: false, reason: 'no_primary_signal' }
  const strong = verdict === 'likely_real'
  return {
    kind: 'logistic_l2', auc: strong ? 0.74 : 0.52, auc_null_p: strong ? 0.03 : 0.46,
    coefficients: [
      { feature: `${plan.observational!.signal}_lag${strong ? 2 : 1}`, weight: strong ? -0.82 : -0.07 },
      { feature: 'steps_lag1', weight: strong ? -0.12 : 0.05 },
      { feature: 'resting_hr_lag1', weight: strong ? 0.21 : 0.02 },
    ],
    risk_tomorrow: strong ? 0.32 : 0.12, trained: true, reason: null,
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10
const round3 = (x: number) => Math.round(x * 10000) / 10000
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function summaryFor(p: PlanCreate): string {
  const devs = p.devices.map((d) => DEVICES.find((x) => x.id === d)?.name ?? d)
  const sigs = p.signals.filter((s) => s !== 'episode').map((s) => SIGNAL_INFO[s]?.plain ?? s)
  const from = `${sigs.join(', ') || 'your data'} from your ${devs.join(' and ')}${p.signals.includes('episode') ? ' and your episode log' : ''}`
  const what = p.type === 'observational'
    ? `check whether ${p.observational!.direction === 'lower' ? 'lower' : 'higher'} ${SIGNAL_INFO[p.observational!.signal].plain} tends to come before your episodes`
    : `compare your ${SIGNAL_INFO[p.intervention!.outcome_signal].plain} on "${p.intervention!.arm_b}" versus "${p.intervention!.arm_a}", switching on a set schedule`
  return `${p.clinician_name} wants to ${what}. This test uses ${from} from ${p.window.start} to ${p.window.end}. Nothing else is shared. You can pause or stop at any time.`
}

// ---------- transitions ----------
const TRANSITIONS: Record<PlanAction, { from: PlanStatus[]; to: PlanStatus }> = {
  approve: { from: ['pending_approval'], to: 'active' },
  decline: { from: ['pending_approval'], to: 'declined' },
  pause: { from: ['active'], to: 'paused' },
  resume: { from: ['paused'], to: 'active' },
  stop: { from: ['active', 'paused'], to: 'stopped' },
}

function getPlanOr404(id: string): Plan {
  const p = plans.find((x) => x.id === id)
  if (!p) throw new MockHttpError(404, { error: 'not_found' })
  return p
}

function computeResults(plan: Plan, incomplete: boolean) {
  results[plan.id] = plan.type === 'observational' ? computeObservational(plan, incomplete) : computeIntervention(plan, incomplete)
}

// ---------- endpoint handlers ----------
export const mock = {
  health: async () => ({ ok: true, contract_version: '1.0' }),
  devices: async () => structuredClone(DEVICES),
  patients: async () => structuredClone(PATIENTS),
  series: async (pid: string, signals: SignalId[], planId: string): Promise<PatientSeries> => {
    const plan = plans.find((p) => p.id === planId)
    if (!plan || plan.patient_id !== pid || !['active', 'paused', 'stopped', 'complete'].includes(plan.status))
      throw new MockHttpError(403, { error: 'not_in_scope' })
    const allowed = signals.filter((s) => plan.signals.includes(s))
    if (allowed.length !== signals.length) throw new MockHttpError(403, { error: 'not_in_scope' })
    const rows = seriesWithLogs(pid)
      .filter((r) => r.date >= plan.window.start && r.date <= plan.window.end)
      .map((r) => { const o: SeriesRow = { date: r.date }; allowed.forEach((s) => { o[s] = r[s] ?? null }); return o })
    return { patient_id: pid, rows }
  },
  logEpisode: async (e: EpisodeCreate) => {
    extraEpisodes[e.patient_id] = [...(extraEpisodes[e.patient_id] ?? []), e.date]
    save('n1mock.episodes', extraEpisodes)
    seriesCache.delete(e.patient_id)
    return { ok: true as const }
  },
  listPlans: async (pid?: string) => structuredClone(plans.filter((p) => !pid || p.patient_id === pid)),
  getPlan: async (id: string) => structuredClone(getPlanOr404(id)),
  createPlan: async (body: PlanCreate): Promise<Plan> => {
    const id = `PLAN-${plans.length + 1}`
    const at = nowIso()
    const intervention = body.intervention
      ? { ...body.intervention, schedule: body.intervention.schedule ?? makeSchedule({ ...body.intervention, start: body.window.start }) }
      : null
    const plan: Plan = { ...body, intervention, id, status: 'pending_approval', created_at: at, patient_summary: summaryFor(body), history: [{ at, event: 'created' }] }
    plans.push(plan)
    persist()
    return structuredClone(plan)
  },
  action: async (id: string, action: PlanAction): Promise<Plan> => {
    const p = getPlanOr404(id)
    const t = TRANSITIONS[action]
    if (!t.from.includes(p.status)) throw new MockHttpError(409, { error: 'invalid_transition' })
    p.status = t.to
    p.history.push({ at: nowIso(), event: { approve: 'approved', decline: 'declined', pause: 'paused', resume: 'resumed', stop: 'stopped' }[action] })
    if (action === 'stop') computeResults(p, true)
    persist()
    return structuredClone(p)
  },
  simulateComplete: async (id: string): Promise<Plan> => {
    const p = getPlanOr404(id)
    if (!['active', 'paused'].includes(p.status)) throw new MockHttpError(409, { error: 'invalid_transition' })
    p.status = 'complete'
    p.history.push({ at: nowIso(), event: 'complete (simulated)' })
    computeResults(p, false)
    persist()
    return structuredClone(p)
  },
  schedulePreview: async (q: SchedulePreviewParams) => ({ schedule: makeSchedule(q) }),
  results: async (id: string): Promise<Results> => {
    getPlanOr404(id)
    const r = results[id]
    if (!r) throw new MockHttpError(404, { error: 'no_results' })
    return structuredClone(r)
  },
}

// ---------- sample results for the gallery (not persisted) ----------
export function sampleResults(): { name: string; plan: Plan; results: Results }[] {
  const pat = (id: string) => PATIENTS.find((p) => p.id === id) ?? SPECS.find((s) => s.patient.id === id)!.patient
  const obs = (pid: string, title: string, maxLag = 3): Plan => {
    const p = pat(pid)
    return {
      id: `SAMPLE-${pid}`, patient_id: pid, clinician_name: 'Dr. Rivera', title, type: 'observational',
      devices: p.devices, signals: ['sleep_min', 'episode'], window: { start: p.date_range[0], end: p.date_range[1] },
      status: 'complete', created_at: nowIso(), observational: { signal: 'sleep_min', direction: 'lower', max_lag_days: maxLag },
      intervention: null, patient_summary: '', history: [],
    }
  }
  const iv = (pid: string): Plan => {
    const p = pat(pid)
    const cfg = { arm_a: 'No melatonin', arm_b: 'Melatonin 3mg', outcome_signal: 'sleep_min' as SignalId, better: 'higher' as const, period_days: 6, washout_days: 2, n_periods: 12, seed: 42 }
    const schedule = makeSchedule({ ...cfg, start: p.date_range[0] })
    return {
      id: `SAMPLE-${pid}`, patient_id: pid, clinician_name: 'Dr. Rivera', title: 'Does melatonin improve sleep?', type: 'intervention',
      devices: p.devices, signals: ['sleep_min'], window: { start: p.date_range[0], end: schedule[schedule.length - 1].washout_end },
      status: 'complete', created_at: nowIso(), observational: null, intervention: { ...cfg, schedule }, patient_summary: '', history: [],
    }
  }
  const short = obs('SYN-PATTERN', 'Does low sleep precede episodes? (first 3 weeks only)')
  short.window = { start: short.window.start, end: addDays(short.window.start, 20) }
  const out = [
    { name: 'Observational · SYN-PATTERN (should pass)', plan: obs('SYN-PATTERN', 'Does low sleep precede episodes?'), incomplete: false },
    { name: 'Observational · SYN-NULL (should be chance)', plan: obs('SYN-NULL', 'Does low sleep precede episodes?'), incomplete: false },
    { name: 'Intervention · SYN-TREAT (should pass)', plan: iv('SYN-TREAT'), incomplete: false },
    { name: 'Intervention · SYN-TREAT-NULL (should be chance)', plan: iv('SYN-TREAT-NULL'), incomplete: false },
    { name: 'Observational · stopped early (not enough data)', plan: short, incomplete: true },
  ]
  return out.map(({ name, plan, incomplete }) => ({
    name, plan,
    results: plan.type === 'observational' ? computeObservational(plan, incomplete) : computeIntervention(plan, incomplete),
  }))
}
