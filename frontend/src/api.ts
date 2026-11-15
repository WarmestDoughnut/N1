/**
 * Typed client for every endpoint in docs/CONTRACT.md v1.0.
 *
 * USE_FIXTURES: when true — or when the live backend is unreachable — calls are served by the
 * in-browser mock (src/lib/mockServer.ts), which uses backend fixtures from shared/fixtures when
 * present. Turn on with VITE_USE_FIXTURES=true, or the "Data source" toggle in the top bar.
 */
import type {
  Device,
  EpisodeCreate,
  Health,
  Patient,
  PatientSeries,
  Plan,
  PlanAction,
  PlanCreate,
  Results,
  SchedulePeriod,
  SchedulePreviewParams,
  SignalId,
} from './types'
import { mock, MockHttpError, resetMock } from './lib/mockServer'

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export type DataSource = 'live' | 'fixtures'

const envFixtures = import.meta.env.VITE_USE_FIXTURES === 'true'
function readPref(): DataSource | null {
  try { return (localStorage.getItem('n1.dataSource') as DataSource | null) ?? null } catch { return null }
}

/** Current mode. Starts from env / saved preference; flips to 'fixtures' if the backend is down. */
let source: DataSource = readPref() ?? (envFixtures ? 'fixtures' : 'live')
let fellBack = false
const listeners = new Set<() => void>()

export function getDataSource() { return { source, fellBack } }
export function setDataSource(s: DataSource) {
  source = s
  fellBack = false
  try { localStorage.setItem('n1.dataSource', s) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
export function onDataSourceChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
export function resetMockData() { resetMock(); listeners.forEach((l) => l()) }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

const FRIENDLY: Record<string, string> = {
  not_in_scope: "That data isn't part of an approved test plan, so it can't be shown.",
  invalid_transition: "That action isn't available for this plan right now. It may have already changed — try refreshing.",
  no_results: "Results aren't ready yet. They appear once the plan is complete or stopped.",
  not_found: "We couldn't find that item. It may have been removed.",
}

export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Something went wrong. Please try again.'
}

function toApiError(status: number, code: string): ApiError {
  const fallback =
    status === 403 ? "You don't have access to that." :
    status === 404 ? "We couldn't find that." :
    status === 409 ? "That action isn't allowed right now." :
    status === 422 ? 'Some of the plan details are invalid. Please check the form.' :
    `The server had a problem (${status}). Please try again.`
  return new ApiError(status, code, FRIENDLY[code] ?? fallback)
}

/** After any successful write, let every view refetch (keeps badges/lists in sync). */
function notifyMutation(method: string) {
  if (method !== 'GET') setTimeout(() => listeners.forEach((l) => l()), 0)
}

async function call<T>(method: string, path: string, body: unknown, viaMock: () => Promise<T>): Promise<T> {
  const out = await callRaw<T>(method, path, body, viaMock)
  notifyMutation(method)
  return out
}

async function callRaw<T>(method: string, path: string, body: unknown, viaMock: () => Promise<T>): Promise<T> {
  const runMock = async () => {
    try {
      return await viaMock()
    } catch (e) {
      if (e instanceof MockHttpError) throw toApiError(e.status, e.body.error)
      throw e
    }
  }
  if (source === 'fixtures') return runMock()

  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    // Backend unreachable → fall back to fixtures/mock so the UI keeps working.
    source = 'fixtures'
    fellBack = true
    listeners.forEach((l) => l())
    return runMock()
  }
  if (!res.ok) {
    let code = ''
    try {
      const j = await res.json()
      code = typeof j?.error === 'string' ? j.error : ''
    } catch { /* not JSON */ }
    throw toApiError(res.status, code)
  }
  return (await res.json()) as T
}

const enc = encodeURIComponent

export const api = {
  health: () => call<Health>('GET', '/api/health', undefined, mock.health),
  devices: () => call<Device[]>('GET', '/api/devices', undefined, mock.devices),
  patients: () => call<Patient[]>('GET', '/api/patients', undefined, mock.patients),
  series: (patientId: string, signals: SignalId[], planId: string) =>
    call<PatientSeries>(
      'GET',
      `/api/patients/${enc(patientId)}/series?signals=${signals.map(enc).join(',')}&plan_id=${enc(planId)}`,
      undefined,
      () => mock.series(patientId, signals, planId),
    ),
  logEpisode: (body: EpisodeCreate) => call<{ ok: true }>('POST', '/api/episodes', body, () => mock.logEpisode(body)),

  listPlans: (patientId?: string) =>
    call<Plan[]>('GET', `/api/plans${patientId ? `?patient_id=${enc(patientId)}` : ''}`, undefined, () => mock.listPlans(patientId)),
  getPlan: (id: string) => call<Plan>('GET', `/api/plans/${enc(id)}`, undefined, () => mock.getPlan(id)),
  createPlan: (body: PlanCreate) => call<Plan>('POST', '/api/plans', body, () => mock.createPlan(body)),
  planAction: (id: string, action: PlanAction) =>
    call<Plan>('POST', `/api/plans/${enc(id)}/${action}`, undefined, () => mock.action(id, action)),
  approve: (id: string) => api.planAction(id, 'approve'),
  decline: (id: string) => api.planAction(id, 'decline'),
  pause: (id: string) => api.planAction(id, 'pause'),
  resume: (id: string) => api.planAction(id, 'resume'),
  stop: (id: string) => api.planAction(id, 'stop'),
  simulateComplete: (id: string) =>
    call<Plan>('POST', `/api/plans/${enc(id)}/simulate-complete`, undefined, () => mock.simulateComplete(id)),
  schedulePreview: (q: SchedulePreviewParams) =>
    call<{ schedule: SchedulePeriod[] }>(
      'GET',
      `/api/schedule/preview?n_periods=${q.n_periods}&period_days=${q.period_days}&washout_days=${q.washout_days}&seed=${q.seed}&start=${enc(q.start)}`,
      undefined,
      () => mock.schedulePreview(q),
    ),
  results: (planId: string) => call<Results>('GET', `/api/plans/${enc(planId)}/results`, undefined, () => mock.results(planId)),
}
