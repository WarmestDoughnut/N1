import { useState } from 'react'
import type { Device, SignalId } from '../types'
import { SIGNAL_INFO, signalLabel } from '../lib/util'
import { DEVICE_ICON, Icon, SIGNAL_ICON } from './Icon'

/* Plan-wizard pickers that split "what the patient has" from "what they don't",
 * so the screen shows the usable options first and keeps the rest compact.
 * Class names keep `.option`, `.selected`, `.unavailable` and `.title` (e2e relies on them). */

/** Devices: the patient's own devices as cards; everything else behind a disclosure. */
export function DevicePicker({ catalog, owned, selected, onToggle, patientName = 'The patient' }: {
  catalog: Device[]; owned: string[]; selected: string[]; onToggle: (id: string) => void; patientName?: string
}) {
  const mine = catalog.filter((d) => owned.includes(d.id))
  const others = catalog
    .filter((d) => !owned.includes(d.id))
    .sort((a, b) => Number(a.availability === 'emerging') - Number(b.availability === 'emerging') || a.name.localeCompare(b.name))
  const extraSelected = others.filter((d) => selected.includes(d.id)).length
  const [open, setOpen] = useState(extraSelected > 0)

  return (
    <div className="stack">
      <div>
        <div className="picker-head"><strong>{patientName}'s devices</strong><span className="muted small">Data can be pulled from these today</span></div>
        {mine.length === 0
          ? <div className="muted small">No devices on file. Add one below.</div>
          : (
            <div className="option-grid">
              {mine.map((d) => <DeviceCard key={d.id} d={d} sel={selected.includes(d.id)} onToggle={onToggle} />)}
            </div>
          )}
      </div>

      {others.length > 0 && (
        <div>
          <button className="disclosure" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span style={{ transform: open ? 'rotate(90deg)' : undefined, display: 'inline-flex' }}><Icon name="chevron" size={14} /></span>
            Devices the patient doesn't have <span className="muted">({others.length})</span>
            {extraSelected > 0 && <span className="pill pill-yellow no-dot">{extraSelected} added</span>}
          </button>
          {open && (
            <>
              <p className="muted small" style={{ margin: '6px 0 10px' }}>Adding one means the patient needs to get it before the test can start.</p>
              <div className="option-grid compact">
                {others.map((d) => <DeviceCard key={d.id} d={d} sel={selected.includes(d.id)} onToggle={onToggle} compact />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DeviceCard({ d, sel, onToggle, compact = false }: { d: Device; sel: boolean; onToggle: (id: string) => void; compact?: boolean }) {
  const tracks = d.signals.filter((x) => x !== 'episode').map(signalLabel).join(', ')
  return (
    <button className={`option ${compact ? 'compact' : ''} ${sel ? 'selected' : ''}`} onClick={() => onToggle(d.id)} aria-pressed={sel} title={compact ? `Tracks: ${tracks}` : undefined}>
      {sel && <span className="check"><Icon name="check" size={14} /></span>}
      <span className="head">
        <span className="summary-icon tone-purple" style={{ width: compact ? 28 : 36, height: compact ? 28 : 36, margin: 0 }}><Icon name={DEVICE_ICON[d.id] ?? 'watch'} size={compact ? 14 : 17} /></span>
        <span className="title">{d.name}</span>
        {d.availability === 'emerging' && <span className="pill pill-yellow no-dot">Emerging</span>}
      </span>
      {!compact && <span className="sub">Tracks: {tracks}</span>}
    </button>
  )
}

/** Signals: available ones as selectable cards; unavailable ones as one compact grayed row. */
export function SignalPicker({ signals, available, noData, selected, onToggle, sourcesFor }: {
  signals: SignalId[]; available: Set<SignalId>; selected: SignalId[]; onToggle: (s: SignalId) => void
  /** a selected device tracks it, but the patient has no data for it yet */
  noData?: Set<SignalId>
  /** names of the selected devices that provide this signal */
  sourcesFor: (s: SignalId) => string[]
}) {
  const ok = signals.filter((s) => available.has(s))
  const off = signals.filter((s) => !available.has(s))
  return (
    <div className="stack">
      <div>
        <div className="picker-head"><strong>Available</strong><span className="muted small">From the devices you selected</span></div>
        <div className="option-grid">
          {ok.map((s) => {
            const sel = selected.includes(s)
            return (
              <button key={s} className={`option ${sel ? 'selected' : ''}`} onClick={() => onToggle(s)} aria-pressed={sel}>
                {sel && <span className="check"><Icon name="check" size={14} /></span>}
                <span className="head">
                  <span className="summary-icon tone-purple" style={{ width: 36, height: 36, margin: 0 }}><Icon name={SIGNAL_ICON[s] ?? 'activity'} size={17} /></span>
                  <span className="title">{SIGNAL_INFO[s]?.label ?? s}</span>
                </span>
                <span className="sub">{s === 'episode' ? 'Logged by the patient in the app' : `From ${sourcesFor(s).join(', ')}`}</span>
              </button>
            )
          })}
        </div>
      </div>

      {off.length > 0 && (
        <div>
          <div className="picker-head"><strong className="muted">Not available</strong><span className="muted small">The patient needs a device that collects this data.</span></div>
          <div className="off-row">
            {off.map((s) => {
              const nd = noData?.has(s)
              return (
                <button key={s} className="option unavailable compact" disabled
                  title={nd ? 'A selected device tracks this, but there is no data from this patient yet.' : 'The patient needs a device that collects this data.'}>
                  <span className="head">
                    <Icon name={SIGNAL_ICON[s] ?? 'activity'} size={14} />
                    <span className="title">{SIGNAL_INFO[s]?.label ?? s}</span>
                    {nd && <span className="nd">no data yet</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
