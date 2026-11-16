/* Assistant → wizard hand-off (fe-main #16; FE-3's AssistantWidget writes, the wizard reads once).
 * FE-3 stores the parsed `draft_plan` JSON under DRAFT_KEY and opens
 * `#/patients/:id/new/<test|collection>?draft=1`. The draft never carries dates. */

export const DRAFT_KEY = 'n1.assistant.draft'

export interface AssistantDraft {
  type: 'observational' | 'intervention' | 'collection'
  title?: string
  devices?: string[]
  signals?: string[]
  /** backend #18: `symptom_label` names the outcome symptom (matched to the patient's symptoms by name) */
  observational?: { signal: string; direction: 'lower' | 'higher'; min_lag_days?: number; max_lag_days?: number; symptom_label?: string } | null
  intervention?: { arm_a: string; arm_b: string; outcome_signal: string; better: 'higher' | 'lower'; period_days?: number; washout_days?: number; n_periods?: number } | null
  collection?: { instructions?: string } | null
  instructions?: string
}

/** Read the stored draft once and clear it (accepts `{draft_plan: …}` or the bare plan). */
export function takeAssistantDraft(): AssistantDraft | null {
  let raw: string | null = null
  try { raw = sessionStorage.getItem(DRAFT_KEY); sessionStorage.removeItem(DRAFT_KEY) } catch { return null }
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    const d = (v && typeof v === 'object' && 'draft_plan' in v ? v.draft_plan : v) as AssistantDraft
    return d && typeof d === 'object' && typeof d.type === 'string' ? d : null
  } catch { return null }
}
