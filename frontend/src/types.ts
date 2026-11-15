// Mirrors docs/CONTRACT.md v1.0 exactly. Do not change without the CHANGE-REQUEST protocol.

export type SignalId = 'sleep_min' | 'resting_hr' | 'hrv' | 'steps' | 'episode'
export type DeviceId = string // catalog ids, e.g. "iphone" | "apple_watch" | "fitbit"

export interface Device {
  id: DeviceId
  name: string
  signals: SignalId[]
}

export interface Patient {
  id: string
  display_name: string
  source: 'synthetic' | 'pmdata' | string
  devices: DeviceId[]
  date_range: [string, string]
  n_days: number
  n_episodes: number
}

export interface SeriesRow {
  date: string
  sleep_min?: number | null
  resting_hr?: number | null
  hrv?: number | null
  steps?: number | null
  episode?: number | null
}

export interface PatientSeries {
  patient_id: string
  rows: SeriesRow[]
}

export interface EpisodeCreate {
  patient_id: string
  date: string
  note?: string
}

export type PlanType = 'observational' | 'intervention'
export type Direction = 'lower' | 'higher'
export type PlanStatus =
  | 'pending_approval'
  | 'active'
  | 'paused'
  | 'stopped'
  | 'complete'
  | 'declined'

export interface ObservationalConfig {
  signal: SignalId
  direction: Direction
  max_lag_days: number
}

export type Arm = 'A' | 'B'

export interface SchedulePeriod {
  period: number
  arm: Arm
  start: string
  end: string
  washout_end: string
}

export interface InterventionConfig {
  arm_a: string
  arm_b: string
  outcome_signal: SignalId
  better: Direction
  period_days: number
  washout_days: number
  n_periods: number
  seed: number
  schedule: SchedulePeriod[]
}

export interface PlanHistoryEvent {
  at: string
  event: string
}

export interface Plan {
  id: string
  patient_id: string
  clinician_name: string
  title: string
  type: PlanType
  devices: DeviceId[]
  signals: SignalId[]
  window: { start: string; end: string }
  status: PlanStatus
  created_at: string
  observational: ObservationalConfig | null
  intervention: InterventionConfig | null
  patient_summary: string
  history: PlanHistoryEvent[]
}

/** POST /api/plans body: plan fields minus id,status,created_at,history,patient_summary.
 *  For intervention, `schedule` may be omitted (server generates it). */
export type PlanCreate = Omit<
  Plan,
  'id' | 'status' | 'created_at' | 'history' | 'patient_summary' | 'intervention'
> & {
  intervention: (Omit<InterventionConfig, 'schedule'> & { schedule?: SchedulePeriod[] }) | null
}

export type PlanAction = 'approve' | 'decline' | 'pause' | 'resume' | 'stop'

export interface SchedulePreviewParams {
  n_periods: number
  period_days: number
  washout_days: number
  seed: number
  start: string
}

export type Verdict = 'likely_real' | 'suggestive' | 'probably_chance' | 'not_enough_data'
export type Warning = 'incomplete_plan' | 'missing_data' | 'few_episodes' | 'multiple_lags_tested' | string

export interface LagScanEntry {
  lag_days: number
  effect_pct: number
  p_value: number
}

export interface ObservationalResult {
  best_lag_days: number
  lag_scan: LagScanEntry[]
  pre_episode_mean: number
  baseline_mean: number
}

export interface PeriodMean {
  period: number
  arm: Arm
  mean: number
}

export interface InterventionResult {
  mean_a: number
  mean_b: number
  effect_pct: number
  n_periods_a: number
  n_periods_b: number
  period_means: PeriodMean[]
}

export interface ResultSeriesPoint {
  date: string
  value: number | null
  episode: number | null
  arm: 'A' | 'B' | 'washout' | null
  in_window: boolean
}

export interface ModelResult {
  kind: string
  auc: number | null
  auc_null_p: number | null
  coefficients: { feature: string; weight: number }[]
  risk_tomorrow: number | null
  trained: boolean
  reason: string | null
}

export interface Results {
  plan_id: string
  type: PlanType
  complete: boolean
  verdict: Verdict
  headline: string
  patient_headline: string
  effect_pct: number
  p_value: number
  n_permutations: number
  n_episodes: number | null
  n_days: number
  warnings: Warning[]
  observational: ObservationalResult | null
  intervention: InterventionResult | null
  null_distribution: number[]
  series: ResultSeriesPoint[]
  model: ModelResult | null
}

export interface Health {
  ok: boolean
  contract_version: string
}

export type Role = 'clinician' | 'patient'
