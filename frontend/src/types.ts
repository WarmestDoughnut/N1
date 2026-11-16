// Mirrors docs/CONTRACT.md v1.0 exactly. Do not change without the CHANGE-REQUEST protocol.

// v1.1: daily-table signals that can be analyzed. Device catalogs may list more ("supported soon").
export type SignalId =
  | 'sleep_min' | 'resting_hr' | 'hrv' | 'steps' | 'episode'
  | 'skin_temp_dev' | 'resp_rate' | 'spo2' | 'systolic_bp' | 'glucose_tir' | 'walking_speed'
  // self-reported in the patient app (backend data pending, see frontend-agents sync #10)
  | 'mood_log' | 'pain_level'
  // v1.4 phone-only signals (P08-SAM; backend demo script)
  | 'screen_time_min' | 'late_screen_min'
export type DeviceId = string // catalog ids, e.g. "iphone" | "apple_watch" | "fitbit"

export interface Device {
  id: DeviceId
  name: string
  /** may include catalog-only signals that aren't in the daily table yet */
  signals: SignalId[]
  category?: string
  availability?: 'now' | 'emerging'
  access?: string
  notes?: string
}

export interface Patient {
  id: string
  display_name: string
  source: 'synthetic' | 'real' | string
  devices: DeviceId[]
  date_range: [string, string]
  n_days: number
  n_episodes: number
  condition?: string
  story?: string
  signals_present?: SignalId[]
  citation?: string
}

export interface SeriesRow {
  date: string
  sleep_min?: number | null
  resting_hr?: number | null
  hrv?: number | null
  steps?: number | null
  episode?: number | null
  skin_temp_dev?: number | null
  resp_rate?: number | null
  spo2?: number | null
  systolic_bp?: number | null
  glucose_tir?: number | null
  walking_speed?: number | null
  screen_time_min?: number | null
  late_screen_min?: number | null
  mood_log?: number | null
  pain_level?: number | null
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
  /** v1.4: look-back range is min_lag_days..max_lag_days (1 ≤ min ≤ max ≤ 14); omitted min = 1 */
  min_lag_days?: number
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
  /** v1.3: one of the 8 pre-built demo plans whose schedule the historical data actually followed */
  seeded?: boolean
  /** v1.7 review gate: the clinician has released this test's result to the patient */
  patient_released?: boolean
  /** v1.7: derived; true when the patient can see the result (always true for data collections) */
  results_released?: boolean
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
  /** v1.4 plain-language fields so the UI needn't show raw AUC / feature names */
  quality?: 'strong' | 'moderate' | 'weak'
  beats_chance?: boolean
  plain?: string
  coefficients: { feature: string; weight: number; label?: string }[]
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
  /** v1.2: days with no reading (observational: window days; intervention: scheduled non-washout days) */
  n_missing_days?: number
  /** v1.2: stopped-early plans are cut here; later days are omitted from `series`. null when complete. */
  collected_until?: string | null
  observational: ObservationalResult | null
  intervention: InterventionResult | null
  null_distribution: number[]
  series: ResultSeriesPoint[]
  model: ModelResult | null
  /** v1.7 review gate: a test verdict is withheld from the patient until the clinician releases it.
   * When `awaiting_review` is true (patient view only), verdict/headline/observational/intervention are null. */
  awaiting_review?: boolean
  patient_released?: boolean
}

export interface Health {
  ok: boolean
  contract_version: string
  /** v1.3: which persistence the backend is using */
  store?: 'json' | 'postgres'
  /** assistant kill switch: hide the chatbot when false */
  assistant_enabled?: boolean
}

// ---------- Physician assistant (design copilot), backend to-frontend #14 ----------
export interface AssistantMessage { role: 'user' | 'assistant'; content: string }
export interface AssistantRequest {
  /** chat turns; the first must be from the user */
  messages: AssistantMessage[]
  /** current wizard context, when the chat is opened from the wizard */
  capabilities?: { available_signals?: string[]; present_signals?: string[]; devices?: string[] }
  /** optional compact, label-only snapshot of the clinician's own dashboard (for "summarize today") */
  context?: Record<string, unknown>
}
export interface AssistantResponse {
  /** markdown; may end with one fenced ```json block containing {"draft_plan": {...}} */
  reply: string
}

export type Role = 'clinician' | 'patient'

// ---------- Accounts & clinician↔patient connections (proposed v1.2, see to-backend #3) ----------

export interface Account {
  id: string
  role: Role
  name: string
  email: string
  /** patient accounts: the patient record this account owns */
  patient_id?: string | null
  /** clinician accounts */
  specialty?: string | null
  /** clinician accounts: short code patients enter to add this clinician */
  connect_code?: string | null
}

export interface LoginResponse {
  account: Account
  /** opaque; send as `Authorization: Bearer <token>` */
  token: string
}

export type ConnectionStatus = 'pending' | 'active'

export interface Connection {
  id: string
  clinician_id: string
  clinician_name: string
  clinician_specialty?: string | null
  patient_id: string
  patient_name: string
  status: ConnectionStatus
  requested_by: Role
  created_at: string
}

/** GET /api/accounts/demo — quick-pick list on the sign-in page (demo build only) */
export interface DemoAccount {
  email: string
  name: string
  role: Role
  detail: string
}
