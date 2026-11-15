import { useState } from 'react'
import { api } from '../../api'
import type { Device, Patient, SignalId } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import { initials } from '../../lib/session'
import { DEVICE_ICON, Icon, SIGNAL_ICON } from '../../components/Icon'
import { StatusChip, VerdictBadge } from '../../components/Verdict'
import { formatDate, signalLabel, ALL_SIGNALS } from '../../lib/util'
import type { ClinicianData } from './ClinicianApp'
import { toneFor } from './Overview'

const isReal = (p: Patient) => p.source === 'real' || p.source === 'pmdata'

/** #/patients → list of connected patients; #/patients/:id → that patient's profile + tests.
 *  Connecting / onboarding (connect code, requests, removing) lives on #/connections. */
export function PatientsPage({ data, selectedId }: { data: ClinicianData; selectedId?: string }) {
  const devicesQ = useAsync<Device[]>(() => api.devices(), [])
  const catalog = devicesQ.data ?? []
  if (selectedId) {
    const sel = data.patients.find((p) => p.id === selectedId)
    if (sel) return <PatientDetail patient={sel} data={data} catalog={catalog} />
    if (!data.loading) return <NotConnected id={selectedId} />
  }
  return <PatientList data={data} catalog={catalog} />
}

function PatientList({ data, catalog }: { data: ClinicianData; catalog: Device[] }) {
  const { patients, plans, results } = data
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Patients</p>
          <h1>Your patients</h1>
          <span className="sub">Open a patient to see their devices, past tests and results, or to start a new test plan.</span>
        </div>
        <a className="button secondary" href="#/connections"><Icon name="people" /> Add a patient</a>
      </section>

      <section className="workspace">
        {data.loading ? <div className="spinner" style={{ padding: 22 }}>Loading patients…</div>
          : patients.length === 0 ? (
            <div className="empty">
              <div className="summary-icon tone-purple"><Icon name="people" /></div>
              <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>No connected patients yet.</strong></p>
              <p>Share your connect code from the Connections page. Patients appear here once you accept their request.</p>
              <a className="button primary" href="#/connections"><Icon name="people" /> Go to Connections</a>
            </div>
          ) : (
            <table className="table">
              <thead><tr><th>Patient</th><th>Devices</th><th>Data</th><th>Test plans</th><th>Latest result</th><th /></tr></thead>
              <tbody>
                {patients.map((p) => {
                  const mine = plans.filter((x) => x.patient_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
                  const running = mine.filter((x) => x.status === 'active' || x.status === 'paused' || x.status === 'pending_approval').length
                  const latest = mine.find((x) => results[x.id])
                  return (
                    <tr key={p.id} className="clickable" onClick={() => navigate(`/patients/${p.id}`)}>
                      <td>
                        <span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                          <span className={`mini-avatar ${toneFor(p.id)}`}>{initials(p.display_name)}</span>
                          <span><strong>{p.display_name}</strong><div className="muted small">{p.condition ?? p.id}</div></span>
                        </span>
                      </td>
                      <td className="small">{p.devices.map((d) => catalog.find((c) => c.id === d)?.name ?? d).join(', ')}</td>
                      <td>
                        <span className={`pill no-dot ${isReal(p) ? 'pill-green' : 'pill-gray'}`}>{isReal(p) ? 'Real data' : 'Synthetic'}</span>
                        <div className="muted small" style={{ marginTop: 4 }}>{p.n_days} days · {p.n_episodes} episodes</div>
                      </td>
                      <td>{mine.length}{running > 0 && <span className="muted small"> · {running} in progress</span>}</td>
                      <td>{latest ? <VerdictBadge verdict={results[latest.id].verdict} small /> : <span className="muted small">—</span>}</td>
                      <td style={{ width: 24, color: '#b3b3bb' }}><Icon name="chevron" size={15} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </section>
    </>
  )
}

function PatientDetail({ patient: sel, data, catalog }: { patient: Patient; data: ClinicianData; catalog: Device[] }) {
  const plans = data.plans.filter((p) => p.patient_id === sel.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const conn = data.connections.find((c) => c.patient_id === sel.id && c.status === 'active')
  const first = sel.display_name.replace(/\s*\(.*\)$/, '')
  return (
    <>
      <a className="link-btn" href="#/patients" style={{ marginBottom: 12, display: 'inline-flex' }}><Icon name="arrowLeft" size={14} /> All patients</a>
      <section className="page-heading">
        <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
          <span className={`avatar lg ${toneFor(sel.id)}`}>{initials(sel.display_name)}</span>
          <div>
            <p className="eyebrow">Patient</p>
            <h1>{sel.display_name}</h1>
            <span className="sub">
              {sel.id}{sel.condition ? ` · ${sel.condition}` : ''}{conn ? ` · Connected since ${formatDate(conn.created_at)}` : ''}
            </span>
          </div>
        </div>
        <a className="button primary" href={`#/new?patient=${sel.id}`}><Icon name="plus" /> New plan for {first}</a>
      </section>

      <div className="stack">
        <article className="card">
          <div className="results">
            <div><span>Data window</span><strong style={{ fontSize: 15 }}>{formatDate(sel.date_range[0])}</strong><small>to {formatDate(sel.date_range[1])}</small></div>
            <div><span>Days of data</span><strong>{sel.n_days}</strong><small>daily rows</small></div>
            <div><span>Episodes logged</span><strong>{sel.n_episodes}</strong><small>{sel.n_episodes >= 5 ? 'enough to test' : 'fewer than 5'}</small></div>
            <div><span>Test plans</span><strong>{plans.length}</strong><small>{plans.filter((p) => data.results[p.id]).length} with results</small></div>
          </div>
          <div className="muted small mt">
            {isReal(sel) ? `Real data: ${sel.citation ?? 'PMData (Thambawita et al., MMSys 2020, CC BY-NC 4.0)'}` : 'Synthetic patient with known ground truth'}
          </div>
          <PatientSources patient={sel} catalog={catalog} />
        </article>

        <article className="card">
          <div className="card-title">
            <div><h3>Test plans</h3><p>Open a plan to see its status or results</p></div>
            <a className="link-btn" href={`#/new?patient=${sel.id}`}><Icon name="plus" size={14} /> New</a>
          </div>
          {plans.length === 0
            ? <div className="muted small">No plans yet. Start one to test a hunch on {first}'s own data.</div>
            : plans.map((p) => (
              <button key={p.id} className="patient-row" onClick={() => navigate(`/plans/${p.id}`)}
                style={{ gridTemplateColumns: '38px minmax(0,1fr) auto auto 16px' }}>
                <span className={`mini-avatar ${p.type === 'observational' ? 'tone-purple' : 'tone-yellow'}`}>
                  <Icon name={p.type === 'observational' ? 'activity' : 'shuffle'} size={16} />
                </span>
                <span>
                  <strong>{p.title}</strong>
                  <small>{p.type === 'observational' ? 'Observational' : 'A/B trial'} · {p.id} · created {formatDate(p.created_at)}</small>
                </span>
                <StatusChip status={p.status} />
                {data.results[p.id] ? <VerdictBadge verdict={data.results[p.id].verdict} small /> : <span />}
                <Icon name="chevron" size={15} />
              </button>
            ))}
        </article>
      </div>
    </>
  )
}

function NotConnected({ id }: { id: string }) {
  return (
    <div className="card empty">
      <div className="summary-icon tone-purple"><Icon name="people" /></div>
      <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>{id} isn't one of your connected patients.</strong></p>
      <p>Patients appear once they add you with your connect code and you accept.</p>
      <span className="row" style={{ justifyContent: 'center' }}>
        <a className="button secondary" href="#/patients"><Icon name="arrowLeft" /> All patients</a>
        <a className="button primary" href="#/connections"><Icon name="people" /> Connections</a>
      </span>
    </div>
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
    <div className="pd-sources mt">
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
