import { useState } from 'react'
import { api } from '../api'
import type { Patient, Role } from '../types'
import { useAsync } from '../lib/hooks'
import { initials, signIn } from '../lib/session'
import { Icon } from '../components/Icon'

const CLINICIANS = [
  { name: 'Dr. Rivera', specialty: 'Internal medicine' },
  { name: 'Dr. Okafor', specialty: 'Neurology' },
]

export function SignIn() {
  const patients = useAsync<Patient[]>(() => api.patients(), [])
  const [role, setRole] = useState<Role>('clinician')
  const [clinician, setClinician] = useState(CLINICIANS[0].name)
  const [patientId, setPatientId] = useState('')
  const pid = patientId || patients.data?.[0]?.id || ''
  const patient = patients.data?.find((p) => p.id === pid)

  const go = () => {
    if (role === 'clinician') signIn({ role, name: clinician })
    else if (patient) signIn({ role, name: patient.display_name, patientId: patient.id })
  }

  return (
    <div className="signin">
      <aside className="signin-aside">
        <div className="brand"><span className="brand-mark">N1</span><span>N1 Hub</span></div>
        <div>
          <h1>Turn a clinical hunch into an honest answer.</h1>
          <p>N1 Hub runs structured n-of-1 tests on one patient's own phone and wearable data, then says plainly whether a pattern is likely real or probably chance.</p>
          <ul>
            <li><span><Icon name="shield" size={17} /></span><div><strong>The test plan is the consent.</strong> Patients approve exactly which signals are shared, and for how long.</div></li>
            <li><span><Icon name="shuffle" size={17} /></span><div><strong>Honest statistics.</strong> Every result is checked against thousands of random shuffles.</div></li>
            <li><span><Icon name="watch" size={17} /></span><div><strong>Devices patients already own.</strong> Works with phone-only or low-cost wearables.</div></li>
          </ul>
        </div>
        <div className="cite">Based on n-of-1 trial methodology: Lillie EO et al., Personalized Medicine 2011;8(2):161–173.</div>
      </aside>

      <main className="signin-main">
        <div className="signin-panel">
          <p className="eyebrow">Welcome</p>
          <h2>Sign in to N1 Hub</h2>
          <p className="muted" style={{ marginTop: 6 }}>Demo build: choose an account, no password needed.</p>

          <div className="role-cards" role="radiogroup" aria-label="I am a">
            <button role="radio" aria-checked={role === 'clinician'} className={`role-card ${role === 'clinician' ? 'selected' : ''}`} onClick={() => setRole('clinician')}>
              <span className="summary-icon tone-purple" style={{ margin: 0 }}><Icon name="stethoscope" /></span>
              <strong>I'm a clinician</strong>
              <span className="sub">Design test plans and review results.</span>
            </button>
            <button role="radio" aria-checked={role === 'patient'} className={`role-card ${role === 'patient' ? 'selected' : ''}`} onClick={() => setRole('patient')}>
              <span className="summary-icon tone-green" style={{ margin: 0 }}><Icon name="user" /></span>
              <strong>I'm a patient</strong>
              <span className="sub">Review requests, control sharing, see results.</span>
            </button>
          </div>

          <div className="field"><span className="label">Account</span></div>
          <div className="account-list" style={{ marginTop: -6 }}>
            {role === 'clinician'
              ? CLINICIANS.map((c) => (
                  <button key={c.name} className={`account ${clinician === c.name ? 'selected' : ''}`} onClick={() => setClinician(c.name)}>
                    <span className="avatar">{initials(c.name)}</span>
                    <span className="meta"><strong>{c.name}</strong><small>{c.specialty}</small></span>
                    {clinician === c.name && <Icon name="check" />}
                  </button>
                ))
              : patients.loading && !patients.data
                ? <div className="spinner">Loading accounts…</div>
                : (patients.data ?? []).map((p) => (
                    <button key={p.id} className={`account ${pid === p.id ? 'selected' : ''}`} onClick={() => setPatientId(p.id)}>
                      <span className="avatar" style={{ background: '#e4f5f0', color: '#119274' }}>{initials(p.display_name)}</span>
                      <span className="meta"><strong>{p.display_name}</strong><small>{p.id} · {p.source === 'pmdata' ? 'PMData (real data)' : 'Synthetic'}</small></span>
                      {pid === p.id && <Icon name="check" />}
                    </button>
                  ))}
          </div>
          {patients.error && role === 'patient' && <div className="alert alert-error mb">{patients.error}</div>}

          <button className="button primary lg" style={{ width: '100%' }} onClick={go} disabled={role === 'patient' && !patient}>
            Continue as {role === 'clinician' ? clinician : patient?.display_name ?? 'patient'} <Icon name="chevron" size={16} />
          </button>
          <p className="muted small" style={{ marginTop: 14, textAlign: 'center' }}>Not diagnostic. Results are worth discussing with your clinician.</p>
        </div>
      </main>
    </div>
  )
}
