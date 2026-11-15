import { api } from './api'
import type { Patient } from './types'
import { useAsync, useHashRoute } from './lib/hooks'
import { useSession } from './lib/session'
import { SignIn } from './pages/SignIn'
import { ClinicianApp } from './pages/clinician/ClinicianApp'
import { PatientApp } from './pages/patient/PatientApp'

/** Sign-in decides which app you get: clinicians and patients never share a screen. */
export default function App() {
  const session = useSession()
  const route = useHashRoute()
  // Scoped by the signed-in account: clinicians get connected patients only, patients get themselves.
  const patients = useAsync<Patient[]>(() => (session ? api.patients() : Promise.resolve([])), [session?.accountId])

  if (!session) return <SignIn />
  if (session.role === 'clinician') return <ClinicianApp session={session} route={route} patients={patients.data ?? []} />
  return <PatientApp session={session} route={route} patients={patients.data ?? []} />
}
