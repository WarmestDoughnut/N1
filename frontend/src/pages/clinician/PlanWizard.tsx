import { useEffect, useMemo, useState } from 'react'
import { api, friendlyError } from '../../api'
import type { Device, Direction, Patient, Plan, PlanCreate, PlanType, SchedulePeriod, SignalId } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import { ScheduleTimeline } from '../../components/ScheduleTimeline'
import { Icon } from '../../components/Icon'
import { DevicePicker, SignalPicker } from '../../components/SourcePicker'
import { ABTimeline, Fact, PatientDayPreview, PatternStrip, Slot, SlotEditor, Stepper, StrengthMeter, strengthFor } from '../../components/TestDesign'
import { randomizeStints, scheduleToStints, StintCalendar, stintsToSchedule, stintStats, type Assignment, type Stint } from '../../components/StintCalendar'
import { useToast } from '../../components/Shell'
import { getSession, initials } from '../../lib/session'
import { ALL_SIGNALS, daysBetween, formatDate, formatDateShort, SIGNAL_INFO, signalLabel } from '../../lib/util'

const STEPS = ['Patient', 'Devices', 'Signals', 'Test design', 'Review & send']
/** v1.4 lag scan: look-back windows of min_lag_days..max_lag_days (1 ≤ min ≤ max ≤ 14); window L = the L days before each episode. */
const LAG_MAX = 14
const SENSOR_SIGNALS: SignalId[] = ALL_SIGNALS.filter((s) => s !== 'episode')

/** "3 days" or "2–7 days" */
const lagRange = (a: number, b: number) => (a === b ? `${a} day${a > 1 ? 's' : ''}` : `${a}–${b} days`)
interface ObsForm { signal: SignalId | null; direction: Direction | null; min_lag_days: number | null; max_lag_days: number | null }
interface IvForm { arm_a: string; arm_b: string; outcome_signal: SignalId | null; better: Direction | null; period_days: number | null; washout_days: number | null; n_periods: number | null; seed: number }
/** Nothing pre-filled: every slot of the test design is the clinician's choice (only the randomization seed is internal). */
const EMPTY_OBS: ObsForm = { signal: null, direction: null, min_lag_days: null, max_lag_days: null }
const EMPTY_IV: IvForm = { arm_a: '', arm_b: '', outcome_signal: null, better: null, period_days: null, washout_days: null, n_periods: null, seed: 42 }
const NO_WIN = { start: '', end: '' }


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
  const [obs, setObs] = useState<ObsForm>(EMPTY_OBS)
  const [iv, setIv] = useState<IvForm>(EMPTY_IV)
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [clinician, setClinician] = useState(() => getSession()?.name ?? 'Dr. Rivera')
  /** A/B periods the clinician placed on the calendar (arms come from a coin flip per pair) */
  const [stints, setStints] = useState<Stint[]>([])
  const ss = stintStats(stints)
  const schedule: SchedulePeriod[] = useMemo(() => stintsToSchedule(stints), [stints])
  /** manual by default; 'randomized' only via "Randomize for me" (human's decision, sync #24) */
  const [assignment, setAssignment] = useState<Assignment>('manual')
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [cloneOf, setCloneOf] = useState<Plan | null>(null)
  // Historical demo data was recorded on a fixed A/B schedule (backend demo_plans.json). A freshly
  // randomized schedule can't line up with when the patient actually took the intervention, so we
  // offer the recorded one. `recorded` = the schedule + window we're locked to, if chosen.
  const [recorded, setRecorded] = useState<Plan | null>(null)
  // Test design step (FrontEndInspo/TestDesignStep): one slot editor open at a time.
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [abView, setAbView] = useState<'calendar' | 'timeline'>('calendar')
  /** observational plan dates (defaults to the patient's whole data range) */
  /** observational plan dates; '' = not chosen yet */
  const [obsWin, setObsWin] = useState<{ start: string; end: string }>(NO_WIN)

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
      if (p.observational) setObs({ ...p.observational, min_lag_days: p.observational.min_lag_days ?? 1 })
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


  // Every signal the selected devices provide AND this patient has data for: the test design offers all of them.
  const designSignals: SignalId[] = SENSOR_SIGNALS.filter((s) => available.has(s))
  // If a chosen signal stops being available (device removed), clear it rather than swapping in another.
  useEffect(() => {
    if (obs.signal && !available.has(obs.signal)) setObs((o) => ({ ...o, signal: null }))
    if (iv.outcome_signal && !available.has(iv.outcome_signal)) setIv((o) => ({ ...o, outcome_signal: null }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [[...available].join(',')])
  /** choosing a signal in the design step also adds it to the plan's allowed signals */
  const useSignal = (s: SignalId) => setSignals((cur) => (cur.includes(s) ? cur : [...cur, s]))
  const lbl = (s: SignalId | null) => (s ? SIGNAL_INFO[s].label : 'Not chosen yet')
  const obsReady = !!obs.signal && !!obs.direction
  const ivReady = !!iv.outcome_signal && !!iv.better && !!iv.arm_a.trim() && !!iv.arm_b.trim()

  // Auto title
  const autoTitle = type === 'observational'
    ? (obsReady ? `Does ${obs.direction} ${SIGNAL_INFO[obs.signal!].plain} precede episodes?` : '')
    : (ivReady ? `Does ${iv.arm_b.trim()} ${iv.better === 'higher' ? 'improve' : 'lower'} ${SIGNAL_INFO[iv.outcome_signal!].plain}?` : '')
  useEffect(() => { if (!titleTouched) setTitle(autoTitle) }, [autoTitle, titleTouched])

  const patientPlans = useAsync<Plan[]>(() => (patientId ? api.listPlans(patientId) : Promise.resolve([])), [patientId])
  const recordedPlan = (patientPlans.data ?? []).find((p) => p.intervention?.schedule?.length && (p.seeded ?? p.id.startsWith('DEMO-'))) ?? null
  useEffect(() => { setRecorded(null); setObsWin(NO_WIN); setOpenSlot(null); setStints([]); setAssignment('manual') }, [patientId])
  useEffect(() => { setOpenSlot(null) }, [type])
  // Arriving on the design step with nothing chosen: open the first slot that needs input.
  useEffect(() => {
    if (step !== 3) return
    if (type === 'observational') {
      if (!obsReady) setOpenSlot(2)
      else if (obs.min_lag_days == null || obs.max_lag_days == null) setOpenSlot(3)
      else if (!obsWin.start || !obsWin.end) setOpenSlot(4)
    } else {
      if (!iv.outcome_signal || !iv.better) setOpenSlot(1)
      else if (!ivReady) setOpenSlot(2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, type])
  const sig = (xs: { start: string; end: string; arm: string | null }[]) => [...xs].sort((a, b) => a.start.localeCompare(b.start)).map((x) => `${x.start}|${x.end}|${x.arm}`).join(',')
  const applyRecorded = (p: Plan) => {
    const { schedule: sch, ...rest } = p.intervention!
    setIv(rest); setStints(scheduleToStints(sch)); setRecorded(p)
    // the seeded demo schedules were generated by block randomization
    setAssignment((rest as { assignment?: Assignment }).assignment ?? 'randomized')
    if (!titleTouched) { setTitle(p.title); setTitleTouched(true) }
  }
  // Moving a period after loading the recorded schedule means it no longer matches what the patient did.
  useEffect(() => {
    if (recorded?.intervention && sig(stintsToSchedule(stints)) !== sig(recorded.intervention.schedule)) setRecorded(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stints, recorded])

  // ----- step handlers -----
  const pickPatient = (p: Patient) => {
    setPatientId(p.id)
    // Custom pattern dates belong to the previous patient's data range; don't carry them over.
    setObsWin(NO_WIN)
    // No logged episodes → nothing to look "before", so only an A/B test makes sense.
    // Otherwise default back to a pattern test, unless the design was copied from an existing plan.
    if (p.n_episodes === 0) setType('intervention')
    else if (!cloneOf) setType('observational')
    if (!cloneOf) {
      setDevices(p.devices)
      // Nothing pre-ticked or pre-filled: the clinician chooses what to measure and what to try.
      setSignals([])
      setObs(EMPTY_OBS); setIv(EMPTY_IV); setStints([]); setTitleTouched(false)
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
    return obsWin
  }, [patient, type, schedule, obsWin])

  // Consent is minimal: share only the signals the test actually uses, from devices that provide them.
  const finalSignals: SignalId[] = useMemo(
    () => (type === 'observational' ? [obs.signal, 'episode'] : [iv.outcome_signal]).filter(Boolean) as SignalId[],
    [type, obs.signal, iv.outcome_signal],
  )
  const finalDevices: string[] = useMemo(() => {
    const used = devices.filter((d) => catalog.find((c) => c.id === d)?.signals.some((s) => s !== 'episode' && finalSignals.includes(s)))
    return used.length ? used : devices
  }, [devices, catalog, finalSignals])
  const droppedSignals = signals.filter((s) => !finalSignals.includes(s))

  const stepError = (() => {
    if (step === 0 && !patient) return 'Choose a patient.'
    if (step === 1 && devices.length === 0) return 'Select at least one device.'
    if (step === 2 && designSignals.length === 0) return 'None of the selected devices has data for this patient yet. Add a device that does.'
    if (step === 3) {
      if (type === 'observational' && obsBlocked) return 'No episodes logged, so use an A/B test.'
      if (type === 'observational' && !obs.signal) return 'Choose what might come first (slot 2).'
      if (type === 'observational' && !obs.direction) return 'Choose lower or higher before episodes (slot 2).'
      if (type === 'observational' && (obs.min_lag_days == null || obs.max_lag_days == null)) return 'Choose how far back to look (slot 3).'
      if (type === 'observational' && (!window_.start || !window_.end)) return 'Choose the plan dates (slot 4).'
      if (type === 'observational' && window_.end <= window_.start) return 'The plan end date must be after its start date.'
      if (type === 'intervention') {
        if (!iv.outcome_signal) return 'Choose what you want to improve (slot 1).'
        if (!iv.better) return 'Choose whether higher or lower is better (slot 1).'
        if (!iv.arm_b.trim() || !iv.arm_a.trim()) return 'Name what you are trying and what it is compared with (slot 2).'
        if (ss.count === 0) return 'Paint the A and B periods on the calendar (slot 3).'
        if (ss.count < 10) return `Paint at least 10 periods; you have ${ss.count}. Fewer can never pass the chance check.`
        if (ss.nA < 2 || ss.nB < 2) return 'Each option needs at least 2 periods.'
        if (assignment === 'randomized' && !ss.pairedAB) return 'Randomize again: the pairs changed.'
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
      // stepError guarantees these are chosen before Send is enabled
      observational: type === 'observational' ? { ...obs, signal: obs.signal!, direction: obs.direction!, min_lag_days: obs.min_lag_days!, max_lag_days: obs.max_lag_days! } : null,
      intervention: type === 'intervention'
        ? { ...iv, arm_a: iv.arm_a.trim(), arm_b: iv.arm_b.trim(), outcome_signal: iv.outcome_signal!, better: iv.better!, period_days: ss.periodDays ?? 1, washout_days: ss.breakDays ?? 0, n_periods: ss.count, schedule, ...({ assignment } as object) }
        : null,
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

  // Live "What this test will do" panel for the Test design step.
  const testDesignAside = () => {
    if (!patient) return null
    const firstName = patient.display_name.replace(/,.*$/, '')
    const range = window_.start && window_.end ? `${formatDateShort(window_.start)} to ${formatDateShort(window_.end)}` : ''
    if (type === 'observational') {
      return (
        <aside className="td-aside">
          <div className="card stack">
            <h3>What this test will do</h3>
            <Fact k="Explains">Episodes ({episodes} logged, at least 5 needed)</Fact>
            <Fact k="Using">{obs.signal ? `${lbl(obs.signal)}${obs.direction ? `, expected to be ${obs.direction}` : ''}` : <span className="muted">Not chosen yet</span>}</Fact>
            <Fact k="Looks back">{obs.min_lag_days == null || obs.max_lag_days == null ? <span className="muted">Not chosen yet</span> : <>{lagRange(obs.min_lag_days, obs.max_lag_days)} before each episode{obs.max_lag_days > obs.min_lag_days ? ', each window tested and corrected for' : ''}</>}</Fact>
            <Fact k="Chance check">The same comparison on 2,000 random shifts of {firstName}'s episode dates</Fact>
            <Fact k="Shared with you">{obs.signal ? `${lbl(obs.signal)} and the episode log` : 'The episode log'}, {range ? `${range} only` : 'for the dates you choose'}</Fact>
          </div>
        </aside>
      )
    }
    const st = ss.count >= 2 ? strengthFor(ss.count - (ss.count % 2)) : null
    const total = ss.count ? daysBetween(stints.reduce((a, x) => (x.start < a ? x.start : a), stints[0].start), stints.reduce((a, x) => (x.end > a ? x.end : a), stints[0].end)) + 1 : null
    const notYet = <span className="muted">Not placed yet</span>
    return (
      <aside className="td-aside">
        <div className="card stack">
          <h3>What this test will do</h3>
          <Fact k="Question">{iv.outcome_signal && iv.better ? `Does ${iv.arm_b.trim() || 'the change'} ${iv.better === 'higher' ? 'improve' : 'lower'} ${SIGNAL_INFO[iv.outcome_signal].plain}?` : <span className="muted">Choose an outcome and a change</span>}</Fact>
          <Fact k="Runs">{total != null ? `${total} days${range ? ` · ${range}` : ''}` : notYet}</Fact>
          <Fact k="Patient does">{ss.count ? `${ss.nA} periods of A and ${ss.nB} of B${ss.periodDays ? ` (mostly ${ss.periodDays} days)` : ''}${ss.nBreaks ? `, with ${ss.nBreaks} break${ss.nBreaks > 1 ? 's' : ''}` : ''}; usual routine on other days` : notYet}</Fact>
          <Fact k="Counted">{total != null ? `${ss.countedDays} days.${total > ss.countedDays ? ` The ${total - ss.countedDays} break days are left out.` : ''}` : notYet}</Fact>
          <Fact k="Order">{assignment === 'randomized' ? 'Randomized: a coin flip per pair' : 'Set by hand. Results will be marked as not randomized.'}</Fact>
          <Fact k="Shared with you">{iv.outcome_signal ? `${lbl(iv.outcome_signal)} only, for these dates only` : <span className="muted">Only the outcome you choose</span>}</Fact>
          <div className="td-fact td-sep">
            <span>Evidence strength</span>
            {st ? <>
              <StrengthMeter bars={st.bars} tone={st.tone} />
              <div>{st.tone === 'bad' ? 'Too short to give a clear answer. Use at least 10 periods.' : st.bars >= 3 ? 'Long enough to give a clear answer either way.' : 'Just long enough; a small effect may be missed.'}</div>
              <small className="muted">Smallest possible p-value: {st.minP < 0.001 ? st.minP.toFixed(4) : st.minP.toFixed(3)}</small>
            </> : <div className="muted">Depends on how many periods you place</div>}
          </div>
        </div>
        {schedule.length > 0 && (
          <div className="card stack">
            <span className="td-slot-label">What the patient sees each day</span>
            <PatientDayPreview schedule={schedule} armA={iv.arm_a.trim() || 'Option A'} armB={iv.arm_b.trim() || 'Option B'} />
          </div>
        )}
      </aside>
    )
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

      <div className={step === 3 ? 'td-wrap' : undefined}>
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
            <h2>What can this patient's devices measure?</h2>
            <p className="muted">Nothing is pre-selected. Tick signals to shortlist them, or just pick what to measure on the next step. The patient's approval covers <strong>only</strong> the signals the test actually uses.</p>
            <SignalPicker signals={ALL_SIGNALS} available={available} noData={noData} selected={signals} onToggle={toggleSignal}
              sourcesFor={(s) => catalog.filter((d) => devices.includes(d.id) && d.signals.includes(s)).map((d) => d.name)} />
          </>
        )}

        {step === 3 && patient && (() => {
          const firstName = patient?.display_name.replace(/,.*$/, '') ?? 'the patient'
          const lagText = obs.min_lag_days == null || obs.max_lag_days == null ? 'the days' : obs.max_lag_days === 1 ? 'the day' : `the ${lagRange(obs.min_lag_days, obs.max_lag_days)}`
          const winDays = window_.start && window_.end ? daysBetween(window_.start, window_.end) + 1 : 0
          const toggle = (n: number) => setOpenSlot(openSlot === n ? null : n)
          const sourceOf = (s: SignalId) => catalog.filter((d) => devices.includes(d.id) && d.signals.includes(s)).map((d) => d.name).join(', ')
          // Every signal this patient's selected devices record (and that has data). Others are listed, grayed, with why.
          const offSignals = SENSOR_SIGNALS.filter((s) => !available.has(s))
          const signalChoices = (value: SignalId | null, onPick: (s: SignalId) => void) => (
            <>
              <div className="td-tray-row">
                {designSignals.map((s) => (
                  <button key={s} type="button" className={`td-chip ${value === s ? 'on' : ''}`} aria-pressed={value === s} onClick={() => { useSignal(s); onPick(s) }}>
                    <strong>{SIGNAL_INFO[s].label}</strong>
                    <span>{sourceOf(s)}</span>
                  </button>
                ))}
              </div>
              {offSignals.length > 0 && (
                <div className="off-row" aria-label="Not available for this patient">
                  {offSignals.map((s) => (
                    <span key={s} className="td-off" title={noData.has(s) ? 'A selected device tracks this, but there is no data from this patient yet.' : 'The patient needs a device that collects this data.'}>
                      {SIGNAL_INFO[s].label}<em>{noData.has(s) ? 'no data yet' : 'needs a device'}</em>
                    </span>
                  ))}
                </div>
              )}
            </>
          )
          const dirSeg = (value: Direction | null, onPick: (d: Direction) => void, opts: Direction[]) => (
            <div className="seg">{opts.map((d) => <button key={d} type="button" className={value === d ? 'active' : ''} onClick={() => onPick(d)}>{d}</button>)}</div>
          )
          return (
            <div className="td-main">
              <div className="seg td-type" role="radiogroup" aria-label="Test type">
                <button type="button" role="radio" aria-checked={type === 'observational'} className={type === 'observational' ? 'active' : ''} disabled={obsBlocked}
                  title={obsBlocked ? 'No episodes logged, so use an A/B test' : undefined} onClick={() => setType('observational')}>Look for a pattern</button>
                <button type="button" role="radio" aria-checked={type === 'intervention'} className={type === 'intervention' ? 'active' : ''} onClick={() => setType('intervention')}>Try a change (A/B trial)</button>
              </div>
              {obsBlocked && <div className="alert alert-info"><Icon name="info" /><span>{patient.display_name} has no episodes logged, so a pattern test isn't possible. Try a change (A/B trial) instead.</span></div>}
              {!obsBlocked && type === 'observational' && episodes < 5 && (
                <div className="alert alert-warn"><Icon name="info" /><span>Only {episodes} episode{episodes === 1 ? '' : 's'} logged. With fewer than 5, expect “not enough data”.</span></div>
              )}

              <section className="td-section">
                <h3 className="td-h">Your test</h3>

                {type === 'observational' ? (
                  <>
                    <div className="td-slots">
                      <Slot n={1} label="What you want to explain" value="Episodes" sub={`${episodes} logged by ${firstName}`} open={openSlot === 1} onOpen={() => toggle(1)} />
                      <Slot n={2} label="What might come first" empty={!obsReady}
                        value={obs.signal ? `${lbl(obs.signal)}${obs.direction ? `, ${obs.direction}` : ''}` : 'Choose a signal'}
                        sub={!obs.signal ? `from ${firstName}'s devices` : obs.direction ? 'than on normal days' : 'lower or higher?'} open={openSlot === 2} onOpen={() => toggle(2)} />
                      <Slot n={3} label="How far back" empty={obs.min_lag_days == null || obs.max_lag_days == null}
                        value={obs.min_lag_days == null || obs.max_lag_days == null ? 'Choose days' : lagRange(obs.min_lag_days, obs.max_lag_days)} sub="before each episode" open={openSlot === 3} onOpen={() => toggle(3)} />
                      <Slot n={4} label="Over what dates" empty={!window_.start || !window_.end}
                        value={window_.start && window_.end ? `${formatDateShort(window_.start)} to ${formatDateShort(window_.end)}` : 'Choose dates'}
                        sub={window_.start && window_.end ? `${winDays} days` : `${firstName} has ${patient.n_days} days of data`} open={openSlot === 4} onOpen={() => toggle(4)} />
                    </div>
                    {openSlot === 1 && (
                      <SlotEditor title="Editing 1: what you want to explain" onDone={() => setOpenSlot(null)}>
                        <p className="td-note">Logged episodes are the only outcome a pattern test can explain for now. {firstName} has logged <strong>{episodes}</strong>; at least 5 are needed.</p>
                      </SlotEditor>
                    )}
                    {openSlot === 2 && (
                      <SlotEditor title="Editing 2: what might come first" onDone={() => setOpenSlot(null)}>
                        {signalChoices(obs.signal, (s) => setObs({ ...obs, signal: s }))}
                        <div className="td-inline"><span>Before episodes it is</span>{dirSeg(obs.direction, (d) => setObs({ ...obs, direction: d }), ['lower', 'higher'])}<span>than usual</span></div>
                        <p className="td-note">One signal per test. Grayed signals need a device this patient doesn't have, or data that hasn't arrived yet.</p>
                      </SlotEditor>
                    )}
                    {openSlot === 3 && (
                      <SlotEditor title="Editing 3: how far back to look" onDone={() => setOpenSlot(null)}>
                        <div className="td-inline">
                          <span>Look back between</span>
                          <Stepper label="Shortest look-back" value={obs.min_lag_days} min={1} max={obs.max_lag_days ?? LAG_MAX}
                            onChange={(n) => setObs({ ...obs, min_lag_days: n, max_lag_days: obs.max_lag_days != null && obs.max_lag_days < n ? n : obs.max_lag_days })} />
                          <span>and</span>
                          <Stepper label="Longest look-back" value={obs.max_lag_days} min={obs.min_lag_days ?? 1} max={LAG_MAX}
                            onChange={(n) => setObs({ ...obs, max_lag_days: n, min_lag_days: obs.min_lag_days != null && obs.min_lag_days > n ? n : obs.min_lag_days })} />
                          <span>days before each episode</span>
                        </div>
                        <p className="td-note">Each window from the shortest to the longest is tested (the days right before the episode, up to that length), and the p-value is corrected for testing several. Long windows leave fewer normal days to compare against.</p>
                      </SlotEditor>
                    )}
                    {openSlot === 4 && (
                      <SlotEditor title="Editing 4: over what dates" onDone={() => setOpenSlot(null)}>
                        <div className="td-inline">
                          <span>From</span>
                          <input type="date" aria-label="Plan start" value={window_.start} min={patient.date_range[0]} max={window_.end || patient.date_range[1]}
                            onChange={(e) => e.target.value && setObsWin({ start: e.target.value, end: window_.end })} />
                          <span>to</span>
                          <input type="date" aria-label="Plan end" value={window_.end} min={window_.start || patient.date_range[0]} max={patient.date_range[1]}
                            onChange={(e) => e.target.value && setObsWin({ start: window_.start, end: e.target.value })} />
                          <button type="button" className="button secondary sm" onClick={() => setObsWin({ start: patient.date_range[0], end: patient.date_range[1] })}>Use all {patient.n_days} days</button>
                        </div>
                        <p className="td-note">{firstName}'s data runs {formatDate(patient.date_range[0])} to {formatDate(patient.date_range[1])}. Shorter windows contain fewer episodes.</p>
                      </SlotEditor>
                    )}
                    <p className="td-reads"><strong>Reads as:</strong>{' '}
                      {obsReady
                        ? <>Is {SIGNAL_INFO[obs.signal!].plain} {obs.direction} than usual in {lagText} before {firstName}'s episodes?</>
                        : <span className="muted">Choose a signal and a direction in slot 2 to finish the question.</span>}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="td-slots">
                      <Slot n={1} label="What you want to improve" empty={!iv.outcome_signal || !iv.better}
                        value={iv.outcome_signal ? `${lbl(iv.outcome_signal)}${iv.better ? `, ${iv.better}` : ''}` : 'Choose an outcome'}
                        sub={!iv.outcome_signal ? 'steps, heart rate, sleep…' : iv.better ? 'is better' : 'higher or lower is better?'} open={openSlot === 1} onOpen={() => toggle(1)} />
                      <Slot n={2} label="What you are trying" empty={!iv.arm_b.trim() || !iv.arm_a.trim()}
                        value={iv.arm_b.trim() || 'Name the change'} sub={iv.arm_a.trim() ? `compared with ${iv.arm_a.trim()}` : 'and what it is compared with'} open={openSlot === 2} onOpen={() => toggle(2)} />
                      <Slot n={3} label="When each period runs" empty={ss.count < 10}
                        value={ss.count ? `${ss.count} period${ss.count > 1 ? 's' : ''} painted` : 'Paint on calendar'}
                        sub={ss.count ? `${ss.nA} A · ${ss.nB} B${ss.nBreaks ? ` · ${ss.nBreaks} break${ss.nBreaks > 1 ? 's' : ''}` : ''}` : 'drag across days below'}
                        open={false} onOpen={() => { setOpenSlot(null); setAbView('calendar'); document.getElementById('sc-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
                      <Slot n={4} label="Order" value={assignment === 'randomized' ? 'Randomized' : 'Set by hand'}
                        sub={assignment === 'randomized' ? 'coin flip per pair' : 'marked not randomized'} open={openSlot === 4} onOpen={() => toggle(4)} />
                    </div>
                    {openSlot === 1 && (
                      <SlotEditor title="Editing 1: what you want to improve" onDone={() => setOpenSlot(null)}>
                        {signalChoices(iv.outcome_signal, (s) => setIv({ ...iv, outcome_signal: s }))}
                        <div className="td-inline"><span>Better is</span>{dirSeg(iv.better, (d) => setIv({ ...iv, better: d }), ['higher', 'lower'])}</div>
                      </SlotEditor>
                    )}
                    {openSlot === 2 && (
                      <SlotEditor title="Editing 2: what you are trying" onDone={() => setOpenSlot(null)}>
                        <div className="grid-2">
                          <div className="field"><label htmlFor="b">B · the change (intervention)</label><input id="b" value={iv.arm_b} placeholder="e.g. Walk 15 min after dinner" onChange={(e) => setIv({ ...iv, arm_b: e.target.value })} /></div>
                          <div className="field"><label htmlFor="a">A · compared with (control)</label><input id="a" value={iv.arm_a} placeholder="e.g. No walk" onChange={(e) => setIv({ ...iv, arm_a: e.target.value })} /></div>
                        </div>
                      </SlotEditor>
                    )}
                    {openSlot === 4 && (
                      <SlotEditor title="Editing 4: order" onDone={() => setOpenSlot(null)}>
                        <p className="td-note">You painted which days are A and which are B. A hand-picked order can line up with other changes in the patient's life, so these results will be marked <strong>not randomized</strong>. For the strongest result, let a coin flip decide A or B within each consecutive pair of periods.</p>
                        <div className="td-inline">
                          <button type="button" className="button secondary" disabled={ss.count < 2 || ss.count % 2 === 1 || !!recorded}
                            onClick={() => { setStints(randomizeStints(stints)); setAssignment('randomized') }}>
                            <Icon name="shuffle" size={15} /> {assignment === 'randomized' ? 'Flip again' : 'Randomize for me'}
                          </button>
                          {ss.count % 2 === 1 && <span className="small muted">Randomizing works on pairs: paint an even number of periods.</span>}
                          {recorded && <span className="small muted">Using the recorded order the patient followed.</span>}
                        </div>
                      </SlotEditor>
                    )}
                    <p className="td-reads"><strong>Reads as:</strong>{' '}
                      {ivReady
                        ? <>Does {iv.arm_b.trim()} give {firstName} {iv.outcome_signal === 'sleep_min' ? (iv.better === 'higher' ? 'more sleep' : 'less sleep') : `${iv.better} ${SIGNAL_INFO[iv.outcome_signal!].plain}`} than {iv.arm_a.trim()}{ss.count >= 2 ? `, over ${ss.count} alternating periods` : ''}?</>
                        : <span className="muted">Fill in slots 1 and 2 to finish the question.</span>}
                    </p>
                  </>
                )}
              </section>

              {type === 'observational' ? (
                <section className="td-section">
                  <h3 className="td-h">What gets compared, for one episode</h3>
                  <PatternStrip min={obs.min_lag_days ?? 1} max={obs.max_lag_days ?? 3} episodeLabel="Episode day" />
                  {obs.max_lag_days == null && <p className="td-note">Showing 3 days as an example. Choose how far back in slot 3.</p>}
                  <p className="td-note">Illustration, not {firstName}'s data. Shaded days are compared with normal days; episode days are left out.</p>
                </section>
              ) : (
                <section className="td-section" id="sc-anchor">
                  <div className="row-between">
                    <h3 className="td-h">What the patient will do, and when</h3>
                    <div className="row" style={{ gap: 10 }}>
                      <div className="seg" role="tablist">
                        <button type="button" className={abView === 'calendar' ? 'active' : ''} onClick={() => setAbView('calendar')}>Place on calendar</button>
                        <button type="button" className={abView === 'timeline' ? 'active' : ''} disabled={!schedule.length} title={schedule.length ? undefined : 'Paint some periods first'} onClick={() => setAbView('timeline')}>Timeline</button>
                      </div>
                      {!recorded && (
                        <button type="button" className="button secondary sm" disabled={ss.count < 2 || ss.count % 2 === 1}
                          title="Optional: a coin flip per consecutive pair gives the strongest result"
                          onClick={() => { setStints(randomizeStints(stints)); setAssignment('randomized') }}>
                          <Icon name="shuffle" size={14} /> {assignment === 'randomized' ? 'Flip again' : 'Randomize for me'}
                        </button>
                      )}
                    </div>
                  </div>
                  {recordedPlan && (
                    <div className={`insight ${recorded ? '' : 'warn'}`} style={{ alignItems: 'center' }}>
                      <span><Icon name="calendar" size={17} /></span>
                      <p style={{ flex: 1 }}>
                        <strong>{recorded ? 'Using the schedule this patient followed' : 'This patient already followed a recorded A/B schedule'}</strong>
                        {recorded
                          ? `${recorded.intervention!.arm_a} vs ${recorded.intervention!.arm_b}, ${recorded.intervention!.n_periods} periods from ${formatDate(recorded.window.start)}. Demo data is historical, so the analysis must use the order the patient actually followed. Moving a period undoes this.`
                          : 'Demo data is historical: periods placed by hand would not match the days the patient actually took each option. Use the recorded schedule for an honest result.'}
                      </p>
                      {recorded
                        ? <button className="button ghost sm" onClick={() => { setRecorded(null); setStints([]) }}>Place my own instead</button>
                        : <button className="button primary sm" onClick={() => applyRecorded(recordedPlan)}>Use recorded schedule</button>}
                    </div>
                  )}
                  {abView === 'timeline' && schedule.length
                    ? <ABTimeline schedule={schedule} armA={iv.arm_a.trim() || 'Option A'} armB={iv.arm_b.trim() || 'Option B'} />
                    : <StintCalendar range={{ start: patient.date_range[0], end: patient.date_range[1] }} stints={stints} onChange={setStints}
                        armA={iv.arm_a.trim() || 'Option A'} armB={iv.arm_b.trim() || 'Option B'} assignment={assignment} onAssignment={setAssignment} />}
                  {ss.count > 0 && assignment === 'manual' && !recorded && (
                    <p className="td-note">Order set by hand: results will be marked as <strong>not randomized</strong>. “Randomize for me” gives the strongest result.</p>
                  )}
                </section>
              )}
            </div>
          )
        })()}

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
                      <tr><th>Test</th><td>Observational: is {lbl(obs.signal).toLowerCase()} <strong>{obs.direction}</strong> in the {lagRange(obs.min_lag_days ?? 1, obs.max_lag_days ?? 1)} before episodes?</td></tr>
                    ) : (
                      <tr><th>Test</th><td>A/B trial: {iv.n_periods} periods × {iv.period_days} days, {iv.washout_days}-day washout. Outcome: {lbl(iv.outcome_signal).toLowerCase()} ({iv.better} is better)</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="insight mb">
                  <span><Icon name="shield" size={17} /></span>
                  <p><strong>The plan is the consent</strong>The patient gets a plain-language summary listing exactly these signals and dates. Nothing is shared unless they approve, and they can pause or stop at any time. You don't need to monitor anything: you'll get the verdict when the plan completes.</p>
                </div>
                {type === 'intervention' && <ScheduleTimeline schedule={schedule} armA={iv.arm_a.trim() || 'Option A'} armB={iv.arm_b.trim() || 'Option B'} compact />}
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
      {step === 3 && patient && testDesignAside()}
      </div>
    </div>
  )
}
