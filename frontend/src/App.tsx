import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { Patient, Role } from './types'
import { useAsync, useHashRoute, navigate } from './lib/hooks'
import { TopBar } from './components/TopBar'
import { ClinicianPlans } from './pages/ClinicianPlans'
import { PlanWizard } from './pages/PlanWizard'
import { ClinicianPlanDetail } from './pages/ClinicianPlanDetail'
import { PatientHome } from './pages/PatientHome'
import { PatientPlan } from './pages/PatientPlan'
import { ResultsGallery } from './pages/ResultsGallery'

function readLS(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function writeLS(key: string, v: string) {
  try { localStorage.setItem(key, v) } catch { /* ignore */ }
}

export default function App() {
  const [role, setRoleState] = useState<Role>(() => (readLS('n1.role', 'clinician') as Role))
  const [patientId, setPatientIdState] = useState<string>(() => readLS('n1.patient', ''))
  const patients = useAsync<Patient[]>(() => api.patients(), [])
  const route = useHashRoute()

  useEffect(() => {
    if (!patientId && patients.data?.length) setPatientIdState(patients.data[0].id)
  }, [patients.data, patientId])

  const setRole = (r: Role) => {
    setRoleState(r)
    writeLS('n1.role', r)
    // Keep the same plan open when switching roles, otherwise go home.
    if (route[0] !== 'plans') navigate('/')
  }
  const switchPatientQuietly = useCallback((id: string) => { setPatientIdState(id); writeLS('n1.patient', id) }, [])
  const setPatientId = (id: string) => {
    setPatientIdState(id)
    writeLS('n1.patient', id)
    if (role === 'patient') navigate('/')
  }

  let page: JSX.Element
  if (route[0] === 'gallery') page = <ResultsGallery />
  else if (role === 'clinician') {
    if (route[0] === 'new') page = <PlanWizard patients={patients.data ?? []} />
    else if (route[0] === 'plans' && route[1]) page = <ClinicianPlanDetail planId={route[1]} patients={patients.data ?? []} onRole={setRole} />
    else page = <ClinicianPlans patients={patients.data ?? []} />
  } else {
    const patient = patients.data?.find((p) => p.id === patientId)
    if (route[0] === 'plans' && route[1]) page = <PatientPlan planId={route[1]} patient={patient} onSwitchPatient={switchPatientQuietly} />
    else page = <PatientHome patient={patient} />
  }

  return (
    <div className="app">
      <TopBar
        role={role}
        onRole={setRole}
        patients={patients.data ?? []}
        patientId={patientId}
        onPatient={setPatientId}
      />
      <main className="main">
        {patients.error && <div className="alert alert-error">Couldn't load patients: {patients.error}</div>}
        {page}
      </main>
      <footer className="app-footer">
        N1 Hub is a research demo. It is not diagnostic — results are worth discussing with your clinician.
        {' '}Data: PMData (Thambawita et al., MMSys 2020, CC BY-NC 4.0) and synthetic patients.
        {' '}<a href="#/gallery">Results gallery</a>
      </footer>
    </div>
  )
}
