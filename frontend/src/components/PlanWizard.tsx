import { useEffect, useState } from 'react'
import type { Patient } from '../types'
import { PlanWizard as Wizard } from '../pages/clinician/PlanWizard'

/** Workspace entry point (fe-main #7 / fe-3 #8 contract):
 *  <PlanWizard patient={patient} kind="test" | "collection" onDone={(planId) => …} />
 *  The implementation lives in pages/clinician/PlanWizard.tsx (legacy #/new uses it with `patients`).
 *
 *  The wizard is keyed by patient + kind + the URL query (`?draft=1`, `?collection=…`), so moving to another
 *  patient's New page, or opening an assistant draft while a wizard is already showing, starts a fresh wizard
 *  instead of reusing the previous one's state. Steps don't change the URL, so they don't reset it. */
export function PlanWizard(props: { patients?: Patient[]; patient?: Patient; kind?: 'test' | 'collection'; onDone?: (planId: string) => void }) {
  const [query, setQuery] = useState(() => window.location.hash.split('?')[1] ?? '')
  useEffect(() => {
    const on = () => setQuery(window.location.hash.split('?')[1] ?? '')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return <Wizard key={`${props.patient?.id ?? ''}|${props.kind ?? 'test'}|${query}`} {...props} />
}
