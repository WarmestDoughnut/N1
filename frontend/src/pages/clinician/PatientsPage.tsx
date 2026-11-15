import { api } from '../../api'
import type { Device } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import { initials } from '../../lib/session'
import { DEVICE_ICON, Icon, SIGNAL_ICON } from '../../components/Icon'
import { formatDate, signalLabel, ALL_SIGNALS } from '../../lib/util'
import type { ClinicianData } from './ClinicianApp'
import { PlanRow, toneFor } from './Overview'

export function PatientsPage({ data, selectedId }: { data: ClinicianData; selectedId?: string }) {
  const devicesQ = useAsync<Device[]>(() => api.devices(), [])
  const { patients, plans } = data
  const sel = patients.find((p) => p.id === selectedId) ?? patients[0]
  const catalog = devicesQ.data ?? []

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Patients</p>
          <h1>Your patients</h1>
          <span className="sub">Each patient's own devices decide which signals a test can use.</span>
        </div>
        {sel && <a className="button primary" href={`#/new?patient=${sel.id}`}><Icon name="plus" /> New plan for {sel.display_name.replace(/\s*\(.*\)$/, '')}</a>}
      </section>

      <section className="bottom-grid" style={{ gridTemplateColumns: 'minmax(280px, 0.8fr) minmax(0, 1.6fr)' }}>
        <article className="card">
          <div className="card-title"><div><h3>All patients</h3><p>{patients.length} people</p></div></div>
          {patients.map((p) => {
            const n = plans.filter((x) => x.patient_id === p.id).length
            return (
              <button key={p.id} className="patient-row" onClick={() => navigate(`/patients/${p.id}`)}
                style={sel?.id === p.id ? { background: 'var(--accent-soft-2)', borderRadius: 10 } : undefined}>
                <span className={`mini-avatar ${toneFor(p.id)}`}>{initials(p.display_name)}</span>
                <span>
                  <strong>{p.display_name}</strong>
                  <small>{p.id} · {n} plan{n === 1 ? '' : 's'}</small>
                </span>
                <span className={`pill no-dot ${p.source === 'pmdata' ? 'pill-green' : 'pill-gray'}`}>{p.source === 'pmdata' ? 'Real data' : 'Synthetic'}</span>
                <Icon name="chevron" size={15} />
              </button>
            )
          })}
        </article>

        {sel && (
          <div className="stack">
            <article className="card">
              <div className="row" style={{ gap: 14, marginBottom: 16 }}>
                <span className={`avatar lg ${toneFor(sel.id)}`}>{initials(sel.display_name)}</span>
                <div>
                  <h2>{sel.display_name}</h2>
                  <span className="muted small">{sel.id} · {sel.source === 'pmdata' ? 'PMData participant (Fitbit Versa 2)' : 'Synthetic patient with known ground truth'}</span>
                </div>
              </div>
              <div className="results">
                <div><span>Data window</span><strong style={{ fontSize: 15 }}>{formatDate(sel.date_range[0])}</strong><small>to {formatDate(sel.date_range[1])}</small></div>
                <div><span>Days of data</span><strong>{sel.n_days}</strong><small>daily rows</small></div>
                <div><span>Episodes logged</span><strong>{sel.n_episodes}</strong><small>{sel.n_episodes >= 5 ? 'enough to test' : 'fewer than 5'}</small></div>
              </div>
              <div className="grid-2 mt">
                <div>
                  <div className="chart-title">Devices</div>
                  <div className="chart-sub">What the patient already owns</div>
                  <div className="stack" style={{ marginTop: 8 }}>
                    {sel.devices.map((d) => {
                      const dev = catalog.find((c) => c.id === d)
                      return (
                        <div key={d} className="row" style={{ gap: 10 }}>
                          <span className="summary-icon tone-purple" style={{ width: 36, height: 36, margin: 0 }}><Icon name={DEVICE_ICON[d] ?? 'watch'} size={17} /></span>
                          <div><strong>{dev?.name ?? d}</strong><div className="muted small">{dev?.signals.map(signalLabel).join(', ')}</div></div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <div className="chart-title">Testable signals</div>
                  <div className="chart-sub">From the patient's devices + app episode log</div>
                  <div className="row" style={{ marginTop: 8 }}>
                    {ALL_SIGNALS.map((s) => {
                      const ok = s === 'episode' || catalog.some((c) => sel.devices.includes(c.id) && c.signals.includes(s))
                      return (
                        <span key={s} className={`chip ${ok ? '' : ''}`} style={ok ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : { background: '#f8f8fa', color: '#a6a6b0', textDecoration: 'line-through' }}>
                          <Icon name={SIGNAL_ICON[s] ?? 'activity'} size={13} />{signalLabel(s)}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </article>

            <article className="card">
              <div className="card-title">
                <div><h3>Test plans</h3><p>For {sel.display_name}</p></div>
                <a className="link-btn" href={`#/new?patient=${sel.id}`}><Icon name="plus" size={14} /> New</a>
              </div>
              {plans.filter((p) => p.patient_id === sel.id).length === 0
                ? <div className="muted small">No plans yet.</div>
                : plans.filter((p) => p.patient_id === sel.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((p) => <PlanRow key={p.id} plan={p} patientName={sel.display_name} />)}
            </article>
          </div>
        )}
      </section>
    </>
  )
}
