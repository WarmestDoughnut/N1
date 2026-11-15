import { useState, type FormEvent } from 'react'
import { api, friendlyError } from '../../api'
import type { Connection } from '../../types'
import { initials } from '../../lib/session'
import { formatDate } from '../../lib/util'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Shell'

export function CareTeam({ connections, loading }: { connections: Connection[]; loading: boolean }) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const active = connections.filter((c) => c.status === 'active')
  const pending = connections.filter((c) => c.status === 'pending')

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) { setErr("Enter your clinician's code."); return }
    setBusy(true); setErr(null)
    try {
      const c = await api.requestConnection(code)
      setCode('')
      toast(`Request sent to ${c.clinician_name}`)
    } catch (ex) { setErr(friendlyError(ex)) } finally { setBusy(false) }
  }

  const remove = async (c: Connection) => {
    const msg = c.status === 'pending'
      ? `Cancel your request to ${c.clinician_name}?`
      : `Remove ${c.clinician_name} from your care team? They won't be able to send you new test plans. Plans you already approved keep running until you pause or stop them.`
    if (!window.confirm(msg)) return
    try { await api.removeConnection(c.id); toast(c.status === 'pending' ? 'Request cancelled' : `${c.clinician_name} removed`) }
    catch (ex) { toast(friendlyError(ex)) }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Care team</p>
          <h1>My clinicians</h1>
        </div>
      </section>

      <section className="bottom-grid">
        <article className="card">
          <div className="card-title"><div><h3 style={{ fontSize: 18 }}>Connected</h3></div></div>
          {loading && !connections.length && <div className="spinner">Loading…</div>}
          {!loading && active.length === 0 && <div className="muted" style={{ padding: '8px 0' }}>No clinicians yet. Add one with their code.</div>}
          {active.map((c) => (
            <div key={c.id} className="patient-row" style={{ gridTemplateColumns: '44px minmax(0,1fr) auto', cursor: 'default' }}>
              <span className="mini-avatar tone-purple" style={{ width: 44, height: 44, fontSize: 14 }}>{initials(c.clinician_name)}</span>
              <span>
                <strong style={{ fontSize: 16.5 }}>{c.clinician_name}</strong>
                <small style={{ fontSize: 14 }}>{c.clinician_specialty ?? 'Clinician'} · connected {formatDate(c.created_at)}</small>
              </span>
              <button className="button ghost sm" onClick={() => remove(c)}><Icon name="x" size={14} /> Remove</button>
            </div>
          ))}
          {pending.length > 0 && (
            <>
              <div className="chart-title mt">Waiting for approval</div>
              {pending.map((c) => (
                <div key={c.id} className="patient-row" style={{ gridTemplateColumns: '44px minmax(0,1fr) auto', cursor: 'default' }}>
                  <span className="mini-avatar tone-yellow" style={{ width: 44, height: 44, fontSize: 14 }}>{initials(c.clinician_name)}</span>
                  <span>
                    <strong style={{ fontSize: 16.5 }}>{c.clinician_name}</strong>
                    <small style={{ fontSize: 14 }}>Request sent {formatDate(c.created_at)}. They need to accept.</small>
                  </span>
                  <button className="button ghost sm" onClick={() => remove(c)}>Cancel</button>
                </div>
              ))}
            </>
          )}
        </article>

        <aside className="card">
          <div className="card-title"><div><h3 style={{ fontSize: 18 }}>Add a clinician</h3></div></div>
          <form onSubmit={add}>
            <div className="field">
              <label htmlFor="code">Clinician code</label>
              <input id="code" placeholder="e.g. RIV-482" value={code} autoCapitalize="characters"
                style={{ fontSize: 18, letterSpacing: 1 }}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(null) }} />
            </div>
            {err && <div className="alert alert-error mb" role="alert"><Icon name="info" />{err}</div>}
            <button className="button primary lg" style={{ width: '100%' }} disabled={busy}><Icon name="plus" /> {busy ? 'Sending…' : 'Send request'}</button>
          </form>
        </aside>
      </section>
    </>
  )
}
