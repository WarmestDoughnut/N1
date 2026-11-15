import { useMemo, useState } from 'react'
import type { Patient, Plan, PlanStatus } from '../../types'
import { navigate } from '../../lib/hooks'
import { firstName, initials, type Session } from '../../lib/session'
import { Icon, SIGNAL_COLOR, SIGNAL_ICON } from '../../components/Icon'
import { StatusChip } from '../../components/Verdict'
import { formatDate, signalLabel } from '../../lib/util'
import type { ClinicianData } from './ClinicianApp'
import { RequestRow } from '../../components/Connections'

export const AVATAR_TONES = ['tone-purple', 'tone-coral', 'tone-yellow', 'tone-green']
export const toneFor = (id: string) => AVATAR_TONES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Overview({ session, data }: { session: Session; data: ClinicianData }) {
  const { plans, patients, results } = data
  const byNewest = [...plans].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const finished = byNewest.filter((p) => results[p.id])
  const active = plans.filter((p) => p.status === 'active' || p.status === 'paused')
  const pending = plans.filter((p) => p.status === 'pending_approval')
  const name = (id: string) => patients.find((p) => p.id === id)?.display_name ?? id
  const attention = byNewest.filter((p) => p.status === 'pending_approval' || p.status === 'active' || p.status === 'paused').slice(0, 5)

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Clinician workspace</p>
          <h1>{greeting()}, {session.name}</h1>
        </div>
        <div className="heading-actions">
          <a className="button primary" href="#/new"><Icon name="plus" /> New test plan</a>
        </div>
      </section>

      <section className="summary-grid four" aria-label="Summary">
        <SummaryButton icon="people" tone="tone-purple" k="Connected patients" v={patients.length}
          s={data.requests.length ? <><b style={{ color: 'var(--yellow)' }}>{data.requests.length}</b> new request{data.requests.length > 1 ? 's' : ''}</> : <><b>{patients.filter((p) => (p.source === 'real' || p.source === 'pmdata')).length}</b> with real-world data</>} href={data.requests.length ? '#/connections' : '#/patients'} />
        <SummaryButton icon="activity" tone="tone-green" k="Active tests" v={active.length} s={<>{active.filter((p) => p.status === 'paused').length} paused by patient</>} href="#/plans" />
        <SummaryButton icon="bell" tone="tone-yellow" k="Awaiting approval" v={pending.length} s={<>patient must consent first</>} href="#/plans" />
        <SummaryButton icon="sparkles" tone="tone-coral" k="Results ready" v={finished.length} s={<>open in-depth results</>} href="#/results" />
      </section>

      <section className="overview-grid">
        <TestsSummary data={data} />

        <article className="card">
          <div className="card-title">
            <h3>Needs attention</h3>
            <a className="link-btn" href="#/plans" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>View all <Icon name="chevron" size={14} /></a>
          </div>
          {data.requests.map((c) => <RequestRow key={c.id} conn={c} />)}
          {attention.length === 0 && data.requests.length === 0 && <div className="muted small" style={{ padding: '8px 0' }}>Nothing waiting.</div>}
          {attention.map((p) => <PlanRow key={p.id} plan={p} patientName={name(p.patient_id)} />)}
        </article>
      </section>
    </>
  )
}

// ======================= tests summary =======================
// What was run, per patient. No verdicts here: a finished test opens the Results page.

type StatusFilter = '' | 'pending' | 'running' | 'finished' | 'declined'
type SortKey = 'name-asc' | 'name-desc' | 'recent' | 'count'
const STATUS_MATCH: Record<Exclude<StatusFilter, ''>, (s: PlanStatus) => boolean> = {
  pending: (s) => s === 'pending_approval',
  running: (s) => s === 'active' || s === 'paused',
  finished: (s) => s === 'complete' || s === 'stopped',
  declined: (s) => s === 'declined',
}
const isFinished = (p: Plan) => p.status === 'complete' || p.status === 'stopped'
const GROUPS_PER_PAGE = 8
/** With this many tests or fewer on screen, every patient starts expanded. */
const AUTO_EXPAND_MAX = 12

/** The one signal a test is about. */
const testSignal = (p: Plan) => p.observational?.signal ?? p.intervention?.outcome_signal ?? p.signals[0]

/** One line saying what the test does, e.g. "Sleep before episodes" or "Melatonin 3 mg vs No melatonin". */
function testWhat(p: Plan): string {
  if (p.intervention) return `${p.intervention.arm_b} vs ${p.intervention.arm_a} · ${signalLabel(p.intervention.outcome_signal)}`
  if (p.observational) return `${signalLabel(p.observational.signal)} before episodes`
  return p.signals.map(signalLabel).join(', ')
}

function TestsSummary({ data }: { data: ClinicianData }) {
  const { plans, patients } = data
  const [q, setQ] = useState('')
  const [patientId, setPatientId] = useState('')
  const [type, setType] = useState<'' | Plan['type']>('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [sort, setSort] = useState<SortKey>('name-asc')
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({})
  const [shown, setShown] = useState(GROUPS_PER_PAGE)

  const patientOf = useMemo(() => new Map(patients.map((p) => [p.id, p] as const)), [patients])
  const cleanName = (id: string) => (patientOf.get(id)?.display_name ?? id)

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase()
    const rows = plans.filter((p) =>
      (!patientId || p.patient_id === patientId) &&
      (!type || p.type === type) &&
      (!status || STATUS_MATCH[status](p.status)) &&
      (!t || `${cleanName(p.patient_id)} ${p.title} ${testWhat(p)} ${p.id}`.toLowerCase().includes(t)))
    const by = new Map<string, Plan[]>()
    for (const p of rows) by.set(p.patient_id, [...(by.get(p.patient_id) ?? []), p])
    const out = [...by.entries()].map(([id, tests]) => ({
      id, patient: patientOf.get(id) as Patient | undefined, name: cleanName(id),
      tests: tests.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }))
    const latest = (g: { tests: Plan[] }) => g.tests[0]?.created_at ?? ''
    out.sort((a, b) =>
      sort === 'name-desc' ? b.name.localeCompare(a.name)
        : sort === 'recent' ? latest(b).localeCompare(latest(a)) || a.name.localeCompare(b.name)
          : sort === 'count' ? b.tests.length - a.tests.length || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, patientOf, q, patientId, type, status, sort])

  const nTests = groups.reduce((n, g) => n + g.tests.length, 0)
  const filtered = !!(q.trim() || patientId || type || status)
  const defaultOpen = filtered || nTests <= AUTO_EXPAND_MAX
  const isOpen = (id: string) => openOverride[id] ?? defaultOpen
  const visible = groups.slice(0, shown)
  const allOpen = visible.length > 0 && visible.every((g) => isOpen(g.id))
  const setAll = (open: boolean) => setOpenOverride(Object.fromEntries(groups.map((g) => [g.id, open])))
  const clear = () => { setQ(''); setPatientId(''); setType(''); setStatus(''); setOpenOverride({}) }
  // A filter change returns every group to its default (expanded while filtering).
  const onFilter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setOpenOverride({}); setShown(GROUPS_PER_PAGE) }

  return (
    <section className="workspace tests-panel">
      <div className="workspace-head">
        <div>
          <h2>Tests</h2>
          <p>{nTests} test{nTests === 1 ? '' : 's'} · {groups.length} patient{groups.length === 1 ? '' : 's'}{filtered ? ` (of ${plans.length})` : ''}</p>
        </div>
        <label className="tests-search">
          <Icon name="search" size={16} />
          <input aria-label="Search tests" placeholder="Search patient or test…" value={q} onChange={(e) => onFilter(setQ)(e.target.value)} />
        </label>
      </div>
      <div className="tests-filters">
        <select aria-label="Patient" value={patientId} onChange={(e) => onFilter(setPatientId)(e.target.value)}>
          <option value="">All patients</option>
          {[...patients].sort((a, b) => a.display_name.localeCompare(b.display_name)).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <select aria-label="Test type" value={type} onChange={(e) => onFilter(setType)(e.target.value as '' | Plan['type'])}>
          <option value="">All test types</option>
          <option value="observational">Observational</option>
          <option value="intervention">A/B trial</option>
        </select>
        <select aria-label="Status" value={status} onChange={(e) => onFilter(setStatus)(e.target.value as StatusFilter)}>
          <option value="">Any status</option>
          <option value="pending">Awaiting patient</option>
          <option value="running">In progress</option>
          <option value="finished">Finished</option>
          <option value="declined">Declined</option>
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="name-asc">Sort: patient A–Z</option>
          <option value="name-desc">Sort: patient Z–A</option>
          <option value="recent">Sort: newest test</option>
          <option value="count">Sort: most tests</option>
        </select>
        <span className="grow" />
        {filtered && <button className="link-btn" onClick={clear}>Clear filters</button>}
        {groups.length > 0 && <button className="link-btn" onClick={() => setAll(!allOpen)}>{allOpen ? 'Collapse all' : 'Expand all'}</button>}
      </div>

      {data.loading ? <div className="spinner" style={{ padding: 22 }}>Loading tests…</div>
        : plans.length === 0 ? (
          <div className="empty tests-empty">
            <div className="summary-icon tone-purple"><Icon name="clipboard" /></div>
            <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>No tests yet.</strong></p>
            <a className="button primary" href="#/new"><Icon name="plus" /> New test plan</a>
          </div>
        ) : groups.length === 0 ? (
          <div className="empty tests-empty">
            <p>No tests match these filters.</p>
            <button className="button secondary sm" onClick={clear}>Clear filters</button>
          </div>
        ) : (
          <div className="tests-groups">
            {visible.map((g) => {
              const open = isOpen(g.id)
              const done = g.tests.filter(isFinished).length
              const running = g.tests.filter((p) => p.status === 'active' || p.status === 'paused').length
              const waiting = g.tests.filter((p) => p.status === 'pending_approval').length
              return (
                <div key={g.id} className={`tests-group ${open ? 'open' : ''}`}>
                  <button className="tests-group-head" aria-expanded={open} onClick={() => setOpenOverride((o) => ({ ...o, [g.id]: !open }))}>
                    <span className="tests-caret"><Icon name="chevron" size={15} /></span>
                    <span className={`mini-avatar ${toneFor(g.id)}`}>{initials(g.name)}</span>
                    <span className="tests-who">
                      <strong>{g.name}</strong>
                      {g.patient?.condition && <small>{g.patient.condition}</small>}
                    </span>
                    <span className="tests-counts">
                      <b>{g.tests.length}</b> test{g.tests.length === 1 ? '' : 's'}
                      {done > 0 && <> · {done} finished</>}
                      {running > 0 && <> · {running} in progress</>}
                      {waiting > 0 && <> · {waiting} awaiting patient</>}
                    </span>
                  </button>
                  {open && (
                    <div className="tests-rows">
                      {g.tests.map((p) => <TestRow key={p.id} plan={p} hasResults={!!data.results[p.id]} />)}
                    </div>
                  )}
                </div>
              )
            })}
            {groups.length > shown && (
              <button className="tests-more" onClick={() => setShown((n) => n + GROUPS_PER_PAGE)}>
                Show {Math.min(GROUPS_PER_PAGE, groups.length - shown)} more patient{groups.length - shown === 1 ? '' : 's'} <span className="muted">({groups.length - shown} hidden)</span>
              </button>
            )}
          </div>
        )}
    </section>
  )
}

function TestRow({ plan, hasResults }: { plan: Plan; hasResults: boolean }) {
  const signal = testSignal(plan)
  const href = hasResults ? `/results/${encodeURIComponent(plan.id)}` : `/plans/${encodeURIComponent(plan.id)}`
  return (
    <button className="test-row" onClick={() => navigate(href)} title={hasResults ? 'Open the full result' : 'Open the plan'}>
      <span className="test-ic" style={{ color: SIGNAL_COLOR[signal] }}><Icon name={SIGNAL_ICON[signal] ?? 'activity'} size={17} /></span>
      <span className="test-main">
        <strong>{plan.title}</strong>
        <small>{plan.type === 'observational' ? 'Observational' : 'A/B trial'} · {testWhat(plan)} · {formatDate(plan.window.start)} – {formatDate(plan.window.end)}</small>
      </span>
      <StatusChip status={plan.status} />
      <span className={`test-go ${hasResults ? 'has' : ''}`}>{hasResults ? 'View results' : 'Open plan'} <Icon name="chevron" size={14} /></span>
    </button>
  )
}

export function PlanRow({ plan, patientName }: { plan: Plan; patientName: string }) {
  return (
    <button className="patient-row" onClick={() => navigate(`/plans/${plan.id}`)}>
      <span className={`mini-avatar ${toneFor(plan.patient_id)}`}>{initials(patientName)}</span>
      <span>
        <strong>{plan.title}</strong>
        <small>{firstName(patientName)} · {plan.type === 'observational' ? 'Observational' : 'A/B trial'}</small>
      </span>
      <StatusChip status={plan.status} />
      <Icon name="chevron" size={15} />
    </button>
  )
}

function SummaryButton({ icon, tone, k, v, s, href }: { icon: Parameters<typeof Icon>[0]['name']; tone: string; k: string; v: number; s: React.ReactNode; href: string }) {
  return (
    <button className="summary-card" onClick={() => navigate(href.replace(/^#/, ''))}>
      <div className={`summary-icon ${tone}`}><Icon name={icon} /></div>
      <div style={{ minWidth: 0 }}>
        <span className="k">{k}</span>
        <div className="v"><strong>{v}</strong></div>
        <small>{s}</small>
      </div>
    </button>
  )
}

