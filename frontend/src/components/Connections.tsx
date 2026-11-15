import { useState } from 'react'
import { api, friendlyError } from '../api'
import type { Connection } from '../types'
import { initials } from '../lib/session'
import { formatDate } from '../lib/util'
import { Icon } from './Icon'
import { useToast } from './Shell'

/** Clinician view of a patient's request to connect: Accept / Decline. */
export function RequestRow({ conn }: { conn: Connection }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErr(null)
    try { await fn(); toast(msg) } catch (e) { setErr(friendlyError(e)); setBusy(false) }
  }
  return (
    <div className="patient-row" style={{ gridTemplateColumns: '38px minmax(0,1fr) auto', cursor: 'default' }}>
      <span className="mini-avatar tone-yellow">{initials(conn.patient_name)}</span>
      <span>
        <strong>{conn.patient_name}</strong>
        <small>Wants to add you to their care team · {formatDate(conn.created_at)}</small>
        {err && <small style={{ color: 'var(--coral)' }}>{err}</small>}
      </span>
      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <button className="button success sm" disabled={busy} onClick={() => run(() => api.acceptConnection(conn.id), `${conn.patient_name} is now one of your patients`)}>
          <Icon name="check" size={14} /> Accept
        </button>
        <button className="button ghost sm" disabled={busy} onClick={() => run(() => api.removeConnection(conn.id), 'Request declined')}>Decline</button>
      </span>
    </div>
  )
}

/** The clinician's code patients type in to add them. */
export function ConnectCodeCard({ code, compact = false }: { code?: string | null; compact?: boolean }) {
  const toast = useToast()
  if (!code) return null
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast('Code copied') } catch { toast(`Your code is ${code}`) }
  }
  return (
    <div className="insight" style={{ alignItems: 'center' }}>
      <span><Icon name="people" size={18} /></span>
      <p style={{ flex: 1 }}>
        <strong>Your connect code</strong>
        {compact ? 'Patients enter it to add you.' : 'Give this code to patients. They enter it in N1 Hub to add you to their care team, then you accept.'}
      </p>
      <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: 'var(--accent-ink)', background: '#fff', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--accent-line)' }}>{code}</code>
        <button className="button secondary sm" onClick={copy}>Copy</button>
      </span>
    </div>
  )
}
