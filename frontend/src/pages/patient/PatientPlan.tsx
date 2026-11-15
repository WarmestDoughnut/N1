import { useEffect, useState } from 'react'
import { api, friendlyError } from '../../api'
import type { Device, Plan, PlanAction, Results, SchedulePeriod } from '../../types'
import { useAsync } from '../../lib/hooks'
import { DEVICE_ICON, Icon, SIGNAL_ICON } from '../../components/Icon'
import { StatusChip } from '../../components/Verdict'
import { ResultsView } from '../../components/ResultsView'
import { ABCalendar } from '../../components/TestDesign'
import { v15, v15Plan, type Symptom } from '../../lib/v15'
import { useToast } from '../../components/Shell'
import { RunProgress, resultsWithRetry } from '../../components/RunProgress'
import { addDays, daysBetween, formatDate, formatDateShort, SIGNAL_INFO } from '../../lib/util'
import type { PatientData } from './PatientApp'

export function PatientPlan({ planId, data }: { planId: string; data: PatientData }) {
  const toast = useToast()
  const planQ = useAsync<Plan>(() => api.getPlan(planId), [planId])
  const devicesQ = useAsync<Device[]>(() => api.devices(), [])
  const plan = planQ.data
  const finished = plan && (plan.status === 'complete' || plan.status === 'stopped')
  const resultsQ = useAsync<Results | null>(
    () => (finished ? resultsWithRetry(planId) : Promise.resolve(null)),
    [planId, plan?.status],
  )
  const [busy, setBusy] = useState(false)
  /** which action is in flight (button label + simulate progress) */
  const [running, setRunning] = useState<PlanAction | 'simulate' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'decline' | 'stop' | null>(null)
  const [logOpen, setLogOpen] = useState(false)

  const act = async (fn: () => Promise<Plan>, msg: string, key: PlanAction | 'simulate') => {
    if (busy) return
    setBusy(true); setRunning(key); setErr(null); setConfirm(null)
    try { planQ.setData(await fn()); toast(msg) }
    catch (e) {
      // Visible even when the page is scrolled: the in-page alert sits at the top.
      const m = friendlyError(e)
      setErr(m); toast(`That didn't go through: ${m}`)
    } finally { setBusy(false); setRunning(null) }
  }
  const doAction = (a: PlanAction, msg: string) => act(() => api.planAction(planId, a), msg, a)

  if (planQ.error) return <div className="stack"><a href="#/tests">← My tests</a><div className="alert alert-error">{planQ.error}</div></div>
  if (!plan) return <div className="spinner">Loading…</div>
  if (data.patient && plan.patient_id !== data.patient.id) {
    return <div className="stack"><a href="#/tests">← My tests</a><div className="alert alert-error"><Icon name="shield" />This test belongs to a different account.</div></div>
  }

  const devicesFor = (sig: string) =>
    (devicesQ.data ?? []).filter((d) => plan.devices.includes(d.id) && d.signals.includes(sig as never))
  const approvedAt = plan.history.find((h) => h.event.startsWith('approve'))?.at
  const totalDays = daysBetween(plan.window.start, plan.window.end) + 1
  const elapsed = approvedAt ? Math.min(totalDays, Math.max(1, daysBetween(approvedAt.slice(0, 10), new Date().toISOString().slice(0, 10)) + 1)) : 0
  /** the plan date that corresponds to "today" (demo data is historical: day N of the plan = N days since approval) */
  const today = elapsed ? addDays(plan.window.start, elapsed - 1) : null

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
            <Instructions plan={plan} />
            {plan.intervention && (
              <>
                <h3 style={{ fontSize: 18 }}>Your schedule</h3>
                <PatientCalendar plan={plan} />
              </>
            )}
            <div className="big-actions">
              <button className="button success lg" disabled={busy} onClick={() => doAction('approve', 'Approved')}><Icon name="check" /> Approve</button>
              <button className="button danger lg" disabled={busy} onClick={() => setConfirm('decline')}><Icon name="x" /> Decline</button>
            </div>
          </article>
          <aside className="card">
            <div className="card-title"><div><h3 style={{ fontSize: 18 }}>Exactly what will be shared</h3></div></div>
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
            </ul>
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
            {plan.intervention?.schedule && plan.status === 'active' && today && <TodayBanner plan={plan} today={today} />}
            <p className="eyebrow">Test in progress</p>
            <h1>{plan.title}</h1>
            {plan.status === 'paused' && <div className="alert alert-warn mt"><Icon name="pause" />Paused. Nothing new is being collected until you resume.</div>}
            <div className="row-between mt" style={{ fontSize: 17 }}>
              <strong>Day {elapsed} of {totalDays}</strong>
              <span className="muted">{formatDate(plan.window.start)} – {formatDate(plan.window.end)}</span>
            </div>
            <div className="progress mt" aria-label="progress"><div style={{ width: `${(elapsed / totalDays) * 100}%` }} /></div>
            <Instructions plan={plan} />
            {plan.intervention && <div className="mt"><PatientCalendar plan={plan} today={plan.status === 'active' ? today : null} /></div>}
            <div className="big-actions">
              <button className="button primary lg" onClick={() => setLogOpen(true)}><Icon name="plus" /> Log</button>
              {plan.status === 'active'
                ? <button className="button secondary lg" disabled={busy} onClick={() => doAction('pause', 'Paused. Nothing new will be collected.')}><Icon name="pause" /> {running === 'pause' ? 'Pausing…' : 'Pause'}</button>
                : <button className="button secondary lg" disabled={busy} onClick={() => doAction('resume', 'Resumed.')}><Icon name="play" /> {running === 'resume' ? 'Resuming…' : 'Resume'}</button>}
              <button className="button danger lg" disabled={busy} onClick={() => setConfirm('stop')}><Icon name="stop" /> Stop test</button>
            </div>
          </article>
          <aside className="card">
            <div className="card-title"><div><h3 style={{ fontSize: 18 }}>Sharing right now</h3></div></div>
            <ul className="shared-list">
              {plan.signals.map((s) => (
                <li key={s}><span className={`ic ${plan.status === 'paused' ? 'tone-gray' : 'tone-purple'}`}><Icon name={SIGNAL_ICON[s] ?? 'activity'} size={17} /></span>{SIGNAL_INFO[s]?.label ?? s}</li>
              ))}
              {plan.devices.map((d) => (
                <li key={d} className="muted small"><span className="ic tone-gray"><Icon name={DEVICE_ICON[d] ?? 'watch'} size={17} /></span>{(devicesQ.data ?? []).find((x) => x.id === d)?.name ?? d}</li>
              ))}
            </ul>
            <button className="button demo mt" style={{ width: '100%' }} disabled={busy} onClick={() => act(() => api.simulateComplete(planId), 'Test complete. Here are your results.', 'simulate')}>
              <Icon name="fastForward" /> {running === 'simulate' ? 'Running…' : 'Simulate complete (demo)'}
            </button>
            <RunProgress plan={plan} active={running === 'simulate'} audience="patient" />
          </aside>
        </section>
      )}

      {finished && (
        resultsQ.loading && !resultsQ.data ? <div className="spinner">Calculating your result…</div>
          : resultsQ.error ? <div className="alert alert-error">{resultsQ.error}</div>
            : resultsQ.data ? <ResultsView results={resultsQ.data} plan={plan} audience="patient" />
              : <div className="card"><h1>{plan.title}</h1><p>Your result is still being calculated.</p><button className="button secondary" onClick={resultsQ.reload}>Check again</button></div>
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

      {logOpen && <LogModal patientId={plan.patient_id} defaultDate={today ?? plan.window.end} onClose={(msg) => { setLogOpen(false); if (msg) toast(msg) }} />}
    </div>
  )
}

/** What A, B and a break mean, on the dated calendar (no "A-B-B-A" strings). */
function PatientCalendar({ plan, today }: { plan: Plan; today?: string | null }) {
  const iv = plan.intervention
  if (!iv?.schedule?.length) return null
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
        <span className="chip" style={{ background: 'var(--arm-a)', color: '#fff' }}>A</span><span>{iv.arm_a}</span>
        <span className="chip" style={{ background: 'var(--arm-b)', color: '#2b1503', marginLeft: 8 }}>B</span><span>{iv.arm_b}</span>
        <span className="chip td-hatch" style={{ marginLeft: 8, color: '#5d5e6b' }}>Break</span><span>back to your usual routine</span>
      </div>
      <ABCalendar schedule={iv.schedule} armA={iv.arm_a} armB={iv.arm_b} today={today} breakLabel="Break: your usual routine" />
    </div>
  )
}

function todayStep(schedule: SchedulePeriod[], date: string) {
  for (let i = 0; i < schedule.length; i++) {
    const p = schedule[i]
    if (date >= p.start && date <= p.end) return { kind: p.arm, day: daysBetween(p.start, date) + 1, len: daysBetween(p.start, p.end) + 1, p, next: schedule[i + 1] }
    if (date > p.end && date <= p.washout_end) return { kind: 'break' as const, day: daysBetween(p.end, date), len: daysBetween(p.end, p.washout_end), p, next: schedule[i + 1] }
  }
  return null
}

/** "Today: Melatonin 3 mg · day 3 of 6", large, at the top of an active A/B test. */
function TodayBanner({ plan, today }: { plan: Plan; today: string }) {
  const iv = plan.intervention!
  const t = todayStep(iv.schedule!, today)
  if (!t) return null
  const name = (a: 'A' | 'B') => (a === 'A' ? iv.arm_a : iv.arm_b)
  const isBreak = t.kind === 'break'
  const nextLine = isBreak
    ? (t.next ? `${name(t.next.arm)} starts ${formatDateShort(t.next.start)}` : 'This is the last break')
    : t.day < t.len ? `Until ${formatDateShort(t.p.end)}` : t.p.washout_end > t.p.end ? `Then a break from ${formatDateShort(addDays(t.p.end, 1))}` : t.next ? `Then ${name(t.next.arm)} from ${formatDateShort(t.next.start)}` : 'Last day of the test'
  const bg = isBreak ? '#f4f4f7' : t.kind === 'A' ? 'var(--accent-soft-2)' : '#fdeee2'
  const line = isBreak ? '#dcdce4' : t.kind === 'A' ? 'var(--accent-line)' : '#e9b48e'
  return (
    <div style={{ background: bg, border: `1px solid ${line}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
      <div className="small" style={{ fontWeight: 700, color: '#5d5e6b' }}>Today · {formatDate(today)}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#242430', letterSpacing: -0.4, margin: '2px 0' }}>
        {isBreak ? 'Break: your usual routine' : name(t.kind as 'A' | 'B')}
        <span style={{ fontSize: 15, fontWeight: 600, color: '#5d5e6b', marginLeft: 10 }}>day {t.day} of {t.len}</span>
      </div>
      <div className="small muted">{nextLine}</div>
    </div>
  )
}

/** The clinician's instructions for this plan (v1.5 `plan.instructions`). */
function Instructions({ plan }: { plan: Plan }) {
  const text = v15Plan(plan).instructions?.trim()
  if (!text) return null
  return (
    <div className="mt" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', background: '#fff' }}>
      <div className="small" style={{ fontWeight: 700, color: '#5d5e6b', marginBottom: 4 }}>Instructions from {plan.clinician_name}</div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 15.5, color: '#2f2f3b' }}>{text}</div>
    </div>
  )
}

/** "Log": pick one of your symptoms / events (v1.5 B1), a date, and an optional note. */
function LogModal({ patientId, defaultDate, onClose }: { patientId: string; defaultDate: string; onClose: (msg?: string) => void }) {
  const [symptoms, setSymptoms] = useState<Symptom[] | null>(null)
  const [sid, setSid] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    // You log symptoms and events (things that happen on a day), not standing conditions.
    v15.symptoms(patientId).then((all) => { const xs = all.filter((x) => x.kind !== 'condition'); setSymptoms(xs); if (xs.length === 1) setSid(xs[0].id); if (!xs.length) setAdding(true) })
      .catch((e) => { setErr(friendlyError(e)); setSymptoms([]) })
  }, [patientId])
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      let id = sid
      let name = symptoms?.find((s) => s.id === sid)?.name
      if (adding) {
        const s = await v15.addSymptom(patientId, { name: newName.trim(), kind: 'symptom' })
        id = s.id; name = s.name
      }
      await v15.logSymptom({ patient_id: patientId, date, symptom_id: id, note: note.trim() || undefined })
      onClose(`${name ?? 'Logged'}: ${formatDate(date)}`)
    } catch (e) { setErr(friendlyError(e)); setBusy(false) }
  }
  const ready = !!date && (adding ? newName.trim().length > 0 : !!sid)
  return (
    <div className="modal-back" onClick={() => onClose()}>
      <div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <h2>Log</h2>
        <div className="field mt">
          <label htmlFor="lg-s">What happened?</label>
          {symptoms == null ? <div className="spinner">Loading…</div> : (
            <select id="lg-s" value={adding ? '__new' : sid} onChange={(e) => { if (e.target.value === '__new') { setAdding(true); setSid('') } else { setAdding(false); setSid(e.target.value) } }}>
              {!sid && !adding && <option value="">Choose…</option>}
              {symptoms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__new">+ Something else…</option>
            </select>
          )}
        </div>
        {adding && <div className="field"><label htmlFor="lg-new">Name it</label><input id="lg-new" placeholder="e.g. Dizziness" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>}
        <div className="field"><label htmlFor="ep-d">When?</label><input id="ep-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="ep-n">Note (optional)</label><input id="ep-n" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="big-actions">
          <button className="button primary lg" disabled={busy || !ready} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="button ghost" onClick={() => onClose()}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
