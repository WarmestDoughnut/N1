import { useState } from 'react'
import type { Results } from '../types'
import { v15, type ResultsV15 } from '../lib/v15'
import { formatDate } from '../lib/util'
import { Icon } from './Icon'

/** Clinician's comment on a result + "mark reviewed" (backend B7). The patient sees the comment with their result. */
export function ReviewBox({ planId, results, onChange }: { planId: string; results: Results; onChange?: (r: ResultsV15) => void }) {
  const [r, setR] = useState<ResultsV15>(results as ResultsV15)
  const [text, setText] = useState(r.clinician_comment?.text ?? '')
  const [busy, setBusy] = useState<'' | 'comment' | 'review'>('')
  const [err, setErr] = useState<string | null>(null)
  const run = async (kind: 'comment' | 'review') => {
    setBusy(kind); setErr(null)
    try {
      const next = kind === 'comment' ? await v15.comment(planId, text.trim()) : await v15.markReviewed(planId)
      // review returns only {ok, reviewed_at}; comment returns the whole result. Merge either onto what we have.
      const merged = { ...r, ...next } as ResultsV15
      setR(merged); onChange?.(merged)
    } catch {
      // The mock has no store for these yet, and a v1.4 server answers 404.
      setErr(kind === 'comment' ? "Comments can't be saved on this server yet." : "Review status can't be saved on this server yet.")
    } finally { setBusy('') }
  }
  const saved = r.clinician_comment?.text ?? ''
  return (
    <article className="card review-box">
      <div className="card-title">
        <h3>Your review</h3>
        {r.reviewed_at
          ? <span className="pill pill-green">Reviewed {formatDate(r.reviewed_at)}</span>
          : <span className="pill pill-coral">Unreviewed</span>}
      </div>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="label">Comment for the patient</span>
        <textarea rows={3} aria-label="Comment for the patient" placeholder="What this result means for them, and what to do next…" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {err && <div className="alert alert-warn" style={{ marginBottom: 10 }}><Icon name="info" />{err}</div>}
      <div className="row">
        <button className="button secondary" disabled={!!busy || !text.trim() || text.trim() === saved} onClick={() => run('comment')}>{busy === 'comment' ? 'Saving…' : saved ? 'Update comment' : 'Save comment'}</button>
        {!r.reviewed_at && <button className="button primary" disabled={!!busy} onClick={() => run('review')}><Icon name="check" size={15} /> {busy === 'review' ? 'Saving…' : 'Mark reviewed'}</button>}
        {r.clinician_comment && <span className="muted small">Saved {formatDate(r.clinician_comment.at)}</span>}
      </div>
    </article>
  )
}
