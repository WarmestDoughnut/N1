import { useState } from 'react'
import type { Device, Patient, Plan, Results, SignalId } from '../../types'
import { navigate } from '../../lib/hooks'
import { initials } from '../../lib/session'
import { DEVICE_ICON, Icon, SIGNAL_COLOR, SIGNAL_ICON } from '../../components/Icon'
import { StatusChip } from '../../components/Verdict'
import { formatDate, signalLabel, ALL_SIGNALS } from '../../lib/util'
import type { ClinicianData } from './ClinicianApp'
import { PlanDetail } from './PlanDetail'
import { PlanWizard } from './PlanWizard'
import { NotesPanel } from '../../components/NotesPanel'
import { ReviewBox } from '../../components/ReviewBox'
import { useAsync } from '../../lib/hooks'
import { v15, type Symptom } from '../../lib/v15'

export const AVATAR_TONES = ['tone-purple', 'tone-coral', 'tone-yellow', 'tone-green']
export const toneFor = (id: string) => AVATAR_TONES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length]

/** A finished test whose result the clinician hasn't marked reviewed (backend B7 `results.reviewed_at`).
 *  Until that field ships every finished test counts as unreviewed. Keep this the only place that reads it. */
export const isUnreviewed = (r: Results | undefined) => !!r && (r as Results & { reviewed_at?: string | null }).reviewed_at == null

export const isRunning = (p: Plan) => p.status === 'active' || p.status === 'paused'
export const isWaiting = (p: Plan) => p.status === 'pending_approval'

export type WorkspaceTab = 'overview' | 'tests' | 'collection' | 'data' | 'new'
const TABS: { id: WorkspaceTab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'tests', label: 'Tests', icon: 'clipboard' },
  { id: 'collection', label: 'Data collection', icon: 'watch' },
  { id: 'data', label: 'Data & graphs', icon: 'activity' },
  { id: 'new', label: 'New', icon: 'plus' },
]
const asTab = (s?: string): WorkspaceTab => (TABS.some((t) => t.id === s) ? (s as WorkspaceTab) : 'overview')

/** One patient's workspace: #/patients/:id[/:tab[/:sub]]. Everything inside is scoped to this patient. */
export function PatientWorkspace({ patient, data, catalog, tab: rawTab, sub }: {
  patient: Patient; data: ClinicianData; catalog: Device[]; tab?: string; sub?: string
}) {
  const tab = asTab(rawTab)
  const base = `/patients/${encodeURIComponent(patient.id)}`
  const plans = data.plans.filter((p) => p.patient_id === patient.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const conn = data.connections.find((c) => c.patient_id === patient.id && c.status === 'active')
  const unreviewed = plans.filter((p) => isUnreviewed(data.results[p.id])).length

  return (
    <>
      <a className="link-btn" href="#/" style={{ marginBottom: 12, display: 'inline-flex' }}><Icon name="arrowLeft" size={14} /> All patients</a>
      <section className="page-heading" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
          <span className={`avatar lg ${toneFor(patient.id)}`}>{initials(patient.display_name)}</span>
          <div>
            <p className="eyebrow">Patient</p>
            <h1>{patient.display_name}</h1>
            <span className="sub">{patient.condition ?? ''}{patient.condition && conn ? ' · ' : ''}{conn ? `Connected since ${formatDate(conn.created_at)}` : ''}</span>
          </div>
        </div>
      </section>

      <section className="workspace ws-shell">
        <div className="signal-tabs" role="tablist" aria-label={`${patient.display_name} workspace`}>
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'selected' : ''}
              onClick={() => navigate(t.id === 'overview' ? base : `${base}/${t.id}`)}>
              <Icon name={t.icon} size={16} /> {t.label}
              {t.id === 'tests' && plans.length > 0 && <span className="ws-count">{plans.length}</span>}
              {t.id === 'tests' && unreviewed > 0 && <span className="ws-dot" title={`${unreviewed} unreviewed result${unreviewed > 1 ? 's' : ''}`} />}
            </button>
          ))}
        </div>
      </section>

      <div className="ws-body">
        {tab === 'overview' && <OverviewTab patient={patient} plans={plans} data={data} catalog={catalog} base={base} />}
        {tab === 'tests' && (sub
          ? <OpenTest planId={sub} base={base} data={data} />
          : <TestsTab plans={plans} data={data} base={base} />)}
        {tab === 'collection' && <ComingSoon icon="watch" title="Data collection" body="Collection plans for this patient, and the tests run on the data they gather, will appear here." />}
        {tab === 'data' && <ComingSoon icon="activity" title="Data & graphs" body="Charts of this patient's consented signals and logged symptoms will appear here." />}
        {tab === 'new' && (sub === 'test'
          ? <PlanWizard patients={[patient]} />
          : <NewTab patient={patient} base={base} />)}
      </div>
    </>
  )
}

// ---------- Overview tab ----------

function OverviewTab({ patient, plans, data, catalog, base }: { patient: Patient; plans: Plan[]; data: ClinicianData; catalog: Device[]; base: string }) {
  const unreviewed = plans.filter((p) => isUnreviewed(data.results[p.id])).length
  const activity = plans
    .flatMap((p) => p.history.map((h) => ({ ...h, plan: p })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6)
  return (
    <div className="stack">
      <article className="card">
        <div className="results">
          <div><span>Active tests</span><strong>{plans.filter(isRunning).length}</strong><small>{plans.filter((p) => p.status === 'paused').length} paused</small></div>
          <div><span>Awaiting consent</span><strong>{plans.filter(isWaiting).length}</strong><small>patient must approve</small></div>
          <div><span>Unreviewed results</span><strong>{unreviewed}</strong><small>{plans.filter((p) => data.results[p.id]).length} finished</small></div>
          <div><span>Days of data</span><strong>{patient.n_days}</strong><small>{formatDate(patient.date_range[0])} – {formatDate(patient.date_range[1])}</small></div>
        </div>
      </article>

      <section className="bottom-grid">
        <article className="card">
          <div className="card-title"><h3>Devices and signals</h3></div>
          <PatientSources patient={patient} catalog={catalog} />
        </article>
        <article className="card">
          <div className="card-title"><h3>Conditions and symptoms</h3></div>
          <SymptomChips patient={patient} />
          <p className="muted small" style={{ margin: '12px 0 0' }}>{patient.n_episodes} episode{patient.n_episodes === 1 ? '' : 's'} logged</p>
        </article>
      </section>

      <article className="card">
        <div className="card-title">
          <h3>Recent activity</h3>
          <a className="link-btn" href={`#${base}/tests`} style={{ whiteSpace: 'nowrap' }}>All tests <Icon name="chevron" size={14} /></a>
        </div>
        {activity.length === 0
          ? <div className="muted small">Nothing yet.</div>
          : activity.map((a, i) => (
            <button key={i} className="ws-activity" onClick={() => navigate(`${base}/tests/${encodeURIComponent(a.plan.id)}`)}>
              <span className="muted small">{formatDate(a.at)}</span>
              <span><b style={{ textTransform: 'capitalize' }}>{a.event.replace(/_/g, ' ')}</b> · {a.plan.title}</span>
              <Icon name="chevron" size={14} />
            </button>
          ))}
      </article>
    </div>
  )
}

/** The patient's symptoms / conditions / events (backend B1), falling back to the profile's condition. */
function SymptomChips({ patient }: { patient: Patient }) {
  const q = useAsync<Symptom[]>(() => v15.symptoms(patient.id).catch(() => [] as Symptom[]), [patient.id])
  const names = [...new Set([...(patient.condition ? [patient.condition] : []), ...(q.data ?? []).map((s) => s.name)])]
  return (
    <div className="pd-chips">
      {names.length ? names.map((n) => <span key={n} className="chip"><Icon name="heart" size={13} />{n}</span>) : <span className="muted small">None recorded.</span>}
    </div>
  )
}

// ---------- Tests tab ----------

const testSignal = (p: Plan) => p.observational?.signal ?? p.intervention?.outcome_signal ?? p.signals[0]
function testWhat(p: Plan): string {
  if (p.intervention) return `${p.intervention.arm_b} vs ${p.intervention.arm_a} · ${signalLabel(p.intervention.outcome_signal)}`
  if (p.observational) return `${signalLabel(p.observational.signal)} before episodes`
  return p.signals.map(signalLabel).join(', ')
}

function TestsTab({ plans, data, base }: { plans: Plan[]; data: ClinicianData; base: string }) {
  if (plans.length === 0) {
    return (
      <section className="workspace">
        <div className="empty">
          <div className="summary-icon tone-purple"><Icon name="clipboard" /></div>
          <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>No tests yet.</strong></p>
          <button className="button primary" onClick={() => navigate(`${base}/new`)}><Icon name="plus" /> New</button>
        </div>
      </section>
    )
  }
  return (
    <section className="workspace">
      {plans.map((p) => {
        const signal = testSignal(p)
        const r = data.results[p.id]
        return (
          <button key={p.id} className="test-row ws-test" onClick={() => navigate(`${base}/tests/${encodeURIComponent(p.id)}`)}>
            <span className="test-ic" style={{ color: SIGNAL_COLOR[signal] }}><Icon name={SIGNAL_ICON[signal] ?? 'activity'} size={17} /></span>
            <span className="test-main">
              <strong>{p.title}</strong>
              <small>{p.type === 'observational' ? 'Observational' : 'A/B trial'} · {testWhat(p)} · {formatDate(p.window.start)} – {formatDate(p.window.end)}</small>
            </span>
            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              {isUnreviewed(r) && <span className="pill pill-coral">Unreviewed result</span>}
              <StatusChip status={p.status} />
            </span>
            <span className={`test-go ${r ? 'has' : ''}`}>{r ? 'Open result' : 'Open'} <Icon name="chevron" size={14} /></span>
          </button>
        )
      })}
    </section>
  )
}

/** One test opened inside the workspace: status, consent summary and the in-depth result (PlanDetail renders all three). */
function OpenTest({ planId, base, data }: { planId: string; base: string; data: ClinicianData }) {
  return (
    <>
      <a className="link-btn" href={`#${base}/tests`} style={{ marginBottom: 14, display: 'inline-flex' }}><Icon name="arrowLeft" size={14} /> All tests for this patient</a>
      <PlanDetail planId={planId} data={data} />
      <div className="bottom-grid mt">
        <NotesPanel planId={planId} role="clinician" />
        {data.results[planId] ? <ReviewBox key={planId} planId={planId} results={data.results[planId]} /> : <span />}
      </div>
    </>
  )
}

// ---------- New tab ----------

function NewTab({ patient, base }: { patient: Patient; base: string }) {
  return (
    <section className="ws-new">
      <button className="ws-new-card" onClick={() => navigate(`${base}/new/test?patient=${encodeURIComponent(patient.id)}`)}>
        <span className="summary-icon tone-purple"><Icon name="flask" /></span>
        <strong>New test</strong>
        <small>Check a pattern before episodes, or compare two options (A/B).</small>
      </button>
      <button className="ws-new-card" disabled title="Coming soon">
        <span className="summary-icon tone-green"><Icon name="watch" /></span>
        <strong>New data collection</strong>
        <small>Gather signals now and decide on a test later. Coming soon.</small>
      </button>
    </section>
  )
}

function ComingSoon({ icon, title, body }: { icon: Parameters<typeof Icon>[0]['name']; title: string; body: string }) {
  return (
    <section className="workspace">
      <div className="empty">
        <div className="summary-icon tone-gray"><Icon name={icon} /></div>
        <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>{title}</strong></p>
        <p>{body}</p>
      </div>
    </section>
  )
}

/** Compact devices + signals: what can be tested now; what can't is one click away. */
function PatientSources({ patient, catalog }: { patient: Patient; catalog: Device[] }) {
  const [showOff, setShowOff] = useState(false)
  const tracked = (s: SignalId) => catalog.some((c) => patient.devices.includes(c.id) && c.signals.includes(s))
  const hasData = (s: SignalId) => !patient.signals_present || patient.signals_present.includes(s)
  const ok = ALL_SIGNALS.filter((s) => s === 'episode' || (tracked(s) && hasData(s)))
  const off = ALL_SIGNALS.filter((s) => !ok.includes(s))
  return (
    <div className="pd-sources">
      <div className="pd-row">
        <span className="pd-k">Devices</span>
        <div className="pd-chips">
          {patient.devices.map((d) => {
            const dev = catalog.find((c) => c.id === d)
            return (
              <span key={d} className="chip" title={dev ? `Tracks: ${dev.signals.map(signalLabel).join(', ')}` : undefined}>
                <Icon name={DEVICE_ICON[d] ?? 'watch'} size={13} />{dev?.name ?? d}
              </span>
            )
          })}
        </div>
      </div>
      <div className="pd-row">
        <span className="pd-k">Testable</span>
        <div className="pd-chips">
          {ok.map((s) => (
            <span key={s} className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
              <Icon name={SIGNAL_ICON[s] ?? 'activity'} size={13} />{signalLabel(s)}
            </span>
          ))}
        </div>
      </div>
      {off.length > 0 && (
        <div className="pd-row">
          <span className="pd-k" />
          <div>
            <button type="button" className="disclosure" onClick={() => setShowOff(!showOff)} aria-expanded={showOff}>
              <span style={{ transform: showOff ? 'rotate(90deg)' : undefined, display: 'inline-flex' }}><Icon name="chevron" size={14} /></span>
              Not testable <span className="muted">({off.length})</span>
            </button>
            {showOff && (
              <div className="pd-chips">
                {off.map((s) => <span key={s} className="td-off">{signalLabel(s)}<em>{tracked(s) ? 'no data yet' : 'needs a device'}</em></span>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
