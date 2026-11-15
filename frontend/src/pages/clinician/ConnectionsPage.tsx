import { useState } from 'react'
import { api, friendlyError } from '../../api'
import type { Connection } from '../../types'
import { ConnectCodeCard, RequestRow } from '../../components/Connections'
import { useToast } from '../../components/Shell'
import { Icon } from '../../components/Icon'
import { getSession, initials } from '../../lib/session'
import { formatDate } from '../../lib/util'
import type { ClinicianData } from './ClinicianApp'
import { toneFor } from './Overview'

/** Onboarding: share the connect code, accept/decline requests, manage who is connected.
 *  Connecting only links accounts. Data is shared only when the patient approves a specific test plan. */
export function ConnectionsPage({ data }: { data: ClinicianData }) {
  const active = data.connections.filter((c) => c.status === 'active').sort((a, b) => a.patient_name.localeCompare(b.patient_name))
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Connections</p>
          <h1>Connect with patients</h1>
          <span className="sub">Connecting only links your accounts. You see a patient's data only for the signals and dates they approve in a test plan.</span>
        </div>
      </section>

      <div className="mb"><ConnectCodeCard code={getSession()?.connectCode} /></div>

      <section className="results mb">
        <Step n={1} title="Share your code" text="Give patients your connect code at a visit, on a card or in a message." />
        <Step n={2} title="Patient sends a request" text="They enter the code under Care team in their N1 Hub app." />
        <Step n={3} title="You accept" text="They join your patient list, and you can propose test plans for them to approve." />
      </section>

      <article className="card mb" style={data.requests.length ? { borderColor: '#f0dcae' } : undefined}>
        <div className="card-title">
          <h3>Connection requests</h3>
          {data.requests.length > 0 && <span className="pill pill-yellow">{data.requests.length} new</span>}
        </div>
        {data.requests.length === 0
          ? <div className="muted small" style={{ padding: '4px 0' }}>No pending requests. New requests appear here when a patient enters your code.</div>
          : data.requests.map((c) => <RequestRow key={c.id} conn={c} />)}
      </article>

      <article className="card">
        <div className="card-title">
          <div><h3>Connected patients</h3><p>{active.length} {active.length === 1 ? 'person' : 'people'}</p></div>
          <a className="link-btn" href="#/patients">Patient list <Icon name="chevron" size={14} /></a>
        </div>
        {active.length === 0
          ? <div className="muted small" style={{ padding: '4px 0' }}>No one yet. Share your code to get started.</div>
          : active.map((c) => <ConnectedRow key={c.id} conn={c} />)}
      </article>
    </>
  )
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div>
      <span>Step {n}</span>
      <strong style={{ fontSize: 15 }}>{title}</strong>
      <small style={{ whiteSpace: 'normal' }}>{text}</small>
    </div>
  )
}

function ConnectedRow({ conn }: { conn: Connection }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    if (!window.confirm(`Remove ${conn.patient_name} from your patients? Existing plans and results stay on record.`)) return
    setBusy(true)
    try { await api.removeConnection(conn.id); toast(`${conn.patient_name} removed from your patients`) }
    catch (e) { toast(friendlyError(e)); setBusy(false) }
  }
  return (
    <div className="patient-row" style={{ gridTemplateColumns: '38px minmax(0,1fr) auto', cursor: 'default' }}>
      <span className={`mini-avatar ${toneFor(conn.patient_id)}`}>{initials(conn.patient_name)}</span>
      <span>
        <strong>{conn.patient_name}</strong>
        <small>{conn.patient_id} · Connected since {formatDate(conn.created_at)}</small>
      </span>
      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <a className="button secondary sm" href={`#/patients/${conn.patient_id}`}>View</a>
        <button className="button ghost sm" disabled={busy} onClick={remove}><Icon name="x" size={14} /> Remove</button>
      </span>
    </div>
  )
}
