import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../api'
import type { Connection, Device, Patient, Plan, Results } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import type { Session } from '../../lib/session'
import { Shell, type NavItem, type SearchItem } from '../../components/Shell'
import { NotConnected, PatientsHome } from './PatientsPage'
import { isUnreviewed, PatientWorkspace } from './PatientWorkspace'
import { ConnectionsPage } from './ConnectionsPage'
import { PlanDetail } from './PlanDetail'
import { PlanWizard } from './PlanWizard'
import { ResultsGallery } from '../ResultsGallery'

export interface ClinicianData {
  patients: Patient[]
  plans: Plan[]
  results: Record<string, Results>
  /** this clinician's connections (active + pending requests from patients) */
  connections: Connection[]
  requests: Connection[]
  loading: boolean
  /** connections have loaded, so `patients` is the real scoped list (not the empty pre-load one) */
  ready: boolean
  error: string | null
  /** refetch plans and results, e.g. after a result is marked reviewed */
  reload: () => void
}

/** Loads plans + results once for the whole clinician app; refetches after any write. */
function useClinicianData(patients: Patient[]): ClinicianData {
  const plansQ = useAsync<Plan[]>(() => api.listPlans(), [])
  const connQ = useAsync<Connection[]>(() => api.connections(), [])
  const connections = connQ.data ?? []
  const [results, setResults] = useState<Record<string, Results>>({})
  useEffect(() => {
    const finished = (plansQ.data ?? []).filter((p) => p.status === 'complete' || p.status === 'stopped')
    Promise.all(finished.map((p) => api.results(p.id).then((r) => [p.id, r] as const).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null
      return null
    }))).then((pairs) => setResults(Object.fromEntries(pairs.filter(Boolean) as [string, Results][])))
  }, [plansQ.data])
  // Clinicians only see actively connected patients (and their plans). The backend enforces this
  // with a token once v1.2 ships (to-backend #3); filtering here too keeps the live demo correct now.
  const connected = new Set(connections.filter((c) => c.status === 'active').map((c) => c.patient_id))
  const scoped = connQ.data ? patients.filter((p) => connected.has(p.id)) : []
  const scopedPlans = connQ.data ? (plansQ.data ?? []).filter((p) => connected.has(p.patient_id)) : []
  return {
    patients: scoped, plans: scopedPlans, results, connections,
    requests: connections.filter((c) => c.status === 'pending' && c.requested_by === 'patient'),
    loading: plansQ.loading && !plansQ.data, ready: !!connQ.data, error: plansQ.error ?? connQ.error, reload: plansQ.reload,
  }
}

export function ClinicianApp({ session, route, patients }: { session: Session; route: string[]; patients: Patient[] }) {
  const data = useClinicianData(patients)
  const unreviewed = data.plans.filter((p) => isUnreviewed(data.results[p.id])).length
  const devicesQ = useAsync<Device[]>(() => api.devices(), [])
  const catalog = devicesQ.data ?? []
  // Bell = same items as the Overview "Needs attention" card.
  const attention = data.requests.length + data.plans.filter((p) => p.status === 'pending_approval' || p.status === 'active' || p.status === 'paused').length

  // Patient-first: everything about a patient (tests, results, new plans) lives in that patient's workspace.
  const nav: NavItem[] = [
    { label: 'Patients', icon: 'user', href: '#/', badge: unreviewed || undefined, match: (r) => r.length === 0 || ['patients', 'plans', 'results', 'new'].includes(r[0]) },
    { label: 'Connections', icon: 'people', href: '#/connections', badge: data.requests.length || undefined, match: (r) => r[0] === 'connections' },
  ]

  const searchItems: SearchItem[] = useMemo(() => [
    ...data.patients.map((p) => ({ label: p.display_name, sub: p.id, href: `#/patients/${p.id}`, icon: 'user' as const })),
    ...data.plans.map((p) => ({ label: p.title, sub: `${p.id} · ${data.patients.find((x) => x.id === p.patient_id)?.display_name ?? p.patient_id}`, href: `#/plans/${p.id}`, icon: 'clipboard' as const })),
  ], [data.patients, data.plans])

  // Old list routes have no page of their own any more.
  const stale = (route[0] === 'plans' || route[0] === 'results') && !route[1]
  useEffect(() => { if (stale) navigate('/') }, [stale])

  const home = <PatientsHome session={session} data={data} />
  const workspace = (patientId: string, tab?: string, sub?: string) => {
    const patient = data.patients.find((p) => p.id === patientId)
    if (patient) return <PatientWorkspace patient={patient} data={data} catalog={catalog} tab={tab} sub={sub} />
    return data.loading || !data.ready ? <div className="spinner">Loading patient…</div> : <NotConnected id={patientId} />
  }
  let page: JSX.Element
  switch (route[0]) {
    case 'patients': page = route[1] ? workspace(route[1], route[2], route[3]) : home; break
    case 'connections': page = <ConnectionsPage data={data} />; break
    // #/plans/:id and #/results/:id keep their URL (deep links, e2e) but render inside the patient's workspace.
    case 'plans':
    case 'results': {
      const plan = route[1] ? data.plans.find((p) => p.id === route[1]) : undefined
      page = plan ? workspace(plan.patient_id, 'tests', plan.id) : route[1] ? <PlanDetail planId={route[1]} data={data} /> : home
      break
    }
    // Full wizard with the patient step. Not in the nav; stays until the wizard takes a fixed patient.
    case 'new': page = <PlanWizard patients={data.patients} />; break
    // Reference gallery of every result variant (fixtures + mock). Not in the nav; kept for testing.
    case 'validation': page = <ResultsGallery />; break
    default: page = home
  }

  return (
    <Shell
      session={session}
      subtitle={session.specialty ?? 'Clinician'}
      route={route}
      nav={nav}
      searchPlaceholder="Search patients and tests…"
      searchItems={searchItems}
      notifications={attention}
      onNotifications={() => navigate('/')}
    >
      {page}
    </Shell>
  )
}
