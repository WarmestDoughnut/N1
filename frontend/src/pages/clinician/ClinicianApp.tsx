import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../api'
import type { Connection, Patient, Plan, Results } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import type { Session } from '../../lib/session'
import { Shell, type NavItem, type SearchItem } from '../../components/Shell'
import { Overview } from './Overview'
import { PatientsPage } from './PatientsPage'
import { ConnectionsPage } from './ConnectionsPage'
import { PlansPage } from './PlansPage'
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
  error: string | null
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
    loading: plansQ.loading && !plansQ.data, error: plansQ.error ?? connQ.error,
  }
}

export function ClinicianApp({ session, route, patients }: { session: Session; route: string[]; patients: Patient[] }) {
  const data = useClinicianData(patients)
  const pending = data.plans.filter((p) => p.status === 'pending_approval').length
  // Bell = same items as the Overview "Needs attention" card.
  const attention = data.requests.length + data.plans.filter((p) => p.status === 'pending_approval' || p.status === 'active' || p.status === 'paused').length

  const nav: NavItem[] = [
    { label: 'Overview', icon: 'grid', href: '#/', match: (r) => r.length === 0 },
    { label: 'Patients', icon: 'user', href: '#/patients', match: (r) => r[0] === 'patients' },
    { label: 'Test plans', icon: 'clipboard', href: '#/plans', badge: pending || undefined, match: (r) => r[0] === 'plans' },
    { label: 'New test plan', icon: 'plus', href: '#/new', match: (r) => r[0] === 'new' },
    { label: 'Connections', icon: 'people', href: '#/connections', badge: data.requests.length || undefined, match: (r) => r[0] === 'connections' },
  ]
  const secondary: NavItem[] = [
    { label: 'Validation', icon: 'flask', href: '#/validation', match: (r) => r[0] === 'validation' },
  ]

  const searchItems: SearchItem[] = useMemo(() => [
    ...data.patients.map((p) => ({ label: p.display_name, sub: p.id, href: `#/patients/${p.id}`, icon: 'user' as const })),
    ...data.plans.map((p) => ({ label: p.title, sub: `${p.id} · ${data.patients.find((x) => x.id === p.patient_id)?.display_name ?? p.patient_id}`, href: `#/plans/${p.id}`, icon: 'clipboard' as const })),
  ], [data.patients, data.plans])

  let page: JSX.Element
  switch (route[0]) {
    case 'patients': page = <PatientsPage data={data} selectedId={route[1]} />; break
    case 'connections': page = <ConnectionsPage data={data} />; break
    case 'plans': page = route[1] ? <PlanDetail planId={route[1]} data={data} /> : <PlansPage data={data} />; break
    case 'new': page = <PlanWizard patients={data.patients} />; break
    case 'validation': page = <ResultsGallery />; break
    default: page = <Overview session={session} data={data} />
  }

  return (
    <Shell
      session={session}
      subtitle={session.specialty ?? 'Clinician'}
      route={route}
      nav={nav}
      secondary={secondary}
      searchPlaceholder="Search patients and test plans…"
      searchItems={searchItems}
      notifications={attention}
      onNotifications={() => navigate('/plans')}
    >
      {page}
    </Shell>
  )
}
