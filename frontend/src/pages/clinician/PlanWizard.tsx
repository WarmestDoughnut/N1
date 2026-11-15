import { useEffect, useMemo, useState } from 'react'
import { api, friendlyError } from '../../api'
import type { Device, Direction, Patient, Plan, PlanCreate, PlanType, SchedulePeriod, SignalId } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import { ScheduleTimeline } from '../../components/ScheduleTimeline'
import { Icon } from '../../components/Icon'
import { DevicePicker, SignalPicker } from '../../components/SourcePicker'
import { useToast } from '../../components/Shell'
import { getSession, initials } from '../../lib/session'
import { ALL_SIGNALS, formatDate, SIGNAL_INFO, signalLabel } from '../../lib/util'

const STEPS = ['Patient', 'Devices', 'Signals', 'Test design', 'Review & send']
const SENSOR_SIGNALS: SignalId[] = ALL_SIGNALS.filter((s) => s !== 'episode')

interface ObsForm { signal: SignalId; direction: Direction; max_lag_days: number }
interface IvForm { arm_a: string; arm_b: string; outcome_signal: SignalId; better: Direction; period_days: number; washout_days: number; n_periods: number; seed: number }


/** "#/new?from=PLAN-3" pre-fills the wizard from an existing plan (demo: same plan, another patient). */
function readParam(name: string): string | null {
  const q = window.location.hash.split('?')[1]
  return q ? new URLSearchParams(q).get(name) : null
}

export function PlanWizard({ patients }: { patients: Patient[] }) {
  const devicesQ = useAsync<Device[]>(() => api.devices(), [])
  const catalog = devicesQ.data ?? []
  const toast = useToast()

  const [step, setStep] = useState(0)
  const [patientId, setPatientId] = useState('')
  const [devices, setDevices] = useState<string[]>([])
  // What the clinician ticked. Kept even while a device is removed, so re-adding it restores the choice.
  const [picked, setSignals] = useState<SignalId[]>([])
  const [type, setType] = useState<PlanType>('observational')
  const [obs, setObs] = useState<ObsForm>({ signal: 'sleep_min', direction: 'lower', max_lag_days: 3 })
  const [iv, setIv] = useState<IvForm>({ arm_a: 'No melatonin', arm_b: 'Melatonin 3mg', outcome_signal: 'sleep_min', better: 'higher', period_days: 6, washout_days: 2, n_periods: 12, seed: 42 })
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [clinician, setClinician] = useState(() => getSession()?.name ?? 'Dr. Rivera')
  const [schedule, setSchedule] = useState<SchedulePeriod[]>([])
  const [scheduleErr, setScheduleErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [cloneOf, setCloneOf] = useState<Plan | null>(null)
  // Historical demo data was recorded on a fixed A/B schedule (backend demo_plans.json). A freshly
  // randomized schedule can't line up with when the patient actually took the intervention, so we
  // offer the recorded one. `recorded` = the schedule + window we're locked to, if chosen.
  const [recorded, setRecorded] = useState<Plan | null>(null)

  const patient = patients.find((p) => p.id === patientId)

  // ----- clone from existing plan -----
  useEffect(() => {
    const from = readParam('from')
    if (!from) return
    api.getPlan(from).then((p) => {
      setCloneOf(p)
      setType(p.type)
      setDevices(p.devices)
      setSignals(p.signals)
      if (p.observational) setObs(p.observational)
      if (p.intervention) { const { schedule: _s, ...rest } = p.intervention; void _s; setIv(rest) }
      setTitle(p.title); setTitleTouched(true)
      setClinician(p.clinician_name)
    }).catch(() => {})
  }, [])

  // ----- device → signal availability (gate agreed with backend, to-frontend #5) -----
  // selectable = (∪ selected devices' signals) ∩ patient.signals_present, plus `episode` (logged in the app).
  const availableFor = (p: Patient | undefined, devs: string[]) => {
    const s = new Set<SignalId>(['episode'])
    catalog.filter((d) => devs.includes(d.id)).forEach((d) => d.signals.forEach((x) => {
      if (x === 'episode' || !p?.signals_present || p.signals_present.includes(x)) s.add(x)
    }))
    return s
  }
  const available = useMemo(() => availableFor(patient, devices), [catalog, devices, patient]) // eslint-disable-line react-hooks/exhaustive-deps
  // A selected device tracks it, but this patient has no data for it.
  const noData = useMemo(() => {
    const s = new Set<SignalId>()
    catalog.filter((d) => devices.includes(d.id)).forEach((d) => d.signals.forEach((x) => { if (!available.has(x)) s.add(x) }))
    return s
  }, [catalog, devices, available])
  const episodes = patient?.n_episodes ?? 0
  const obsBlocked = !!patient && episodes === 0

  // Effective selection = ticked AND provided by a selected device.
  const signals: SignalId[] = useMemo(() => picked.filter((s) => available.has(s)), [picked, available])

  const chosenSensors: SignalId[] = signals.filter((s) => s !== 'episode')

  // Keep the test config pointing at a selected signal.
  useEffect(() => {
    if (chosenSensors.length && !chosenSensors.includes(obs.signal)) setObs((o) => ({ ...o, signal: chosenSensors[0] }))
    if (chosenSensors.length && !chosenSensors.includes(iv.outcome_signal)) setIv((o) => ({ ...o, outcome_signal: chosenSensors[0] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals.join(',')])

  // Auto title
  const autoTitle = type === 'observational'
    ? `Does ${obs.direction} ${SIGNAL_INFO[obs.signal].plain} precede episodes?`
    : `Does ${iv.arm_b} ${iv.better === 'higher' ? 'improve' : 'lower'} ${SIGNAL_INFO[iv.outcome_signal].plain}?`
  useEffect(() => { if (!titleTouched) setTitle(autoTitle) }, [autoTitle, titleTouched])

  const patientPlans = useAsync<Plan[]>(() => (patientId ? api.listPlans(patientId) : Promise.resolve([])), [patientId])
  const recordedPlan = (patientPlans.data ?? []).find((p) => p.intervention?.schedule?.length && (p.seeded ?? p.id.startsWith('DEMO-'))) ?? null
  useEffect(() => { setRecorded(null) }, [patientId])
  const applyRecorded = (p: Plan) => {
    const { schedule: sch, ...rest } = p.intervention!
    setIv(rest); setSchedule(sch); setRecorded(p); setScheduleErr(null)
    if (!titleTouched) { setTitle(p.title); setTitleTouched(true) }
  }

  // Editing the design after choosing the recorded schedule means a new (randomized) schedule.
  useEffect(() => {
    const r = recorded?.intervention
    if (r && (r.n_periods !== iv.n_periods || r.period_days !== iv.period_days || r.washout_days !== iv.washout_days || r.seed !== iv.seed)) setRecorded(null)
  }, [recorded, iv.n_periods, iv.period_days, iv.washout_days, iv.seed])

  // Live schedule preview
  const start = patient?.date_range[0] ?? '2026-01-01'
  useEffect(() => {
    if (type !== 'intervention' || recorded) return
    const valid = iv.n_periods >= 2 && iv.period_days >= 1 && iv.washout_days >= 0
    if (!valid) { setSchedule([]); return }
    const t = setTimeout(() => {
      api.schedulePreview({ n_periods: iv.n_periods, period_days: iv.period_days, washout_days: iv.washout_days, seed: iv.seed, start })
        .then((r) => { setSchedule(r.schedule); setScheduleErr(null) })
        .catch((e) => setScheduleErr(friendlyError(e)))
    }, 200)
    return () => clearTimeout(t)
  }, [type, iv.n_periods, iv.period_days, iv.washout_days, iv.seed, start, recorded])

  // ----- step handlers -----
  const pickPatient = (p: Patient) => {
    setPatientId(p.id)
    // No logged episodes → nothing to look "before", so only an A/B test makes sense.
    if (p.n_episodes === 0) setType('intervention')
    if (!cloneOf) {
      setDevices(p.devices)
      const avail = availableFor(p, p.devices)
      const first = (['sleep_min', ...SENSOR_SIGNALS] as SignalId[]).find((s) => avail.has(s))
      setSignals([first, p.n_episodes > 0 ? 'episode' : undefined].filter(Boolean) as SignalId[])
    }
  }

  // "#/new?patient=SYN-PATTERN" jumps straight to the device step for that patient.
  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    const pid = readParam('patient')
    const p = pid && patients.find((x) => x.id === pid)
    if (!prefilled && p && catalog.length) { pickPatient(p); setStep(1); setPrefilled(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, catalog, prefilled])

  const toggleDevice = (id: string) => setDevices((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))
  const toggleSignal = (s: SignalId) => setSignals((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  const window_ = useMemo(() => {
    if (!patient) return { start: '', end: '' }
    if (type === 'intervention' && schedule.length) return { start: schedule[0].start, end: schedule[schedule.length - 1].washout_end }
    return { start: patient.date_range[0], end: patient.date_range[1] }
  }, [patient, type, schedule])

  // Consent is minimal: share only the signals the test actually uses, from devices that provide them.
  const finalSignals: SignalId[] = useMemo(
    () => (type === 'observational' ? [obs.signal, 'episode'] : [iv.outcome_signal]),
    [type, obs.signal, iv.outcome_signal],
  )
  const finalDevices: string[] = useMemo(() => {
    const used = devices.filter((d) => catalog.find((c) => c.id === d)?.signals.some((s) => s !== 'episode' && finalSignals.includes(s)))
    return used.length ? used : devices
  }, [devices, catalog, finalSignals])
  const droppedSignals = signals.filter((s) => !finalSignals.includes(s))

  const scheduleOverruns = !!patient && type === 'intervention' && schedule.length > 0 && window_.end > patient.date_range[1]
  // Block randomization: k AB/BA blocks → 2^k equally likely schedules → smallest possible p = 1/2^k.
  const minP = type === 'intervention' && iv.n_periods % 2 === 0 ? 1 / 2 ** (iv.n_periods / 2) : null

  const stepError = (() => {
    if (step === 0 && !patient) return 'Choose a patient.'
    if (step === 1 && devices.length === 0) return 'Select at least one device.'
    if (step === 2 && chosenSensors.length === 0) return 'Select at least one sensor signal. If none are available, add a device that provides one.'
    if (step === 3) {
      if (type === 'observational' && obsBlocked) return 'No episodes logged, so use an A/B test.'
      if (type === 'observational' && !chosenSensors.includes(obs.signal)) return 'Pick a signal to test.'
      if (type === 'intervention') {
        if (!iv.arm_a.trim() || !iv.arm_b.trim()) return 'Name both arms.'
        if (iv.n_periods < 10 || iv.n_periods % 2) return 'Use an even number of periods, at least 10 (5 A/B blocks). Fewer can never pass the chance check.'
        if (!schedule.length) return 'Waiting for the schedule preview…'
        if (scheduleOverruns) return `The schedule runs past this patient's data (ends ${patient!.date_range[1]}). Use fewer or shorter periods.`
      }
    }
    if (step === 4 && !title.trim()) return 'Give the plan a title.'
    return null
  })()

  const send = async () => {
    if (!patient) return
    setSending(true); setSendErr(null)
    const body: PlanCreate = {
      patient_id: patient.id,
      clinician_name: clinician.trim() || 'Clinician',
      title: title.trim(),
      type,
      devices: finalDevices,
      signals: finalSignals,
      window: window_,
      observational: type === 'observational' ? obs : null,
      intervention: type === 'intervention' ? { ...iv, schedule } : null,
    }
    try {
      const plan = await api.createPlan(body)
      toast(`Sent to ${patient.display_name} for approval`)
      navigate(`/plans/${plan.id}`)
    } catch (e) {
      setSendErr(friendlyError(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <section className="page-heading">
        <div>
          <p className="eyebrow"><a href="#/plans">Test plans</a> / New</p>
          <h1>New test plan</h1>
          <span className="sub">Turn a clinical hunch into a structured test on one patient's own device data.</span>
        </div>
      </section>
      {cloneOf && <div className="alert alert-info mb"><Icon name="clipboard" /><span>Copying the design of <strong>{cloneOf.title}</strong> ({cloneOf.id}). Choose a patient to run it on.</span></div>}

      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''}>
            <span className="n">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>{s}
          </li>
        ))}
      </ol>

      <div className="card">
        {step === 0 && (
          <>
            <h2>Which patient?</h2>
            <div className="option-grid">
              {patients.map((p) => (
                <button key={p.id} className={`option ${patientId === p.id ? 'selected' : ''}`} onClick={() => pickPatient(p)}>
                  {patientId === p.id && <span className="check"><Icon name="check" size={14} /></span>}
                  <span className="head"><span className={`mini-avatar ${(p.source === 'real' || p.source === 'pmdata') ? 'tone-green' : 'tone-purple'}`}>{initials(p.display_name)}</span><span className="title">{p.display_name}</span></span>
                  <span className="sub">{p.id} · {(p.source === 'real' || p.source === 'pmdata') ? 'PMData (real)' : 'Synthetic'}</span>
                  <span className="sub">{p.n_days} days · {p.n_episodes} episodes logged</span>
                  <span className="sub">Owns: {p.devices.map((d) => catalog.find((c) => c.id === d)?.name ?? d).join(', ')}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Which devices will this test use?</h2>
            <p className="muted">Pre-selected: the devices {patient?.display_name} already owns. Signals depend on the devices you choose.</p>
            {devicesQ.error && <div className="alert alert-error">{devicesQ.error}</div>}
            <DevicePicker catalog={catalog} owned={patient?.devices ?? []} selected={devices} onToggle={toggleDevice}
              patientName={patient?.display_name.replace(/,.*$/, '')} />
          </>
        )}

        {step === 2 && (
          <>
            <h2>Which signals may this test use?</h2>
            <p className="muted">The patient's approval covers <strong>only</strong> the signals you select.</p>
            <SignalPicker signals={ALL_SIGNALS} available={available} noData={noData} selected={signals} onToggle={toggleSignal}
              sourcesFor={(s) => catalog.filter((d) => devices.includes(d.id) && d.signals.includes(s)).map((d) => d.name)} />
          </>
        )}

        {step === 3 && (
          <>
            <h2>Test design</h2>
            <div className="seg mb" role="radiogroup">
              <button className={type === 'observational' ? 'active' : ''} disabled={obsBlocked} title={obsBlocked ? 'No episodes logged, so use an A/B test' : undefined} onClick={() => setType('observational')}>Observational</button>
              <button className={type === 'intervention' ? 'active' : ''} onClick={() => setType('intervention')}>Intervention (A/B trial)</button>
            </div>
            {obsBlocked && <div className="alert alert-info mb"><Icon name="info" /><span>{patient?.display_name} has no episodes logged, so an observational test isn't possible. Use an A/B test.</span></div>}
            {!obsBlocked && type === 'observational' && episodes < 5 && (
              <div className="alert alert-warn mb"><Icon name="info" /><span>Only {episodes} episode{episodes === 1 ? '' : 's'} logged. With fewer than 5, expect "not enough data".</span></div>
            )}
            <p className="muted">
              {type === 'observational'
                ? 'Does a signal change in the days before logged episodes? Compares those days against normal days and checks 1 to N day lags against random shuffles.'
                : 'Does a change (B) improve an outcome compared with none (A)? Periods are randomized in balanced A-B / B-A pairs, with washout days excluded.'}
            </p>

            {type === 'observational' ? (
              <div className="grid-3">
                <div className="field">
                  <label htmlFor="o-sig">Signal</label>
                  <select id="o-sig" value={obs.signal} onChange={(e) => setObs({ ...obs, signal: e.target.value as SignalId })}>
                    {SENSOR_SIGNALS.map((s) => <option key={s} value={s} disabled={!chosenSensors.includes(s)}>{SIGNAL_INFO[s].label}{chosenSensors.includes(s) ? '' : ' (not selected)'}</option>)}
                  </select>
                </div>
                <div className="field">
                  <span className="label">Hypothesis: before episodes it is…</span>
                  <div className="seg">
                    {(['lower', 'higher'] as Direction[]).map((d) => (
                      <button key={d} className={obs.direction === d ? 'active' : ''} onClick={() => setObs({ ...obs, direction: d })}>{d}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="o-lag">Look back up to (days)</label>
                  <select id="o-lag" value={obs.max_lag_days} onChange={(e) => setObs({ ...obs, max_lag_days: Number(e.target.value) })}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>)}
                  </select>
                  <span className="hint">Each extra lag is corrected for in the p-value.</span>
                </div>
              </div>
            ) : (
              <>
                <div className="grid-2">
                  <div className="field"><label htmlFor="a">Arm A (control)</label><input id="a" value={iv.arm_a} onChange={(e) => setIv({ ...iv, arm_a: e.target.value })} /></div>
                  <div className="field"><label htmlFor="b">Arm B (intervention)</label><input id="b" value={iv.arm_b} onChange={(e) => setIv({ ...iv, arm_b: e.target.value })} /></div>
                </div>
                <div className="grid-3">
                  <div className="field">
                    <label htmlFor="i-sig">Outcome signal</label>
                    <select id="i-sig" value={iv.outcome_signal} onChange={(e) => setIv({ ...iv, outcome_signal: e.target.value as SignalId })}>
                      {SENSOR_SIGNALS.map((s) => <option key={s} value={s} disabled={!chosenSensors.includes(s)}>{SIGNAL_INFO[s].label}{chosenSensors.includes(s) ? '' : ' (not selected)'}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <span className="label">Better is…</span>
                    <div className="seg">
                      {(['higher', 'lower'] as Direction[]).map((d) => (
                        <button key={d} className={iv.better === d ? 'active' : ''} onClick={() => setIv({ ...iv, better: d })}>{d}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="np">Number of periods</label>
                    <select id="np" value={iv.n_periods} onChange={(e) => setIv({ ...iv, n_periods: Number(e.target.value) })}>
                      {[6, 8, 10, 12, 14, 16].map((n) => <option key={n} value={n}>{n} periods ({n / 2} A/B blocks)</option>)}
                    </select>
                    {minP != null && (
                      <span className="hint" style={minP >= 0.05 ? { color: 'var(--yellow)', fontWeight: 600 } : undefined}>
                        Smallest possible p-value: {minP < 0.001 ? minP.toFixed(4) : minP.toFixed(3)}{minP >= 0.05 ? '. Too few blocks: results will be "not enough data". Use at least 10 periods.' : ''}
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="pd">Days per period</label>
                    <input id="pd" type="number" min={1} max={30} value={iv.period_days} onChange={(e) => setIv({ ...iv, period_days: Math.max(1, Number(e.target.value)) })} />
                  </div>
                  <div className="field">
                    <label htmlFor="wd">Washout days after each period</label>
                    <input id="wd" type="number" min={0} max={14} value={iv.washout_days} onChange={(e) => setIv({ ...iv, washout_days: Math.max(0, Number(e.target.value)) })} />
                    <span className="hint">Excluded from analysis so effects can wear off.</span>
                  </div>
                  <div className="field">
                    <span className="label">Randomization seed</span>
                    <div className="row">
                      <input type="number" value={iv.seed} onChange={(e) => setIv({ ...iv, seed: Number(e.target.value) })} style={{ width: 110 }} />
                      <button className="button secondary sm" onClick={() => setIv({ ...iv, seed: Math.floor(Math.random() * 10000) })}>Re-randomize</button>
                    </div>
                  </div>
                </div>
                {recordedPlan && (
                  <div className={`insight ${recorded ? '' : 'warn'} mt`} style={{ alignItems: 'center' }}>
                    <span><Icon name="calendar" size={17} /></span>
                    <p style={{ flex: 1 }}>
                      <strong>{recorded ? 'Using the schedule this patient followed' : 'This patient already followed a recorded A/B schedule'}</strong>
                      {recorded
                        ? `${recorded.intervention!.arm_a} vs ${recorded.intervention!.arm_b}, ${recorded.intervention!.n_periods} periods from ${formatDate(recorded.window.start)}. Demo data is historical, so the analysis must use the order the patient actually followed.`
                        : 'Demo data is historical: a newly randomized order would not match the days the patient actually took each option. Use the recorded schedule for an honest result.'}
                    </p>
                    {recorded
                      ? <button className="button ghost sm" onClick={() => setRecorded(null)}>Randomize instead</button>
                      : <button className="button primary sm" onClick={() => applyRecorded(recordedPlan)}>Use recorded schedule</button>}
                  </div>
                )}
                <div className="mt">
                  <div className="chart-title">{recorded ? 'Recorded schedule' : 'Schedule preview'}</div>
                  {scheduleErr && <div className="alert alert-error">{scheduleErr}</div>}
                  <ScheduleTimeline schedule={schedule} armA={iv.arm_a} armB={iv.arm_b} />
                  {scheduleOverruns && <div className="alert alert-warn mt">This schedule ends {formatDate(window_.end)}, after the patient's data ends ({formatDate(patient!.date_range[1])}).</div>}
                </div>
              </>
            )}
          </>
        )}

        {step === 4 && patient && (
          <>
            <h2>Review & send to patient</h2>
            <div className="grid-2">
              <div>
                <div className="field"><label htmlFor="t">Question (shown to the patient)</label>
                  <input id="t" value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true) }} />
                </div>
                <div className="field"><label htmlFor="c">Clinician</label><input id="c" value={clinician} onChange={(e) => setClinician(e.target.value)} /></div>
                <table className="table kv">
                  <tbody>
                    <tr><th>Patient</th><td>{patient.display_name} <span className="muted small">({patient.id})</span></td></tr>
                    <tr><th>Devices</th><td>{finalDevices.map((d) => catalog.find((c) => c.id === d)?.name ?? d).join(', ')}</td></tr>
                    <tr><th>Signals shared</th><td>{finalSignals.map(signalLabel).join(', ')}
                      {droppedSignals.length > 0 && <div className="small muted">Not shared, because this test doesn't use them: {droppedSignals.map(signalLabel).join(', ')}</div>}</td></tr>
                    <tr><th>Window</th><td>{formatDate(window_.start)} → {formatDate(window_.end)}</td></tr>
                    {type === 'observational' ? (
                      <tr><th>Test</th><td>Observational: is {SIGNAL_INFO[obs.signal].plain} <strong>{obs.direction}</strong> in the 1–{obs.max_lag_days} days before episodes?</td></tr>
                    ) : (
                      <tr><th>Test</th><td>A/B trial: {iv.n_periods} periods × {iv.period_days} days, {iv.washout_days}-day washout. Outcome: {SIGNAL_INFO[iv.outcome_signal].plain} ({iv.better} is better)</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="insight mb">
                  <span><Icon name="shield" size={17} /></span>
                  <p><strong>The plan is the consent</strong>The patient gets a plain-language summary listing exactly these signals and dates. Nothing is shared unless they approve, and they can pause or stop at any time. You don't need to monitor anything: you'll get the verdict when the plan completes.</p>
                </div>
                {type === 'intervention' && <ScheduleTimeline schedule={schedule} armA={iv.arm_a} armB={iv.arm_b} compact />}
              </div>
            </div>
            {sendErr && <div className="alert alert-error mt">{sendErr}</div>}
          </>
        )}

        <div className="wizard-nav">
          <button className="button ghost" onClick={() => (step === 0 ? navigate('/') : setStep(step - 1))}>{step === 0 ? 'Cancel' : '← Back'}</button>
          <div className="row">
            {stepError && step > 0 && <span className="small" style={{ color: 'var(--yellow)' }}>{stepError}</span>}
            {step < 4 ? (
              <button className="button primary" disabled={!!stepError} onClick={() => setStep(step + 1)}>Next →</button>
            ) : (
              <button className="button success lg" disabled={!!stepError || sending} onClick={send}>{sending ? 'Sending…' : 'Send to patient for approval'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
