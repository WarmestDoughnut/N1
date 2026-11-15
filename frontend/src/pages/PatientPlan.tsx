import { useEffect, useState } from 'react'
import { api, ApiError, friendlyError } from '../api'
import type { Device, Patient, Plan, PlanAction, Results } from '../types'
import { navigate, useAsync } from '../lib/hooks'
import { StatusChip } from '../components/Verdict'
import { ResultsView } from '../components/ResultsView'
import { PlanSchedule } from '../components/PlanSummary'
import { daysBetween, formatDate, SIGNAL_INFO } from '../lib/util'

interface Props { planId: string; patient?: Patient; onSwitchPatient: (id: string) => void }

export function PatientPlan({ planId, patient, onSwitchPatient }: Props) {
  const planQ = useAsync<Plan>(() => api.getPlan(planId), [planId])
  const devicesQ = useAsync<Device[]>(() => api.devices(), [])
  const plan = planQ.data
  const finished = plan && (plan.status === 'complete' || plan.status === 'stopped')
  const resultsQ = useAsync<Results | null>(
    () => (finished ? api.results(planId).catch((e) => { if (e instanceof ApiError && e.status === 404) return null; throw e }) : Promise.resolve(null)),
    [planId, plan?.status],
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'decline' | 'stop' | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Demo: if this plan belongs to another patient (e.g. after a role switch), sign in as them.
  useEffect(() => {
    if (plan && patient && plan.patient_id !== patient.id) onSwitchPatient(plan.patient_id)
  }, [plan, patient, onSwitchPatient])

  const act = async (fn: () => Promise<Plan>, msg?: string) => {
    setBusy(true); setErr(null); setConfirm(null)
    try {
      planQ.setData(await fn())
      if (msg) { setToast(msg); setTimeout(() => setToast(null), 3500) }
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }
  const doAction = (a: PlanAction, msg: string) => act(() => api.planAction(planId, a), msg)

  if (planQ.error) return <div className="patient-page"><a href="#/">← My tests</a><div className="alert alert-error mt">{planQ.error}</div></div>
  if (!plan) return <div className="spinner">Loading…</div>

  const deviceFor = (sig: string) =>
    sig === 'episode' ? 'the N1 Hub app (you log these)'
      : (devicesQ.data ?? []).filter((d) => plan.devices.includes(d.id) && d.signals.includes(sig as never)).map((d) => `your ${d.name}`).join(' or ') || 'your device'

  const approvedAt = plan.history.find((h) => h.event.startsWith('approved'))?.at
  const totalDays = daysBetween(plan.window.start, plan.window.end) + 1
  const elapsed = approvedAt ? Math.min(totalDays, Math.max(1, daysBetween(approvedAt.slice(0, 10), new Date().toISOString().slice(0, 10)) + 1)) : 0

  return (
    <div className="patient-page stack">
      <div className="row-between">
        <a href="#/">← My tests</a>
        <StatusChip status={plan.status} />
      </div>
      {toast && <div className="alert alert-info" role="status">{toast}</div>}
      {err && <div className="alert alert-error" role="alert">{err}</div>}

      {plan.status === 'pending_approval' && (
        <div className="card">
          <div className="eyebrow">{plan.clinician_name} is asking</div>
          <h1>{plan.title}</h1>
          <div className="summary-box">{plan.patient_summary}</div>
          <h2>Exactly what will be shared</h2>
          <ul className="shared-list">
            {plan.signals.map((s) => (
              <li key={s}><span className="ok">✓</span><span><strong>{SIGNAL_INFO[s]?.label ?? s}</strong>, from {deviceFor(s)}</span></li>
            ))}
            <li><span className="ok">📅</span><span>Only from <strong>{formatDate(plan.window.start)}</strong> to <strong>{formatDate(plan.window.end)}</strong></span></li>
            <li><span className="ok">✕</span><span>Nothing else: no location, messages, or other health data</span></li>
          </ul>
          {plan.intervention && (
            <div className="mt">
              <h2>Your schedule</h2>
              <p>You'll switch between <strong>A: {plan.intervention.arm_a}</strong> and <strong>B: {plan.intervention.arm_b}</strong> in a random order, with short breaks in between.</p>
              <PlanSchedule plan={plan} />
            </div>
          )}
          <p className="mt">You can pause or stop at any time. If you stop, the data already collected for this test is kept, and the results are marked incomplete.</p>
          <div className="big-actions">
            <button className="btn btn-large btn-success" disabled={busy} onClick={() => doAction('approve', 'Approved. Thank you! You can pause or stop any time.')}>✓ Approve</button>
            <button className="btn btn-large btn-danger" disabled={busy} onClick={() => setConfirm('decline')}>Decline</button>
          </div>
        </div>
      )}

      {plan.status === 'declined' && (
        <div className="card">
          <h1>{plan.title}</h1>
          <p style={{ fontSize: '1.2rem' }}>You declined this test. Nothing was shared.</p>
        </div>
      )}

      {(plan.status === 'active' || plan.status === 'paused') && (
        <div className="card">
          <div className="eyebrow">Test in progress</div>
          <h1>{plan.title}</h1>
          {plan.status === 'paused' && <div className="alert alert-warn">Paused. Nothing new is being collected until you resume.</div>}
          <p style={{ fontSize: '1.15rem' }}>Day {elapsed} of {totalDays} · {formatDate(plan.window.start)} to {formatDate(plan.window.end)}</p>
          <div className="progress" aria-label="progress"><div style={{ width: `${(elapsed / totalDays) * 100}%` }} /></div>
          <p className="muted mt">Sharing: {plan.signals.map((s) => SIGNAL_INFO[s]?.plain ?? s).join(', ')}. Nothing else.</p>
          {plan.intervention && <PlanSchedule plan={plan} />}
          <div className="big-actions">
            <button className="btn btn-large" onClick={() => setLogOpen(true)}>+ Log an episode</button>
            {plan.status === 'active'
              ? <button className="btn btn-large btn-secondary" disabled={busy} onClick={() => doAction('pause', 'Paused.')}>⏸ Pause</button>
              : <button className="btn btn-large btn-secondary" disabled={busy} onClick={() => doAction('resume', 'Resumed.')}>▶ Resume</button>}
            <button className="btn btn-large btn-danger" disabled={busy} onClick={() => setConfirm('stop')}>■ Stop test</button>
          </div>
          <hr style={{ margin: '1.5rem 0', border: 0, borderTop: '1px dashed #d1d5db' }} />
          <div className="row-between">
            <span className="muted small">Demo mode: the data is historical, so the whole test can run instantly.</span>
            <button className="btn btn-demo" disabled={busy} onClick={() => act(() => api.simulateComplete(planId), 'Test complete. Here are your results.')}>⏩ Simulate complete (demo)</button>
          </div>
        </div>
      )}

      {finished && (
        resultsQ.loading && !resultsQ.data ? <div className="spinner">Loading results…</div>
          : resultsQ.error ? <div className="alert alert-error">{resultsQ.error}</div>
            : resultsQ.data ? <ResultsView results={resultsQ.data} plan={plan} audience="patient" />
              : <div className="card"><h1>{plan.title}</h1><p>Your results aren't ready yet. Check back soon.</p></div>
      )}

      {confirm && (
        <div className="modal-back" onClick={() => setConfirm(null)}>
          <div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            {confirm === 'decline' ? (
              <>
                <h2>Decline this test?</h2>
                <p>Nothing will be shared. Your clinician will see that you declined.</p>
                <div className="big-actions">
                  <button className="btn btn-danger" onClick={() => doAction('decline', 'Declined. Nothing was shared.')}>Yes, decline</button>
                  <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Go back</button>
                </div>
              </>
            ) : (
              <>
                <h2>Stop this test?</h2>
                <p>No new data will be collected. The data already collected for this test is kept, and your results will be marked <strong>incomplete</strong>.</p>
                <div className="big-actions">
                  <button className="btn btn-danger" onClick={() => doAction('stop', 'Stopped. Your results so far are below.')}>Yes, stop</button>
                  <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep going</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {logOpen && <LogEpisodeModal patientId={plan.patient_id} defaultDate={plan.window.end} onClose={(msg) => { setLogOpen(false); if (msg) { setToast(msg); setTimeout(() => setToast(null), 3500) } }} />}

      <div className="row"><button className="btn btn-ghost btn-small" onClick={() => navigate('/')}>Back to my tests</button></div>
    </div>
  )
}

function LogEpisodeModal({ patientId, defaultDate, onClose }: { patientId: string; defaultDate: string; onClose: (msg?: string) => void }) {
  const [date, setDate] = useState(defaultDate)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    setBusy(true); setErr(null)
    try { await api.logEpisode({ patient_id: patientId, date, note: note.trim() || undefined }); onClose(`Episode logged for ${formatDate(date)}.`) }
    catch (e) { setErr(friendlyError(e)); setBusy(false) }
  }
  return (
    <div className="modal-back" onClick={() => onClose()}>
      <div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <h2>Log an episode</h2>
        <div className="field"><label htmlFor="ep-d">When did it happen?</label><input id="ep-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="ep-n">Note (optional)</label><input id="ep-n" placeholder="e.g. headache" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="big-actions">
          <button className="btn btn-large" disabled={busy || !date} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-ghost" onClick={() => onClose()}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
