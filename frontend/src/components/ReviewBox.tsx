import { useState } from 'react'
import { call } from '../api'
import type { Results } from '../types'
import { v15, type ResultsV15 } from '../lib/v15'
import { formatDate } from '../lib/util'
import { Icon } from './Icon'

type Reviewed = ResultsV15 & { patient_released?: boolean }
const enc = encodeURIComponent
// v1.7 review gate. The mock has no store for these, so sample mode answers like a server without the feature.
const unavailable = async (): Promise<never> => { throw Object.assign(new Error('not_available_yet'), { status: 404 }) }
/** Review without sharing: the patient keeps seeing "with your clinician". */
const reviewPrivately = (planId: string) => call<Partial<Reviewed>>('POST', `/api/plans/${enc(planId)}/results/review`, { release: false }, unavailable, true)
/** Share the result (verdict + comment) with the patient. */
const releaseToPatient = (planId: string) => call<Partial<Reviewed>>('POST', `/api/plans/${enc(planId)}/results/release`, undefined, unavailable, true)

/** Clinician's comment on a result, "mark reviewed" (B7) and "share with patient" (v1.7).
 *  The patient sees the verdict and the comment only once the result is shared. */
export function ReviewBox({ planId, results, released, onChange }: { planId: string; results: Results; released?: boolean; onChange?: (r: ResultsV15) => void }) {
  const [r, setR] = useState<Reviewed>({ ...(results as Reviewed), patient_released: (results as Reviewed).patient_released ?? released })
  const [text, setText] = useState(r.clinician_comment?.text ?? '')
  const [busy, setBusy] = useState<'' | 'comment' | 'review' | 'release'>('')
  const [err, setErr] = useState<string | null>(null)
  const run = async (kind: 'comment' | 'review' | 'release') => {
    setBusy(kind); setErr(null)
    try {
      const next = kind === 'comment' ? await v15.comment(planId, text.trim()) : kind === 'review' ? await reviewPrivately(planId) : await releaseToPatient(planId)
      // comment returns the whole result; review/release return a few fields. Merge either onto what we have.
      const merged = { ...r, ...next, ...(kind === 'release' ? { patient_released: true, reviewed_at: (next as Partial<Reviewed>).reviewed_at ?? r.reviewed_at ?? new Date().toISOString() } : {}) } as Reviewed
      setR(merged); onChange?.(merged)
    } catch {
      setErr(kind === 'comment' ? "Comments can't be saved on this server yet." : kind === 'review' ? "Review status can't be saved on this server yet." : "Results can't be shared from this server yet.")
    } finally { setBusy('') }
  }
  const saved = r.clinician_comment?.text ?? ''
  const shared = r.patient_released === true
  return (
    <article className="card review-box">
      <div className="card-title">
        <h3>Your review</h3>
        <span className="row" style={{ gap: 6 }}>
          {r.reviewed_at
            ? <span className="pill pill-green">Reviewed {formatDate(r.reviewed_at)}</span>
            : <span className="pill pill-coral">Unreviewed</span>}
          {shared
            ? <span className="pill pill-green">Shared with patient</span>
            : <span className="pill pill-yellow">Not yet shared</span>}
        </span>
      </div>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="label">Comment for the patient</span>
        <textarea rows={3} aria-label="Comment for the patient" placeholder="What this result means for them, and what to do next…" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {!shared && <p className="muted small" style={{ margin: '0 0 10px' }}>The patient sees the result and your comment only after you share it.</p>}
      {err && <div className="alert alert-warn" style={{ marginBottom: 10 }}><Icon name="info" />{err}</div>}
      <div className="row">
        <button className="button secondary" disabled={!!busy || !text.trim() || text.trim() === saved} onClick={() => run('comment')}>{busy === 'comment' ? 'Saving…' : saved ? 'Update comment' : 'Save comment'}</button>
        {!shared && <button className="button primary" disabled={!!busy} onClick={() => run('release')}><Icon name="check" size={15} /> {busy === 'release' ? 'Sharing…' : 'Share results with patient'}</button>}
        {!r.reviewed_at && !shared && <button className="button ghost" disabled={!!busy} onClick={() => run('review')}>{busy === 'review' ? 'Saving…' : 'Mark reviewed, don\'t share yet'}</button>}
        {r.clinician_comment && <span className="muted small">Saved {formatDate(r.clinician_comment.at)}</span>}
      </div>
    </article>
  )
}
