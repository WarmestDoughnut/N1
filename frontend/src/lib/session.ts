import { useEffect, useState } from 'react'
import type { Account, Role } from '../types'

/** Demo sign-in (no real auth in this build — CLAUDE.md §4). Persisted in localStorage. */
export interface Session {
  role: Role
  /** clinician display name, or patient display name */
  name: string
  /** patient id when role === 'patient' */
  patientId?: string
  accountId: string
  email: string
  token: string
  specialty?: string | null
  connectCode?: string | null
}

export function sessionFrom(account: Account, token: string): Session {
  return {
    role: account.role, name: account.name, patientId: account.patient_id ?? undefined, accountId: account.id,
    email: account.email, token, specialty: account.specialty, connectCode: account.connect_code,
  }
}

const KEY = 'n1.session'
const listeners = new Set<() => void>()

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    const s = raw ? (JSON.parse(raw) as Session) : null
    return s && s.token ? s : null // sessions from the pre-login build had no token
  } catch {
    return null
  }
}

export function signIn(s: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
  window.location.hash = '/'
  listeners.forEach((l) => l())
}

export function signOut() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  window.location.hash = '/'
  listeners.forEach((l) => l())
}

export function useSession(): Session | null {
  const [s, setS] = useState(getSession)
  useEffect(() => {
    const on = () => setS(getSession())
    listeners.add(on)
    return () => { listeners.delete(on) }
  }, [])
  return s
}

export function initials(name: string): string {
  const clean = name.replace(/^dr\.?\s+/i, '').replace(/\(.*\)/, '').replace(/,.*$/, '').trim() // "Maria, 68" → "Maria"
  const parts = clean.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function firstName(name: string): string {
  return name.replace(/\s*\(.*\)$/, '').replace(/,.*$/, '')
}
