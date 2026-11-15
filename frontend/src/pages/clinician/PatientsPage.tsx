import { useMemo, useState } from 'react'
import { navigate } from '../../lib/hooks'
import { initials, type Session } from '../../lib/session'
import { Icon } from '../../components/Icon'
import { RequestRow } from '../../components/Connections'
import type { ClinicianData } from './ClinicianApp'
import { isCompletedTest, isRunning, isUnreviewed, isWaiting, toneFor } from './PatientWorkspace'

type Focus = '' | 'active' | 'waiting' | 'unreviewed' | 'completed'
type CountKey = 'active' | 'waiting' | 'unreviewed' | 'completed'
type SortKey = 'attention' | 'name-asc' | 'name-desc' | CountKey
const PER_PAGE = 25

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Clinician home (#/ and #/patients): connected patients with per-patient counts. No test plans listed here;
 *  everything about a patient lives in that patient's workspace (#/patients/:id). */
export function PatientsHome({ session, data }: { session: Session; data: ClinicianData }) {
  const { patients, plans, results } = data
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState<Focus>('')
  const [sort, setSort] = useState<SortKey>('attention')
  const [shown, setShown] = useState(PER_PAGE)

  const rows = useMemo(() => patients.map((p) => {
    const mine = plans.filter((x) => x.patient_id === p.id)
    return {
      patient: p,
      active: mine.filter(isRunning).length,
      waiting: mine.filter(isWaiting).length,
      unreviewed: mine.filter((x) => isUnreviewed(results[x.id])).length,
      completed: mine.filter((x) => isCompletedTest(results[x.id])).length,
    }
  }), [patients, plans, results])

  const total = (k: CountKey) => rows.reduce((n, r) => n + r[k], 0)
  const t = q.trim().toLowerCase()
  const visible = rows
    .filter((r) => (!t || `${r.patient.display_name} ${r.patient.condition ?? ''}`.toLowerCase().includes(t)) && (!focus || r[focus] > 0))
    .sort((a, b) =>
      sort === 'name-desc' ? b.patient.display_name.localeCompare(a.patient.display_name)
        : sort === 'active' || sort === 'waiting' || sort === 'unreviewed' || sort === 'completed' ? (b[sort] - a[sort]) || a.patient.display_name.localeCompare(b.patient.display_name)
        : sort === 'attention' ? (b.unreviewed - a.unreviewed) || (b.active - a.active) || (b.waiting - a.waiting) || a.patient.display_name.localeCompare(b.patient.display_name)
          : a.patient.display_name.localeCompare(b.patient.display_name))
  const toggle = (f: Focus) => { setFocus(focus === f ? '' : f); setShown(PER_PAGE) }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Patients</p>
          <h1>{greeting()}, {session.name}</h1>
        </div>
        <a className="button primary" href="#/connections"><Icon name="people" /> Add a patient</a>
      </section>

      <section className="summary-grid five" aria-label="Summary">
        <Stat icon="people" tone="tone-purple" k="Connected patients" v={patients.length} on={false} onClick={() => toggle('')} />
        <Stat icon="activity" tone="tone-green" k="Active tests" v={total('active')} on={focus === 'active'} onClick={() => toggle('active')} />
        <Stat icon="bell" tone="tone-yellow" k="Awaiting consent" v={total('waiting')} on={focus === 'waiting'} onClick={() => toggle('waiting')} />
        <Stat icon="sparkles" tone="tone-coral" k="Unreviewed results" v={total('unreviewed')} on={focus === 'unreviewed'} onClick={() => toggle('unreviewed')} />
        <Stat icon="check" tone="tone-gray" k="Completed tests" v={total('completed')} on={focus === 'completed'} onClick={() => toggle('completed')} />
      </section>

      {data.requests.length > 0 && (
        <article className="card mb">
          <div className="card-title">
            <h3>Connection requests</h3>
            <a className="link-btn" href="#/connections" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Connections <Icon name="chevron" size={14} /></a>
          </div>
          {data.requests.map((c) => <RequestRow key={c.id} conn={c} />)}
        </article>
      )}

      <section className="workspace tests-panel">
        <div className="workspace-head">
          <div>
            <h2>Your patients</h2>
            <p>{visible.length} of {patients.length}{focus ? ` · with ${focus === 'active' ? 'active tests' : focus === 'waiting' ? 'tests awaiting consent' : focus === 'completed' ? 'completed tests' : 'unreviewed results'}` : ''}</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="tests-search">
              <Icon name="search" size={16} />
              <input aria-label="Search patients" placeholder="Search patients…" value={q} onChange={(e) => { setQ(e.target.value); setShown(PER_PAGE) }} />
            </label>
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ minHeight: 40, fontSize: 13.5 }}>
              <option value="attention">Sort: needs attention</option>
              <option value="name-asc">Sort: name A–Z</option>
              <option value="name-desc">Sort: name Z–A</option>
              <option value="active">Sort: most active tests</option>
              <option value="waiting">Sort: most awaiting consent</option>
              <option value="unreviewed">Sort: most unreviewed</option>
              <option value="completed">Sort: most completed</option>
            </select>
          </div>
        </div>
        {data.error && <div className="alert alert-error" style={{ margin: '0 20px 16px' }}>{data.error}</div>}
        {data.loading ? <div className="spinner" style={{ padding: 22 }}>Loading patients…</div>
          : patients.length === 0 ? (
            <div className="empty tests-empty">
              <div className="summary-icon tone-purple"><Icon name="people" /></div>
              <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>No connected patients yet.</strong></p>
              <p>Share your connect code from the Connections page. Patients appear here once you accept their request.</p>
              <a className="button primary" href="#/connections"><Icon name="people" /> Go to Connections</a>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty tests-empty">
              <p>No patients match.</p>
              <button className="button secondary sm" onClick={() => { setQ(''); setFocus('') }}>Clear</button>
            </div>
          ) : (
            <table className="table">
              <thead><tr>
                <SortTh label="Patient" on={sort === 'name-asc' || sort === 'name-desc'} dir={sort === 'name-desc' ? 'desc' : 'asc'} onClick={() => setSort(sort === 'name-asc' ? 'name-desc' : 'name-asc')} />
                <SortTh label="Active tests" on={sort === 'active'} dir="desc" onClick={() => setSort('active')} />
                <SortTh label="Awaiting consent" on={sort === 'waiting'} dir="desc" onClick={() => setSort('waiting')} />
                <SortTh label="Unreviewed results" on={sort === 'unreviewed'} dir="desc" onClick={() => setSort('unreviewed')} />
                <SortTh label="Completed tests" on={sort === 'completed'} dir="desc" onClick={() => setSort('completed')} />
                <th />
              </tr></thead>
              <tbody>
                {visible.slice(0, shown).map(({ patient: p, active, waiting, unreviewed, completed }) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/patients/${encodeURIComponent(p.id)}`)}>
                    <td>
                      <span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                        <span className={`mini-avatar ${toneFor(p.id)}`}>{initials(p.display_name)}</span>
                        <strong>{p.display_name}</strong>
                      </span>
                    </td>
                    <td><Count n={active} tone="pill-purple" /></td>
                    <td><Count n={waiting} tone="pill-yellow" /></td>
                    <td><Count n={unreviewed} tone="pill-coral" /></td>
                    <td><Count n={completed} tone="pill-green" /></td>
                    <td style={{ width: 24, color: '#b3b3bb' }}><Icon name="chevron" size={15} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {visible.length > shown && (
          <button className="tests-more" onClick={() => setShown((n) => n + PER_PAGE)}>Show more <span className="muted">({visible.length - shown} hidden)</span></button>
        )}
      </section>
    </>
  )
}

/** Column header that sorts the table. The arrow shows on the active column only. */
function SortTh({ label, on, dir, onClick }: { label: string; on: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className={`th-sort ${on ? 'on' : ''}`} onClick={onClick} title={`Sort by ${label.toLowerCase()}`}>{label}{on && <span aria-hidden>{dir === 'asc' ? ' ↑' : ' ↓'}</span>}</button>
    </th>
  )
}

const Count = ({ n, tone }: { n: number; tone: string }) =>
  n > 0 ? <span className={`pill no-dot ${tone}`}>{n}</span> : <span className="muted small">0</span>

function Stat({ icon, tone, k, v, on, onClick }: { icon: Parameters<typeof Icon>[0]['name']; tone: string; k: string; v: number; on: boolean; onClick: () => void }) {
  return (
    <button className={`summary-card ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>
      <div className={`summary-icon ${tone}`}><Icon name={icon} /></div>
      <div style={{ minWidth: 0 }}>
        <span className="k">{k}</span>
        <div className="v"><strong>{v}</strong></div>
        <small>{on ? 'showing only these' : k === 'Connected patients' ? 'show all' : 'click to filter'}</small>
      </div>
    </button>
  )
}

export function NotConnected({ id }: { id: string }) {
  return (
    <div className="card empty">
      <div className="summary-icon tone-purple"><Icon name="people" /></div>
      <p style={{ fontSize: 16, color: '#4c4c58' }}><strong>{id} isn't one of your connected patients.</strong></p>
      <p>Patients appear once they add you with your connect code and you accept.</p>
      <span className="row" style={{ justifyContent: 'center' }}>
        <a className="button secondary" href="#/"><Icon name="arrowLeft" /> All patients</a>
        <a className="button primary" href="#/connections"><Icon name="people" /> Connections</a>
      </span>
    </div>
  )
}
