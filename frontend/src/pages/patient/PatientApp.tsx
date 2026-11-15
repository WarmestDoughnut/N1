import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../api'
import type { Patient, Plan, Results } from '../../types'
import { navigate, useAsync } from '../../lib/hooks'
import type { Session } from '../../lib/session'
import { Shell, type NavItem, type SearchItem } from '../../components/Shell'
import { PatientHome } from './PatientHome'
import { PatientTests } from './PatientTests'
import { PatientPlan } from './PatientPlan'

export interface PatientData {
  patient?: Patient
  plans: Plan[]
  results: Record<string, Results>
  loading: boolean
  error: string | null
}

export function PatientApp({ session, route, patients }: { session: Session; route: string[]; patients: Patient[] }) {
  const pid = session.patientId!
  const plansQ = useAsync<Plan[]>(() => api.listPlans(pid), [pid])
  const [results, setResults] = useState<Record<string, Results>>({})
  useEffect(() => {
    const finished = (plansQ.data ?? []).filter((p) => p.status === 'complete' || p.status === 'stopped')
    Promise.all(finished.map((p) => api.results(p.id).then((r) => [p.id, r] as const).catch((e) => (e instanceof ApiError ? null : null))))
      .then((pairs) => setResults(Object.fromEntries(pairs.filter(Boolean) as [string, Results][])))
  }, [plansQ.data])

  const data: PatientData = {
    patient: patients.find((p) => p.id === pid),
    plans: plansQ.data ?? [],
    results,
    loading: plansQ.loading && !plansQ.data,
    error: plansQ.error,
  }
  const pending = data.plans.filter((p) => p.status === 'pending_approval').length

  const nav: NavItem[] = [
    { label: 'Home', icon: 'grid', href: '#/', match: (r) => r.length === 0 },
    { label: 'My tests', icon: 'clipboard', href: '#/tests', badge: pending || undefined, match: (r) => r[0] === 'tests' || r[0] === 'plans' },
  ]
  const searchItems: SearchItem[] = useMemo(
    () => data.plans.map((p) => ({ label: p.title, sub: `from ${p.clinician_name}`, href: `#/plans/${p.id}`, icon: 'clipboard' as const })),
    [data.plans],
  )

  let page: JSX.Element
  if (route[0] === 'plans' && route[1]) page = <PatientPlan planId={route[1]} data={data} />
  else if (route[0] === 'tests') page = <PatientTests data={data} />
  else page = <PatientHome session={session} data={data} />

  return (
    <Shell
      className="patient-app"
      session={session}
      subtitle="Patient"
      route={route}
      nav={nav}
      searchPlaceholder="Search my tests…"
      searchItems={searchItems}
      notifications={pending}
      onNotifications={() => navigate('/tests')}
    >
      {page}
    </Shell>
  )
}
