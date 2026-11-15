import { useState } from 'react'
import { friendlyError } from '../api'
import { useAsync } from '../lib/hooks'
import { v15, type Note } from '../lib/v15'
import { formatDate } from '../lib/util'
import { Icon } from './Icon'

/** Notes on one test or collection plan (backend B6). Both the patient and the clinician can read and add. */
export function NotesPanel({ planId, role }: { planId: string; role: 'clinician' | 'patient' }) {
  const notesQ = useAsync<Note[]>(() => v15.notes(planId), [planId])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const notes = notesQ.data ?? []
  const add = async () => {
    if (!text.trim()) return
    setBusy(true); setErr(null)
    try { const n = await v15.addNote(planId, text.trim()); notesQ.setData([...notes, n]); setText('') }
    catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <article className="card notes-panel">
      <div className="card-title"><h3>Notes</h3><span className="muted small">{role === 'clinician' ? 'Visible to the patient' : 'Visible to your clinician'}</span></div>
      {notesQ.loading && !notesQ.data ? <div className="muted small">Loading notes…</div>
        : notes.length === 0 ? <div className="muted small">No notes yet.</div>
          : (
            <ul className="notes-list">
              {notes.map((n) => (
                <li key={n.id} className={n.author_role === role ? 'mine' : ''}>
                  <span className="notes-meta"><b>{n.author_name}</b> · {n.author_role === 'clinician' ? 'Clinician' : 'Patient'} · {formatDate(n.created_at)}</span>
                  <span className="notes-text">{n.text}</span>
                </li>
              ))}
            </ul>
          )}
      {(notesQ.error || err) && <div className="alert alert-error mt"><Icon name="info" />{err ?? notesQ.error}</div>}
      <div className="notes-add">
        <textarea aria-label="Add a note" rows={2} placeholder="Add a note…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="button secondary" disabled={busy || !text.trim()} onClick={add}>{busy ? 'Saving…' : 'Add note'}</button>
      </div>
    </article>
  )
}
