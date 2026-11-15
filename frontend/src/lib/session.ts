import { useEffect, useState } from 'react'
import type { Role } from '../types'

/** Demo sign-in (no real auth in this build — CLAUDE.md §4). Persisted in localStorage. */
export interface Session {
  role: Role
  /** clinician display name, or patient display name */
  name: string
  /** patient id when role === 'patient' */
  patientId?: string
}

const KEY = 'n1.session'
const listeners = new Set<() => void>()

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
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
  const clean = name.replace(/^dr\.?\s+/i, '').replace(/\(.*\)/, '').trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function firstName(name: string): string {
  return name.replace(/\s*\(.*\)$/, '')
}
