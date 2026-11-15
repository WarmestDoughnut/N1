/* v1.5 data layer (to-backend #11, proposed): symptoms, notes, instructions, collections,
 * analyses, clinician comment/review. Every call goes through api.ts's `call` with
 * `optional = true`, so while the live backend is still on v1.4 (404/405 on these paths)
 * each call falls back to the in-browser mock below. When the backend ships a field under
 * a different name, change it here only. */
import { call } from '../api'
import { getSession } from './session'
import type { Plan, Results, SignalId } from '../types'

// ---------- types (move into types.ts whenever FE-MAIN likes) ----------
export type SymptomKind = 'symptom' | 'condition' | 'event'
export interface Symptom { id: string; name: string; kind: SymptomKind; created_by: 'patient' | 'clinician'; created_at: string }
export interface Note { id: string; author_role: 'patient' | 'clinician'; author_name: string; text: string; created_at: string }
export type Assignment = 'manual' | 'randomized'
/** v1.5 additions on a plan (all optional so v1.4 plans still type-check) */
export interface PlanV15Fields {
  instructions?: string | null
  observational?: (NonNullable<Plan['observational']> & { symptom_id?: string | null }) | null
  intervention?: (NonNullable<Plan['intervention']> & { assignment?: Assignment }) | null
}
export type PlanV15 = Omit<Plan, 'observational' | 'intervention'> & PlanV15Fields
export interface ResultsV15Fields { clinician_comment?: { text: string; at: string } | null; reviewed_at?: string | null }
export type ResultsV15 = Results & ResultsV15Fields
export interface CollectionSummary { n_days: number; per_signal: Partial<Record<SignalId, { days_with_data: number; missing_pct: number }>> }

/** B3: a test run on a collection's data = normal Results + id/created_at */
export interface AnalysisConfig { observational?: (Plan['observational'] & { symptom_id?: string | null }) | null; intervention?: Plan['intervention'] | null }
/** `config` = what was tested (requested from the backend; until it ships, remembered in this browser) */
export type Analysis = ResultsV15 & { id: string; created_at: string; config?: AnalysisConfig }
const CFG_KEY = 'n1.analysisConfig'
const cfgStore = (): Record<string, AnalysisConfig> => { try { return JSON.parse(localStorage.getItem(CFG_KEY) ?? '{}') } catch { return {} } }
const rememberCfg = (id: string, c: AnalysisConfig) => { try { localStorage.setItem(CFG_KEY, JSON.stringify({ ...cfgStore(), [id]: c })) } catch { /* ignore */ } }
const withCfg = (a: Analysis): Analysis => ({ ...a, config: a.config ?? cfgStore()[a.id] })
/** B2: a finished collection's results */
export type CollectionResults = Omit<Results, 'verdict'> & { verdict: null; collection: CollectionSummary }
export const isCollection = (p: Plan) => (p.type as string) === 'collection'
/** B3 422 reasons, in plain words */
export const ANALYSIS_ERRORS: Record<string, string> = {
  signal_not_in_collection: 'That signal wasn’t part of this collection, so it can’t be tested on this data.',
  not_enough_data: 'There isn’t enough data yet (or too few logged symptoms) to run this test. At least 5 logs are needed.',
  too_few_periods: 'A/B tests need at least 5 A/B blocks (10 periods) inside the collection window.',
  window_too_short: 'The collection window is too short for this look-back range.',
}

/** Read v1.5 fields from any plan object (the live 1.4 API simply won't have them yet). */
export const v15Plan = (p: Plan) => p as unknown as PlanV15

// ---------- mock store (browser only; persisted like mockServer's) ----------
const KEY = 'n1mock.v15'
interface Store { symptoms: Record<string, Symptom[]>; notes: Record<string, Note[]> }
const load = (): Store => {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s?.symptoms && s?.notes) return s } catch { /* ignore */ }
  return { symptoms: {}, notes: {} }
}
let store = load()
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* ignore */ } }
export function resetV15Mock() { store = { symptoms: {}, notes: {} }; save() }

/** Seeds per to-backend #11 B1 (mapped onto today's episode column, so verdicts are unchanged). */
const SEED: Record<string, { name: string; kind: SymptomKind }[]> = {
  'P01-MARIA': [{ name: 'Migraine', kind: 'symptom' }],
  'P02-JAMES': [{ name: 'Headache', kind: 'symptom' }],
  'P03-AISHA': [{ name: 'Insomnia', kind: 'condition' }],
  'P04-ROBERT': [{ name: 'Hypertension', kind: 'condition' }],
  'P05-DANA': [{ name: 'Type 2 diabetes', kind: 'condition' }],
  'P06-LEO': [{ name: 'Hypomania', kind: 'symptom' }],
  'P07-GRACE': [{ name: 'Near-fall', kind: 'event' }],
  'P08-SAM': [{ name: 'Migraine', kind: 'symptom' }],
  'REAL-P07': [{ name: 'Low-readiness day', kind: 'event' }],
}
const now = () => new Date().toISOString().slice(0, 19)
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`
function mockSymptoms(pid: string): Symptom[] {
  if (!store.symptoms[pid]) {
    store.symptoms[pid] = (SEED[pid] ?? []).map((s, i) => ({ id: `${pid}-s${i + 1}`, ...s, created_by: 'clinician', created_at: '2026-06-01T09:00:00' }))
    save()
  }
  return store.symptoms[pid]
}

const enc = encodeURIComponent
const me = () => {
  const s = getSession()
  return { role: (s?.role ?? 'clinician') as 'patient' | 'clinician', name: s?.name ?? 'You' }
}

// ---------- API (live first; mock on 404/405 or in sample-data mode) ----------
export const v15 = {
  // B1 symptoms / conditions / events
  symptoms: (patientId: string) =>
    call<Symptom[]>('GET', `/api/patients/${enc(patientId)}/symptoms`, undefined, async () => structuredClone(mockSymptoms(patientId)), true),
  addSymptom: (patientId: string, body: { name: string; kind: SymptomKind }) =>
    call<Symptom>('POST', `/api/patients/${enc(patientId)}/symptoms`, body, async () => {
      const s: Symptom = { id: uid(patientId), name: body.name.trim(), kind: body.kind, created_by: me().role, created_at: now() }
      store.symptoms[patientId] = [...mockSymptoms(patientId), s]; save()
      return structuredClone(s)
    }, true),
  deleteSymptom: (patientId: string, symptomId: string) =>
    call<{ ok: true }>('DELETE', `/api/patients/${enc(patientId)}/symptoms/${enc(symptomId)}`, undefined, async () => {
      store.symptoms[patientId] = mockSymptoms(patientId).filter((s) => s.id !== symptomId); save()
      return { ok: true as const }
    }, true),
  /** B1 logging: today's /api/episodes plus symptom_id (v1.4 ignores the extra field). */
  logSymptom: (body: { patient_id: string; date: string; symptom_id: string; note?: string }) =>
    call<{ ok: true }>('POST', '/api/episodes', body, async () => {
      const { mock } = await import('./mockServer')
      return mock.logEpisode({ patient_id: body.patient_id, date: body.date, note: body.note })
    }),

  // B6 notes on any plan, both sides
  notes: (planId: string) =>
    call<Note[]>('GET', `/api/plans/${enc(planId)}/notes`, undefined, async () => structuredClone(store.notes[planId] ?? []), true),
  addNote: (planId: string, text: string) =>
    call<Note>('POST', `/api/plans/${enc(planId)}/notes`, { text }, async () => {
      const n: Note = { id: uid('note'), author_role: me().role, author_name: me().name, text: text.trim(), created_at: now() }
      store.notes[planId] = [...(store.notes[planId] ?? []), n]; save()
      return structuredClone(n)
    }, true),

  // B2/B3 collections: run a test on a collection's data
  analyses: (collectionId: string) =>
    call<Analysis[]>('GET', `/api/plans/${enc(collectionId)}/analyses`, undefined, async () => {
      const { mock } = await import('./mockServer')
      return mock.analyses(collectionId) as unknown as Analysis[]
    }, true).then((xs) => xs.map(withCfg)),
  runAnalysis: (collectionId: string, body: { observational?: Plan['observational'] & { symptom_id?: string | null }; intervention?: Plan['intervention'] }) =>
    call<Analysis>('POST', `/api/plans/${enc(collectionId)}/analyses`, body, async () => {
      const { mock } = await import('./mockServer')
      return mock.runAnalysis(collectionId, body) as unknown as Analysis
    }).then((a) => { rememberCfg(a.id, body); return withCfg(a) }),

  // B7 clinician comment + review (mock: no-op until the backend ships; the UI reads results.clinician_comment)
  comment: (planId: string, text: string) =>
    call<ResultsV15>('POST', `/api/plans/${enc(planId)}/results/comment`, { text }, async () => {
      throw Object.assign(new Error('not_available_yet'), { status: 404 })
    }, true),
  markReviewed: (planId: string) =>
    call<ResultsV15>('POST', `/api/plans/${enc(planId)}/results/review`, undefined, async () => {
      throw Object.assign(new Error('not_available_yet'), { status: 404 })
    }, true),
}
