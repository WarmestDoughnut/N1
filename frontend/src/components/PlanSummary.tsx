import type { Plan } from '../types'
import { formatDate, signalLabel } from '../lib/util'
import { ScheduleTimeline } from './ScheduleTimeline'

export function PlanFacts({ plan, deviceName }: { plan: Plan; deviceName: (id: string) => string }) {
  return (
    <table className="table kv">
      <tbody>
        <tr><th>Devices</th><td>{plan.devices.map(deviceName).join(', ')}</td></tr>
        <tr><th>Signals shared</th><td>{plan.signals.map(signalLabel).join(', ')}</td></tr>
        <tr><th>Window</th><td>{formatDate(plan.window.start)} → {formatDate(plan.window.end)}</td></tr>
        {plan.observational && (
          <tr><th>Hypothesis</th><td>{signalLabel(plan.observational.signal)} is <strong>{plan.observational.direction}</strong> in the {(plan.observational.min_lag_days ?? 1) === plan.observational.max_lag_days ? plan.observational.max_lag_days : `${plan.observational.min_lag_days ?? 1}–${plan.observational.max_lag_days}`} days before episodes</td></tr>
        )}
        {plan.intervention && (
          <tr><th>Design</th><td>A = {plan.intervention.arm_a}, B = {plan.intervention.arm_b}. {plan.intervention.n_periods} periods × {plan.intervention.period_days} days, {plan.intervention.washout_days}-day washout. Outcome: {signalLabel(plan.intervention.outcome_signal)} ({plan.intervention.better} is better)</td></tr>
        )}
        <tr><th>Clinician</th><td>{plan.clinician_name}</td></tr>
      </tbody>
    </table>
  )
}

export function PlanSchedule({ plan }: { plan: Plan }) {
  if (!plan.intervention?.schedule?.length) return null
  return <ScheduleTimeline schedule={plan.intervention.schedule} armA={plan.intervention.arm_a} armB={plan.intervention.arm_b} />
}

export function History({ plan }: { plan: Plan }) {
  return (
    <ul className="shared-list" style={{ marginTop: 6 }}>
      {plan.history.map((h, i) => (
        <li key={i} style={{ fontSize: 14, padding: '9px 0' }}>
          <span className="muted small" style={{ minWidth: 140 }}>{formatDate(h.at)} · {h.at.slice(11, 16)}</span>
          <span style={{ textTransform: 'capitalize' }}>{h.event}</span>
        </li>
      ))}
    </ul>
  )
}
