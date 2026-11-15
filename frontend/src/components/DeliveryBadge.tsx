import type { Plan } from '../types'
import { deliveryOf, type Delivery } from '../lib/v15'

// `deliveryOf` lives in lib/v15.ts (FE-TUNING): it prefers `plan.delivery` (v1.6) and otherwise works it out
// from the plan window against today. Re-exported so callers of the badge need one import.
export { deliveryOf, type Delivery }

/** When past data was shared: the approve event, or the backend's `shared` event for past-only requests. */
export const sharedOn = (plan: Plan): string | undefined => plan.history.find((h) => /^(approv|shared)/.test(h.event))?.at

/** When the plan finished (completed or stopped). */
export const finishedOn = (plan: Plan): string | undefined => [...plan.history].reverse().find((h) => /^(complete|stop)/.test(h.event))?.at

const LABEL: Record<Delivery, { text: string; tone: string; title: string }> = {
  retrospective: { text: 'Past data', tone: 'pill-purple', title: 'Uses data the patient already has. Shared when they approve.' },
  mixed: { text: 'Past + new', tone: 'pill-yellow', title: 'Past data is shared on approval; new data is collected afterwards.' },
  prospective: { text: 'New', tone: 'pill-gray', title: 'Collects new data from the start date.' },
}

export function DeliveryBadge({ plan }: { plan: Plan }) {
  const d = LABEL[deliveryOf(plan)] ?? LABEL.prospective
  return <span className={`pill no-dot ${d.tone}`} title={d.title}>{d.text}</span>
}
