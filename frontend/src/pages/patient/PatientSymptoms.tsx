import { useState } from 'react'
import type { Plan } from '../../types'
import { formatLogTime, readSymptomLogs, recordSymptomLog, type SymptomLogEntry } from '../../lib/symptomLog'
import { friendlyError } from '../../api'
import { useAsync } from '../../lib/hooks'
import { v15, v15Plan, type Symptom, type SymptomKind } from '../../lib/v15'
import { formatDate } from '../../lib/util'
import { Icon } from '../../components/Icon'

const KIND_LABEL: Record<SymptomKind, string> = { symptom: 'Symptom', condition: 'Condition', event: 'Event' }

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** #/symptoms: the patient's own list of symptoms, conditions and events (backend B1), and where they log one.
 *  A log is sent with the symptom's id, the same id a test stores as its outcome, so running tests count it. */
export function PatientSymptoms({ patientId, plans }: { patientId: string; plans: Plan[] }) {
  const q = useAsync<Symptom[]>(() => v15.symptoms(patientId), [patientId])
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SymptomKind>('symptom')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const items = q.data ?? []
  const [logs, setLogs] = useState<SymptomLogEntry[]>(() => readSymptomLogs(patientId))
  const [logging, setLogging] = useState<Symptom | null>(null)
  const [logDate, setLogDate] = useState(today())
  const [note, setNote] = useState('')
  const [lastLogged, setLastLogged] = useState<{ name: string; tests: string[] } | null>(null)

  /** Running tests whose outcome is this symptom. A test with no symptom of its own uses the patient's first one. */
  const testsFor = (s: Symptom) => plans.filter((p) => {
    if ((p.status !== 'active' && p.status !== 'paused') || !p.observational) return false
    const sid = v15Plan(p).observational?.symptom_id
    return sid ? sid === s.id : items[0]?.id === s.id
  })
  const submitLog = async () => {
    if (!logging) return
    setBusy(true); setErr(null)
    try {
      await v15.logSymptom({ patient_id: patientId, date: logDate, symptom_id: logging.id, note: note.trim() || undefined })
      setLogs(recordSymptomLog(patientId, { symptom_id: logging.id, symptom_name: logging.name, date: logDate, logged_at: new Date().toISOString(), note: note.trim() || undefined }))
      setLastLogged({ name: logging.name, tests: testsFor(logging).map((p) => p.title) })
      setLogging(null); setNote(''); setLogDate(today())
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }
  const add = async () => {
    if (!name.trim()) return
    setBusy(true); setErr(null)
    try { const s = await v15.addSymptom(patientId, { name: name.trim(), kind }); q.setData([...items, s]); setName('') }
    catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }
  const remove = async (s: Symptom) => {
    setErr(null)
    try { await v15.deleteSymptom(patientId, s.id); q.setData(items.filter((x) => x.id !== s.id)) }
    catch (e) { setErr(friendlyError(e)) }
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Symptoms and conditions</p>
          <h1>Symptoms and conditions</h1>
        </div>
      </section>

      {lastLogged && (
        <div className="alert alert-info mb"><Icon name="check" /><span className="grow">
          <strong>Logged: {lastLogged.name}.</strong>{' '}
          {lastLogged.tests.length ? <>Also counted in: {lastLogged.tests.join(', ')}.</> : <>No running test is tracking this right now.</>}
        </span></div>
      )}

      <article className="card mb">
        <div className="card-title"><h3 style={{ fontSize: 18 }}>Add</h3></div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <input aria-label="Name" placeholder="For example: Migraine" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }} style={{ flex: '1 1 220px' }} />
          <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as SymptomKind)}>
            <option value="symptom">Symptom</option>
            <option value="condition">Condition</option>
            <option value="event">Event</option>
          </select>
          <button className="button primary" disabled={busy || !name.trim()} onClick={add}><Icon name="plus" /> {busy ? 'Adding…' : 'Add'}</button>
        </div>
        {err && <div className="alert alert-error mt"><Icon name="info" />{err}</div>}
      </article>

      <article className="card">
        <div className="card-title"><h3 style={{ fontSize: 18 }}>My list</h3><span className="muted small">{items.length}</span></div>
        {q.loading && !q.data ? <div className="spinner">Loading…</div>
          : q.error ? <div className="alert alert-error">{q.error}</div>
            : items.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing here yet.</p>
              : items.map((s) => (
                <div key={s.id} className="patient-row" style={{ gridTemplateColumns: '38px minmax(0,1fr) auto auto auto', cursor: 'default' }}>
                  <span className="mini-avatar tone-purple"><Icon name="heart" size={16} /></span>
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      {s.created_by === 'patient' ? 'Added by you' : 'Added by your clinician'} · {formatDate(s.created_at)}
                      {logs.find((l) => l.symptom_id === s.id) && <> · Last logged by you {formatLogTime(logs.find((l) => l.symptom_id === s.id)!.logged_at)}</>}
                    </small>
                  </span>
                  <span className="chip">{KIND_LABEL[s.kind] ?? s.kind}</span>
                  <button className="button secondary sm" onClick={() => { setLogging(s); setLastLogged(null) }}><Icon name="pencil" size={14} /> Log</button>
                  {s.created_by === 'patient'
                    ? <button className="icon-btn" aria-label={`Remove ${s.name}`} title="Remove" onClick={() => remove(s)}><Icon name="x" size={16} /></button>
                    : <span />}
                </div>
              ))}
      </article>

      {logs.length > 0 && (
        <article className="card mt">
          <div className="card-title"><h3 style={{ fontSize: 18 }}>What you logged</h3><span className="muted small">on this device</span></div>
          {logs.slice(0, 8).map((l, i) => (
            <div key={i} className="patient-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', cursor: 'default' }}>
              <span><strong>{l.symptom_name}</strong><small>Logged by you · {formatLogTime(l.logged_at)}{l.note ? ` · ${l.note}` : ''}</small></span>
              <span className="muted small">for {formatDate(l.date)}</span>
            </div>
          ))}
        </article>
      )}

      {logging && (
        <div className="modal-back" onClick={() => setLogging(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Log: {logging.name}</h2>
            <label className="field"><span className="label">When did it happen?</span>
              <input type="date" aria-label="Date" value={logDate} max={today()} onChange={(e) => setLogDate(e.target.value)} /></label>
            <label className="field"><span className="label">Note (optional)</span>
              <textarea aria-label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            {testsFor(logging).length > 0 && <p className="muted small">Also counted in: {testsFor(logging).map((p) => p.title).join(', ')}.</p>}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="button ghost" onClick={() => setLogging(null)}>Cancel</button>
              <button className="button primary" disabled={busy || !logDate} onClick={submitLog}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
