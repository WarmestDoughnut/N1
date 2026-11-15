import { useState } from 'react'
import { api, ApiError, friendlyError } from '../../api'
import type { Device, Plan, PlanAction, Results } from '../../types'
import { useAsync } from '../../lib/hooks'
import { DEVICE_ICON, Icon, SIGNAL_ICON } from '../../components/Icon'
import { StatusChip } from '../../components/Verdict'
import { ResultsView } from '../../components/ResultsView'
import { PlanSchedule } from '../../components/PlanSummary'
import { useToast } from '../../components/Shell'
import { daysBetween, formatDate, SIGNAL_INFO } from '../../lib/util'
import type { PatientData } from './PatientApp'

export function PatientPlan({ planId, data }: { planId: string; data: PatientData }) {
  const toast = useToast()
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

  const act = async (fn: () => Promise<Plan>, msg: string) => {
    setBusy(true); setErr(null); setConfirm(null)
    try { planQ.setData(await fn()); toast(msg) } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }
  const doAction = (a: PlanAction, msg: string) => act(() => api.planAction(planId, a), msg)

  if (planQ.error) return <div className="stack"><a href="#/tests">← My tests</a><div className="alert alert-error">{planQ.error}</div></div>
  if (!plan) return <div className="spinner">Loading…</div>
  if (data.patient && plan.patient_id !== data.patient.id) {
    return <div className="stack"><a href="#/tests">← My tests</a><div className="alert alert-error"><Icon name="shield" />This test belongs to a different account.</div></div>
  }

  const devicesFor = (sig: string) =>
    (devicesQ.data ?? []).filter((d) => plan.devices.includes(d.id) && d.signals.includes(sig as never))
  const approvedAt = plan.history.find((h) => h.event.startsWith('approved'))?.at
  const totalDays = daysBetween(plan.window.start, plan.window.end) + 1
  const elapsed = approvedAt ? Math.min(totalDays, Math.max(1, daysBetween(approvedAt.slice(0, 10), new Date().toISOString().slice(0, 10)) + 1)) : 0

  return (
    <div className="stack">
      <div className="row-between">
        <a href="#/tests" className="row" style={{ gap: 6 }}><Icon name="arrowLeft" size={16} /> My tests</a>
        <StatusChip status={plan.status} patient />
      </div>
      {err && <div className="alert alert-error" role="alert"><Icon name="info" />{err}</div>}

      {plan.status === 'pending_approval' && (
        <section className="bottom-grid">
          <article className="card">
            <p className="eyebrow">{plan.clinician_name} is asking</p>
            <h1>{plan.title}</h1>
            <div className="summary-text">{plan.patient_summary}</div>
            {plan.intervention && (
              <>
                <h3 style={{ fontSize: 18 }}>Your schedule</h3>
                <p className="muted" style={{ marginTop: 4 }}>You'll switch between <strong>A: {plan.intervention.arm_a}</strong> and <strong>B: {plan.intervention.arm_b}</strong> in a random order, with short breaks in between.</p>
                <PlanSchedule plan={plan} />
              </>
            )}
            <div className="big-actions">
              <button className="button success lg" disabled={busy} onClick={() => doAction('approve', 'Approved. Thank you! You can pause or stop any time.')}><Icon name="check" /> Approve</button>
              <button className="button danger lg" disabled={busy} onClick={() => setConfirm('decline')}><Icon name="x" /> Decline</button>
            </div>
          </article>
          <aside className="card">
            <div className="card-title"><div><h3 style={{ fontSize: 18 }}>Exactly what will be shared</h3><p style={{ fontSize: 14 }}>Nothing more, and only if you approve</p></div></div>
            <ul className="shared-list">
              {plan.signals.map((s) => (
                <li key={s}>
                  <span className="ic tone-purple"><Icon name={SIGNAL_ICON[s] ?? 'activity'} size={17} /></span>
                  <span><strong>{SIGNAL_INFO[s]?.label ?? s}</strong><br /><span className="muted small">
                    {s === 'episode' ? 'From this app (you log these)' : `From your ${devicesFor(s).map((d) => d.name).join(' or ') || 'device'}`}
                  </span></span>
                </li>
              ))}
              <li><span className="ic tone-yellow"><Icon name="calendar" size={17} /></span><span>Only <strong>{formatDate(plan.window.start)}</strong> to <strong>{formatDate(plan.window.end)}</strong></span></li>
              <li><span className="ic tone-gray"><Icon name="x" size={17} /></span><span>No location, messages, or other health data</span></li>
            </ul>
            <div className="insight mt"><span><Icon name="shield" size={17} /></span><p><strong>You stay in control</strong>Pause or stop at any time. If you stop, data already collected for this test is kept and results are marked incomplete.</p></div>
          </aside>
        </section>
      )}

      {plan.status === 'declined' && (
        <div className="card">
          <h1>{plan.title}</h1>
          <p style={{ fontSize: 18, marginTop: 10 }}>You declined this test. Nothing was shared.</p>
        </div>
      )}

      {(plan.status === 'active' || plan.status === 'paused') && (
        <section className="bottom-grid">
          <article className="card">
            <p className="eyebrow">Test in progress</p>
            <h1>{plan.title}</h1>
            {plan.status === 'paused' && <div className="alert alert-warn mt"><Icon name="pause" />Paused. Nothing new is being collected until you resume.</div>}
            <div className="row-between mt" style={{ fontSize: 17 }}>
              <strong>Day {elapsed} of {totalDays}</strong>
              <span className="muted">{formatDate(plan.window.start)} – {formatDate(plan.window.end)}</span>
            </div>
            <div className="progress mt" aria-label="progress"><div style={{ width: `${(elapsed / totalDays) * 100}%` }} /></div>
            {plan.intervention && <div className="mt"><PlanSchedule plan={plan} /></div>}
            <div className="big-actions">
              <button className="button primary lg" onClick={() => setLogOpen(true)}><Icon name="plus" /> Log an episode</button>
              {plan.status === 'active'
                ? <button className="button secondary lg" disabled={busy} onClick={() => doAction('pause', 'Paused. Nothing new will be collected.')}><Icon name="pause" /> Pause</button>
                : <button className="button secondary lg" disabled={busy} onClick={() => doAction('resume', 'Resumed.')}><Icon name="play" /> Resume</button>}
              <button className="button danger lg" disabled={busy} onClick={() => setConfirm('stop')}><Icon name="stop" /> Stop test</button>
            </div>
          </article>
          <aside className="card">
            <div className="card-title"><div><h3 style={{ fontSize: 18 }}>Sharing right now</h3><p style={{ fontSize: 14 }}>{plan.status === 'paused' ? 'Paused, nothing is being collected' : 'Only for this test'}</p></div></div>
            <ul className="shared-list">
              {plan.signals.map((s) => (
                <li key={s}><span className={`ic ${plan.status === 'paused' ? 'tone-gray' : 'tone-purple'}`}><Icon name={SIGNAL_ICON[s] ?? 'activity'} size={17} /></span>{SIGNAL_INFO[s]?.label ?? s}</li>
              ))}
              {plan.devices.map((d) => (
                <li key={d} className="muted small"><span className="ic tone-gray"><Icon name={DEVICE_ICON[d] ?? 'watch'} size={17} /></span>{(devicesQ.data ?? []).find((x) => x.id === d)?.name ?? d}</li>
              ))}
            </ul>
            <div className="insight warn mt">
              <span><Icon name="fastForward" size={17} /></span>
              <p><strong>Demo mode</strong>The data is historical, so this whole test can run instantly.</p>
            </div>
            <button className="button demo mt" style={{ width: '100%' }} disabled={busy} onClick={() => act(() => api.simulateComplete(planId), 'Test complete. Here are your results.')}>
              <Icon name="fastForward" /> Simulate complete (demo)
            </button>
          </aside>
        </section>
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
                <p className="muted">Nothing will be shared. Your clinician will see that you declined.</p>
                <div className="big-actions">
                  <button className="button danger" onClick={() => doAction('decline', 'Declined. Nothing was shared.')}>Yes, decline</button>
                  <button className="button ghost" onClick={() => setConfirm(null)}>Go back</button>
                </div>
              </>
            ) : (
              <>
                <h2>Stop this test?</h2>
                <p className="muted">No new data will be collected. Data already collected for this test is kept, and your results will be marked <strong>incomplete</strong>.</p>
                <div className="big-actions">
                  <button className="button danger" onClick={() => doAction('stop', 'Stopped. Your results so far are below.')}>Yes, stop</button>
                  <button className="button ghost" onClick={() => setConfirm(null)}>Keep going</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {logOpen && <LogEpisodeModal patientId={plan.patient_id} defaultDate={plan.window.end} onClose={(msg) => { setLogOpen(false); if (msg) toast(msg) }} />}
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
        <p className="muted">Write it down while you remember. Your clinician won't be alerted.</p>
        <div className="field mt"><label htmlFor="ep-d">When did it happen?</label><input id="ep-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="ep-n">Note (optional)</label><input id="ep-n" placeholder="e.g. headache" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="big-actions">
          <button className="button primary lg" disabled={busy || !date} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="button ghost" onClick={() => onClose()}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
