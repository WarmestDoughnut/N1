import { useEffect, useState } from 'react'
import { getDataSource, onDataSourceChange, resetMockData, setDataSource, API_URL } from '../api'
import type { Patient, Role } from '../types'

interface Props {
  role: Role
  onRole: (r: Role) => void
  patients: Patient[]
  patientId: string
  onPatient: (id: string) => void
}

export function TopBar({ role, onRole, patients, patientId, onPatient }: Props) {
  const [ds, setDs] = useState(getDataSource())
  useEffect(() => onDataSourceChange(() => setDs(getDataSource())), [])

  return (
    <header className="topbar">
      <a className="brand" href="#/">
        <span className="brand-mark" aria-hidden>N1</span>
        <span className="brand-name">N1 Hub</span>
      </a>

      <div className="role-switch" role="radiogroup" aria-label="View as">
        {(['clinician', 'patient'] as Role[]).map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={role === r}
            className={role === r ? 'active' : ''}
            onClick={() => onRole(r)}
          >
            {r === 'clinician' ? 'Clinician' : 'Patient'}
          </button>
        ))}
      </div>

      {role === 'patient' && (
        <label className="patient-picker">
          <span>Signed in as</span>
          <select value={patientId} onChange={(e) => onPatient(e.target.value)}>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="topbar-spacer" />

      <span className="badge badge-demo" title="Datasets are historical. Plans run instantly over the dataset window.">
        Demo mode
      </span>

      <details className="ds-menu">
        <summary className={`badge ${ds.source === 'live' ? 'badge-live' : 'badge-mock'}`}>
          {ds.source === 'live' ? 'Live API' : ds.fellBack ? 'Offline · sample data' : 'Sample data'}
        </summary>
        <div className="ds-pop">
          <p>
            {ds.source === 'live'
              ? `Connected to ${API_URL}.`
              : ds.fellBack
                ? `Couldn't reach ${API_URL}, so built-in sample data is shown.`
                : 'Using built-in sample data (fixtures).'}
          </p>
          <div className="row">
            {ds.source !== 'live' && <button className="btn btn-small" onClick={() => setDataSource('live')}>Use live API</button>}
            {ds.source === 'live' && <button className="btn btn-small" onClick={() => setDataSource('fixtures')}>Use sample data</button>}
            {ds.source !== 'live' && <button className="btn btn-small btn-ghost" onClick={resetMockData}>Reset sample plans</button>}
          </div>
        </div>
      </details>
    </header>
  )
}
