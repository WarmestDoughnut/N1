/* What a patient's devices can measure (fe-main #16, for FE-3's assistant `capabilities`).
 * Same gate as the wizard: a signal is usable when a device the patient owns tracks it AND the
 * patient has data for it (`signals_present`, v1.5). */
import { api } from '../api'
import type { Device, Patient, SignalId } from '../types'

export interface Capabilities {
  /** the patient's own device ids */
  devices: string[]
  /** signals any of those devices track */
  available_signals: SignalId[]
  /** of those, the ones the patient actually has data for (plus the episode log) */
  present_signals: SignalId[]
}

export function capabilitiesOf(patient: Patient, catalog: Device[]): Capabilities {
  const tracked = new Set<SignalId>()
  catalog.filter((d) => patient.devices.includes(d.id)).forEach((d) => d.signals.forEach((s) => tracked.add(s)))
  const available = [...tracked]
  const present = available.filter((s) => s === 'episode' || !patient.signals_present || patient.signals_present.includes(s))
  return { devices: [...patient.devices], available_signals: available, present_signals: present }
}

/** Async convenience: fetches the device catalog first. */
export async function getCapabilities(patient: Patient): Promise<Capabilities> {
  return capabilitiesOf(patient, await api.devices())
}
