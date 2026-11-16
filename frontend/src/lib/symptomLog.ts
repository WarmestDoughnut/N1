// What the patient logged from this browser, newest first. The backend stores every log (POST /api/episodes)
// but has no endpoint to read them back yet, so the patient's own "you logged…" lines come from here.
// Used by the Symptoms and conditions page and the patient test page. Only the patient's device sees it.
// TODO(backend): GET /api/patients/{id}/episodes, then read from the server instead.

export interface SymptomLogEntry {
  /** the symptom's id, the same value plans carry in `observational.symptom_id` */
  symptom_id: string
  symptom_name: string
  /** the day the event happened (YYYY-MM-DD), as sent to the backend */
  date: string
  /** when the patient recorded it (ISO date-time) */
  logged_at: string
  note?: string
}

const KEY = (patientId: string) => `n1.symptomlog.${patientId}`
const MAX = 200

export function readSymptomLogs(patientId: string): SymptomLogEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY(patientId)) ?? '[]') as SymptomLogEntry[] } catch { return [] }
}

/** Call after a successful POST /api/episodes. Returns the updated list. */
export function recordSymptomLog(patientId: string, entry: SymptomLogEntry): SymptomLogEntry[] {
  const next = [entry, ...readSymptomLogs(patientId)].slice(0, MAX)
  try { localStorage.setItem(KEY(patientId), JSON.stringify(next)) } catch { /* private mode: kept for this page only */ }
  return next
}

/** "Nov 15, 2:10 pm" */
export function formatLogTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(' AM', ' am').replace(' PM', ' pm')
}
