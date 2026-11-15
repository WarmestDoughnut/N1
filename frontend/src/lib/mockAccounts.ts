/**
 * In-browser mock of the proposed v1.2 account + connection endpoints (to-backend #3).
 * Demo build: every seeded account's password is "demo". Tokens are just account ids.
 */
import type { Account, Connection, DemoAccount, LoginResponse, Patient } from '../types'
import { nowIso } from './util'
import { MockHttpError, PATIENTS } from './mockServer'

export const DEMO_PASSWORD = 'demo'

const CLINICIANS: Account[] = [
  { id: 'acct-rivera', role: 'clinician', name: 'Dr. Rivera', email: 'rivera@n1hub.demo', specialty: 'Internal medicine', connect_code: 'RIV-482' },
  { id: 'acct-okafor', role: 'clinician', name: 'Dr. Okafor', email: 'okafor@n1hub.demo', specialty: 'Neurology', connect_code: 'OKA-317' },
]

function emailFor(p: Patient, taken: Set<string>): string {
  const first = p.display_name.split(/[\s,]/)[0].toLowerCase().replace(/[^a-z]/g, '')
  let local = p.source === 'real' || !first || first === 'pmdata' ? p.id.toLowerCase() : first
  if (taken.has(local)) local = p.id.toLowerCase()
  taken.add(local)
  return `${local}@n1hub.demo`
}

const taken = new Set<string>()
const PATIENT_ACCOUNTS: Account[] = PATIENTS.map((p) => ({
  id: `acct-${p.id.toLowerCase()}`, role: 'patient', name: p.display_name, email: emailFor(p, taken), patient_id: p.id,
}))
const ACCOUNTS: Account[] = [...CLINICIANS, ...PATIENT_ACCOUNTS]

// ---------- seeded connections ----------
// Dr. Rivera runs the demo script (Maria, James, Aisha, Robert, Grace, real participant).
// Leo has asked to connect with Dr. Rivera (shows the accept flow); Dana sees Dr. Okafor only
// (shows "add a physician" with code RIV-482).
const SEED: { clinician: string; patient: string; status: Connection['status'] }[] = [
  ...['P01-MARIA', 'P02-JAMES', 'P03-AISHA', 'P04-ROBERT', 'P07-GRACE', 'REAL-P07'].map((p) => ({ clinician: 'acct-rivera', patient: p, status: 'active' as const })),
  { clinician: 'acct-okafor', patient: 'P01-MARIA', status: 'active' },
  { clinician: 'acct-okafor', patient: 'P05-DANA', status: 'active' },
  { clinician: 'acct-okafor', patient: 'P06-LEO', status: 'active' },
  { clinician: 'acct-rivera', patient: 'P06-LEO', status: 'pending' },
]

const KEY = 'n1mock.connections'
function seed(): Connection[] {
  // Fall back to the first patients when the fixture IDs aren't loaded (built-in SYN-* data).
  const ids = new Set(PATIENTS.map((p) => p.id))
  const fallback = PATIENTS.map((p) => p.id)
  return SEED.map((s, i) => {
    const pid = ids.has(s.patient) ? s.patient : fallback[i % Math.max(1, fallback.length)]
    const c = CLINICIANS.find((x) => x.id === s.clinician)!
    const p = PATIENTS.find((x) => x.id === pid)
    return p ? mk(c, p, s.status, 'patient') : null
  }).filter((x, i, arr): x is Connection => !!x && arr.findIndex((y) => y && y.clinician_id === x.clinician_id && y.patient_id === x.patient_id) === i)
}
function mk(c: Account, p: Patient, status: Connection['status'], by: Connection['requested_by']): Connection {
  return {
    id: `CONN-${c.id.slice(5)}-${p.id}`, clinician_id: c.id, clinician_name: c.name, clinician_specialty: c.specialty ?? null,
    patient_id: p.id, patient_name: p.display_name, status, requested_by: by, created_at: nowIso(),
  }
}
function load(): Connection[] {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) } catch { /* ignore */ }
  return seed()
}
let connections: Connection[] = load()
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(connections)) } catch { /* ignore */ } }

export function resetConnections() { connections = seed(); persist() }

function accountFor(token: string | null): Account {
  const a = ACCOUNTS.find((x) => x.id === token)
  if (!a) throw new MockHttpError(401, { error: 'not_signed_in' })
  return a
}
const mine = (a: Account) => connections.filter((c) => (a.role === 'clinician' ? c.clinician_id === a.id : c.patient_id === a.patient_id))

export function isConnected(token: string | null, patientId: string): boolean {
  const a = ACCOUNTS.find((x) => x.id === token)
  if (!a) return true // unauthenticated calls keep v1.1 behavior
  if (a.role === 'patient') return a.patient_id === patientId
  return connections.some((c) => c.clinician_id === a.id && c.patient_id === patientId && c.status === 'active')
}

export const mockAccounts = {
  demoAccounts: async (): Promise<DemoAccount[]> => [
    ...CLINICIANS.map((c) => ({ email: c.email, name: c.name, role: c.role, detail: `${c.specialty} · code ${c.connect_code}` })),
    ...PATIENT_ACCOUNTS.map((a) => {
      const p = PATIENTS.find((x) => x.id === a.patient_id)
      return { email: a.email, name: a.name, role: a.role, detail: [p?.condition, a.patient_id].filter(Boolean).join(' · ') }
    }),
  ],
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const a = ACCOUNTS.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    if (!a || password !== DEMO_PASSWORD) throw new MockHttpError(401, { error: 'invalid_credentials' })
    return { account: { ...a }, token: a.id }
  },
  me: async (token: string | null) => ({ ...accountFor(token) }),
  connections: async (token: string | null): Promise<Connection[]> => structuredClone(mine(accountFor(token))),
  /** patient adds a clinician by code → pending until the clinician accepts */
  requestConnection: async (token: string | null, code: string): Promise<Connection> => {
    const a = accountFor(token)
    if (a.role !== 'patient') throw new MockHttpError(403, { error: 'patients_only' })
    const c = CLINICIANS.find((x) => x.connect_code?.toUpperCase() === code.trim().toUpperCase())
    if (!c) throw new MockHttpError(404, { error: 'unknown_code' })
    if (connections.some((x) => x.clinician_id === c.id && x.patient_id === a.patient_id)) throw new MockHttpError(409, { error: 'already_connected' })
    const p = PATIENTS.find((x) => x.id === a.patient_id)!
    const conn = mk(c, p, 'pending', 'patient')
    connections.push(conn)
    persist()
    return structuredClone(conn)
  },
  accept: async (token: string | null, id: string): Promise<Connection> => {
    const a = accountFor(token)
    const c = connections.find((x) => x.id === id)
    if (!c || (a.role === 'clinician' ? c.clinician_id !== a.id : c.patient_id !== a.patient_id)) throw new MockHttpError(404, { error: 'not_found' })
    if (a.role !== 'clinician' || c.status !== 'pending') throw new MockHttpError(409, { error: 'invalid_transition' })
    c.status = 'active'
    persist()
    return structuredClone(c)
  },
  /** decline a pending request, or either side removes an active connection */
  remove: async (token: string | null, id: string): Promise<{ ok: true }> => {
    const a = accountFor(token)
    const c = connections.find((x) => x.id === id)
    if (!c || (a.role === 'clinician' ? c.clinician_id !== a.id : c.patient_id !== a.patient_id)) throw new MockHttpError(404, { error: 'not_found' })
    connections = connections.filter((x) => x.id !== id)
    persist()
    return { ok: true }
  },
}
