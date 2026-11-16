import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, getDataSource, onDataSourceChange } from '../api'
import type { AssistantMessage, AssistantRequest, Device, Patient, Plan, Results } from '../types'
import { navigate } from '../lib/hooks'
import { Icon } from './Icon'
import { finishedOn } from './DeliveryBadge'

// Physician assistant (backend to-frontend #14). Clinician app only. The backend model sees only what this
// component sends: the chat turns, plus either the wizard's device/signal capabilities or a label-only
// snapshot of test statuses. Never raw signal values.

interface DraftPlan { type?: string; title?: string; [k: string]: unknown }
interface ChatItem { role: 'user' | 'assistant'; content: string; error?: boolean }

const CHAT_KEY = 'n1.assistant.chat'
export const DRAFT_KEY = 'n1.assistant.draft'
const MAX_ACTIVITY = 60

function loadChat(): ChatItem[] {
  try { return JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? '[]') as ChatItem[] } catch { return [] }
}

/** Splits a reply into its prose and the first fenced ```json block holding {"draft_plan": {...}}, if any. */
export function splitDraft(reply: string): { text: string; draft: DraftPlan | null } {
  const m = /```json\s*([\s\S]*?)```/.exec(reply)
  if (!m) return { text: reply, draft: null }
  try {
    const parsed = JSON.parse(m[1]) as { draft_plan?: DraftPlan }
    if (parsed && typeof parsed.draft_plan === 'object' && parsed.draft_plan) {
      return { text: (reply.slice(0, m.index) + reply.slice(m.index + m[0].length)).trim(), draft: parsed.draft_plan }
    }
  } catch { /* not valid JSON: show the reply as plain text */ }
  return { text: reply, draft: null }
}

// ---------- small, safe markdown: React nodes only, never innerHTML ----------
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <em key={i}>{part.slice(1, -1)}</em>
      : part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code>
        : <Fragment key={i}>{part}</Fragment>)
}
function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      i++
      out.push(<pre key={out.length}><code>{code.join('\n')}</code></pre>)
    } else if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+[.)])\s+/, ''))
      const lis = items.map((t, k) => <li key={k}>{inline(t)}</li>)
      out.push(ordered ? <ol key={out.length}>{lis}</ol> : <ul key={out.length}>{lis}</ul>)
    } else if (/^#{1,6}\s+/.test(line)) {
      out.push(<p key={out.length}><strong>{inline(line.replace(/^#{1,6}\s+/, ''))}</strong></p>); i++
    } else if (!line.trim()) {
      i++
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i]) && !lines[i].trim().startsWith('```') && !/^#{1,6}\s+/.test(lines[i])) para.push(lines[i++])
      out.push(<p key={out.length}>{inline(para.join(' '))}</p>)
    }
  }
  return <>{out}</>
}

const errorText = (e: unknown) =>
  e instanceof ApiError && e.status === 503 ? 'The assistant is turned off right now.'
    : e instanceof ApiError && e.status === 403 ? 'The assistant is only available to clinicians.'
      : "The assistant couldn't answer. Try again."

export function AssistantWidget({ route, patients, plans, results, catalog }: {
  route: string[]; patients: Patient[]; plans: Plan[]; results: Record<string, Results>; catalog: Device[]
}) {
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [chat, setChat] = useState<ChatItem[]>(loadChat)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Kill switch: shown only when the live backend says the assistant is on (sample mode has a canned reply).
  useEffect(() => {
    let alive = true
    const check = () => {
      if (getDataSource().source !== 'live') { setEnabled(true); return }
      api.health().then((h) => { if (alive) setEnabled(h.assistant_enabled === true) }).catch(() => { if (alive) setEnabled(false) })
    }
    check()
    const off = onDataSourceChange(check)
    return () => { alive = false; off() }
  }, [])
  useEffect(() => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-40))) } catch { /* private mode */ } }, [chat])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [chat, busy, open])

  const patient = route[0] === 'patients' && route[1] ? patients.find((p) => p.id === route[1]) : undefined
  const inWizard = !!patient && route[2] === 'new' && (route[3] === 'test' || route[3] === 'collection')

  /** What goes to the backend besides the chat turns. Labels and statuses only. */
  const extras = useMemo((): Pick<AssistantRequest, 'capabilities' | 'context'> => {
    if (inWizard && patient) {
      const available = [...new Set(catalog.filter((d) => patient.devices.includes(d.id)).flatMap((d) => d.signals))]
      return { capabilities: { devices: patient.devices, available_signals: available, present_signals: patient.signals_present ?? available } }
    }
    const label = (id: string) => patients.find((p) => p.id === id)?.display_name ?? id
    const activity = [...plans].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, MAX_ACTIVITY).map((p) => {
      const r = results[p.id] as (Results & { clinician_comment?: unknown }) | undefined
      return {
        plan_id: p.id, patient_label: label(p.patient_id), title: p.title, type: p.type, status: p.status,
        verdict: r?.verdict ?? null, date: (finishedOn(p) ?? p.created_at).slice(0, 10),
        needs_comment: !!r && r.verdict != null && !r.clinician_comment,
      }
    })
    return { context: { today: new Date().toISOString().slice(0, 10), ...(patient ? { current_patient_label: patient.display_name } : {}), activity } }
  }, [inWizard, patient, patients, plans, results, catalog])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    const next: ChatItem[] = [...chat, { role: 'user', content: q }]
    setChat(next); setInput(''); setBusy(true)
    try {
      // A failed exchange (the question and its error) isn't part of the conversation the model sees,
      // so the turns it gets always alternate user / assistant.
      const messages: AssistantMessage[] = next.filter((m, i) => !m.error && !next[i + 1]?.error).map(({ role, content }) => ({ role, content }))
      const { reply } = await api.assistant({ messages, ...extras })
      setChat((c) => [...c, { role: 'assistant', content: reply }])
    } catch (e) {
      setChat((c) => [...c, { role: 'assistant', content: errorText(e), error: true }])
    } finally { setBusy(false) }
  }

  if (!enabled) return null
  const chips = ['Summarize today', 'Which results need a comment?', ...(patient ? ['Help me design a test for this patient'] : [])]

  return (
    <>
      {!open && (
        <button className="asst-fab" aria-label="Open the assistant" title="Assistant" onClick={() => setOpen(true)}>
          <Icon name="sparkles" size={22} />
        </button>
      )}
      {open && (
        <section className="asst-panel" role="dialog" aria-label="Assistant">
          <header className="asst-head">
            <span className="asst-title"><Icon name="sparkles" size={17} /> Assistant</span>
            <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
              {chat.length > 0 && <button className="link-btn" style={{ fontSize: 12.5, marginRight: 6 }} onClick={() => setChat([])}>Clear</button>}
              <button className="icon-btn" aria-label="Close the assistant" onClick={() => setOpen(false)}><Icon name="x" size={18} /></button>
            </span>
          </header>
          <div className="asst-list" ref={listRef}>
            {chat.length === 0 && (
              <div className="asst-empty">
                <p>Ask about test design, or what needs your attention.</p>
                <div className="asst-chips">{chips.map((c) => <button key={c} onClick={() => send(c)}>{c}</button>)}</div>
              </div>
            )}
            {chat.map((m, i) => <Bubble key={i} item={m} patient={patient} patients={patients} onOpenDraft={() => setOpen(false)} />)}
            {busy && <div className="asst-msg assistant"><div className="asst-bubble asst-thinking">Thinking…</div></div>}
          </div>
          <form className="asst-input" onSubmit={(e) => { e.preventDefault(); send(input) }}>
            <textarea aria-label="Message the assistant" rows={1} placeholder="Ask a question…" value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }} />
            <button className="button primary sm" type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
          <p className="asst-foot">
            {inWizard ? "Sends your messages and this patient's device and signal list." : 'Sends your messages and a list of test titles and statuses. No measurements.'} Design help, not medical advice.
          </p>
        </section>
      )}
    </>
  )
}

function Bubble({ item, patient, patients, onOpenDraft }: { item: ChatItem; patient?: Patient; patients: Patient[]; onOpenDraft: () => void }) {
  const { text, draft } = item.role === 'assistant' && !item.error ? splitDraft(item.content) : { text: item.content, draft: null }
  return (
    <div className={`asst-msg ${item.role}`}>
      <div className={`asst-bubble ${item.error ? 'error' : ''}`}>
        {item.role === 'assistant' ? <Markdown text={text} /> : text}
        {draft && <DraftCard draft={draft} patient={patient} patients={patients} onOpen={onOpenDraft} />}
      </div>
    </div>
  )
}

const TYPE_LABEL: Record<string, string> = { observational: 'Pattern test', intervention: 'A/B test', collection: 'Data collection' }

/** "Open in wizard" hands the draft to the wizard through sessionStorage (contract: fe-main_to_fe-tuning #16). */
function DraftCard({ draft, patient, patients, onOpen }: { draft: DraftPlan; patient?: Patient; patients: Patient[]; onOpen: () => void }) {
  const [pid, setPid] = useState(patient?.id ?? '')
  useEffect(() => { if (patient) setPid(patient.id) }, [patient])
  const open = () => {
    if (!pid) return
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* private mode: the wizard opens empty */ }
    navigate(`/patients/${encodeURIComponent(pid)}/new/${draft.type === 'collection' ? 'collection' : 'test'}?draft=1`)
    onOpen()
  }
  return (
    <div className="asst-draft">
      <span className="asst-draft-k">Draft</span>
      <strong>{draft.title || 'Untitled plan'}</strong>
      <small>{TYPE_LABEL[draft.type ?? ''] ?? draft.type ?? 'Plan'} · no dates yet</small>
      {!patient && (
        <select aria-label="Patient for this draft" value={pid} onChange={(e) => setPid(e.target.value)}>
          <option value="">Choose a patient…</option>
          {[...patients].sort((a, b) => a.display_name.localeCompare(b.display_name)).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      )}
      <button className="button primary sm" disabled={!pid} onClick={open}>Open in wizard <Icon name="chevron" size={14} /></button>
    </div>
  )
}
