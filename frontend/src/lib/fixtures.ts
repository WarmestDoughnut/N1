/**
 * Loads backend fixtures copied from shared/fixtures by `npm run fixtures`.
 * Files are classified by shape, so the backend can name them however it likes.
 */
import type { Device, Patient, Plan, Results } from '../types'

const modules = import.meta.glob('../fixtures/*.json', { eager: true, import: 'default' }) as Record<string, unknown>

export const fixtureFiles: Record<string, unknown> = Object.fromEntries(
  Object.entries(modules).map(([path, v]) => [path.split('/').pop()!.replace(/\.json$/, ''), v]),
)

const values = Object.values(fixtureFiles)
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

function firstArrayOf<T>(pred: (x: Record<string, unknown>) => boolean): T[] | null {
  for (const v of values) if (Array.isArray(v) && v.length && isObj(v[0]) && pred(v[0])) return v as T[]
  return null
}

export const fixtureDevices = firstArrayOf<Device>((x) => 'signals' in x && 'name' in x && !('status' in x))
export const fixturePatients = firstArrayOf<Patient>((x) => 'display_name' in x && 'date_range' in x)

export const fixtureResults: { name: string; results: Results }[] = Object.entries(fixtureFiles)
  .filter(([, v]) => isObj(v) && 'verdict' in v && 'plan_id' in v)
  .map(([name, v]) => ({ name, results: v as unknown as Results }))

export const fixturePlans: Plan[] = values.flatMap((v) => {
  if (isObj(v) && 'status' in v && 'patient_summary' in v) return [v as unknown as Plan]
  if (Array.isArray(v) && v.length && isObj(v[0]) && 'patient_summary' in v[0]) return v as Plan[]
  return []
})

export const hasFixtures = values.length > 0
