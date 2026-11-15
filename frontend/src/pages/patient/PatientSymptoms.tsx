import { useState } from 'react'
import { friendlyError } from '../../api'
import { useAsync } from '../../lib/hooks'
import { v15, type Symptom, type SymptomKind } from '../../lib/v15'
import { formatDate } from '../../lib/util'
import { Icon } from '../../components/Icon'

const KIND_LABEL: Record<SymptomKind, string> = { symptom: 'Symptom', condition: 'Condition', event: 'Event' }

/** #/symptoms: the patient's own list of symptoms, conditions and events (backend B1). Tests and the Log button read from it. */
export function PatientSymptoms({ patientId }: { patientId: string }) {
  const q = useAsync<Symptom[]>(() => v15.symptoms(patientId), [patientId])
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SymptomKind>('symptom')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const items = q.data ?? []
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
          <p className="eyebrow">My symptoms</p>
          <h1>Symptoms, conditions and events</h1>
        </div>
      </section>

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
                <div key={s.id} className="patient-row" style={{ gridTemplateColumns: '38px minmax(0,1fr) auto auto', cursor: 'default' }}>
                  <span className="mini-avatar tone-purple"><Icon name="heart" size={16} /></span>
                  <span>
                    <strong>{s.name}</strong>
                    <small>Added by {s.created_by === 'patient' ? 'you' : 'your clinician'} · {formatDate(s.created_at)}</small>
                  </span>
                  <span className="chip">{KIND_LABEL[s.kind] ?? s.kind}</span>
                  {s.created_by === 'patient'
                    ? <button className="icon-btn" aria-label={`Remove ${s.name}`} title="Remove" onClick={() => remove(s)}><Icon name="x" size={16} /></button>
                    : <span />}
                </div>
              ))}
      </article>
    </>
  )
}
