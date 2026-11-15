import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { Device, Patient, SignalId } from '../../types'
import { useAsync } from '../../lib/hooks'
import { DEVICE_ICON, Icon } from '../../components/Icon'
import { SIGNAL_INFO } from '../../lib/util'

// DRAFT UI (fe-main_to_fe-3 #2). Connecting and disconnecting are local to this browser:
// nothing is sent to the backend and the clinician's view of the patient's devices doesn't change.
// TODO(backend): POST/DELETE /api/patients/{id}/devices, and Apple Watch ingest via the iOS Shortcut.

interface Draft { added: string[]; removed: string[]; watchSyncedAt?: string }
const KEY = (pid: string) => `n1.devices.${pid}`
function readDraft(pid: string): Draft {
  try { return { added: [], removed: [], ...(JSON.parse(localStorage.getItem(KEY(pid)) ?? '{}') as Partial<Draft>) } } catch { return { added: [], removed: [] } }
}
/** Catalog devices list some signals the app has no label for yet ("screen_time_min"); show those as plain words. */
const tidy = (id: string) => { const t = id.replace(/_min$/, '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1) }
const plain = (s: SignalId) => SIGNAL_INFO[s]?.label ?? tidy(s)
/** One comma-separated line of labels with repeats removed (two catalog ids can share a label). */
const signalList = (ids: SignalId[]) => [...new Set(ids.map(plain))].join(', ')
/** Health data the Apple Watch step asks for, in the same words the consent screens use. */
const WATCH_DATA = ['Steps', 'Sleep', 'Heart rate', 'Heart rate variability']

/** #/devices: the patient's own devices. Not the clinician "Connections" page (that links patient and clinician). */
export function PatientDevices({ patient }: { patient?: Patient }) {
  const catalogQ = useAsync<Device[]>(() => api.devices(), [])
  const pid = patient?.id ?? ''
  const [draft, setDraft] = useState<Draft>(() => readDraft(pid))
  useEffect(() => { setDraft(readDraft(pid)) }, [pid])
  const save = (d: Draft) => { setDraft(d); try { localStorage.setItem(KEY(pid), JSON.stringify(d)) } catch { /* private mode */ } }
  const [connecting, setConnecting] = useState<Device | null>(null)
  const [confirmOff, setConfirmOff] = useState<Device | null>(null)
  const [showSoon, setShowSoon] = useState(false)

  const catalog = catalogQ.data ?? []
  const mineIds = [...new Set([...(patient?.devices ?? []), ...draft.added])].filter((id) => !draft.removed.includes(id))
  const mine = mineIds.map((id) => catalog.find((d) => d.id === id) ?? ({ id, name: id, signals: [] } as Device))
  const others = catalog.filter((d) => !mineIds.includes(d.id))
  const now = others.filter((d) => d.availability !== 'emerging')
  const soon = others.filter((d) => d.availability === 'emerging')

  const connect = (d: Device, watchSyncedAt?: string) => save({
    added: draft.added.includes(d.id) || patient?.devices.includes(d.id) ? draft.added : [...draft.added, d.id],
    removed: draft.removed.filter((x) => x !== d.id),
    watchSyncedAt: watchSyncedAt ?? draft.watchSyncedAt,
  })
  const disconnect = (d: Device) => save({
    added: draft.added.filter((x) => x !== d.id),
    removed: patient?.devices.includes(d.id) ? [...draft.removed, d.id] : draft.removed,
    watchSyncedAt: d.id === 'apple_watch' ? undefined : draft.watchSyncedAt,
  })

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">My devices</p>
          <h1>Phones, watches and sensors</h1>
        </div>
        <span className="pill pill-yellow no-dot">Preview: not live yet</span>
      </section>

      <div className="alert alert-info mb"><Icon name="shield" /><span className="grow">Connecting a device shares nothing by itself. Your data is only shared with a test plan you approve.</span></div>

      <article className="card mb">
        <div className="card-title"><h3 style={{ fontSize: 18 }}>Connected</h3><span className="muted small">{mine.length}</span></div>
        {catalogQ.loading && !catalogQ.data ? <div className="spinner">Loading…</div>
          : mine.length === 0 ? <p className="muted" style={{ margin: 0 }}>No devices connected.</p>
            : (
              <div className="dev-grid">
                {mine.map((d) => (
                  <div key={d.id} className="dev-card on">
                    <div className="dev-head">
                      <span className="summary-icon tone-green"><Icon name={DEVICE_ICON[d.id] ?? 'watch'} /></span>
                      <div><strong>{d.name}</strong><small><Icon name="check" size={13} /> Connected</small></div>
                    </div>
                    <p className="dev-signals">{d.signals.length ? signalList(d.signals) : 'No signals listed'}</p>
                    <div className="dev-foot">
                      <span className="muted small">{d.id === 'apple_watch' && draft.watchSyncedAt ? 'Last synced just now (test sync)' : 'Last synced: not shown in this preview'}</span>
                      <button className="button ghost sm" onClick={() => setConfirmOff(d)}>Disconnect</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
      </article>

      <article className="card">
        <div className="card-title"><h3 style={{ fontSize: 18 }}>Add a device</h3></div>
        {now.length === 0 && !catalogQ.loading ? <p className="muted" style={{ margin: 0 }}>Every available device is already connected.</p> : (
          <div className="dev-grid">
            {now.map((d) => (
              <div key={d.id} className="dev-card">
                <div className="dev-head">
                  <span className="summary-icon tone-purple"><Icon name={DEVICE_ICON[d.id] ?? 'watch'} /></span>
                  <div><strong>{d.name}</strong></div>
                </div>
                <p className="dev-signals">{signalList(d.signals)}</p>
                <div className="dev-foot"><span /><button className="button secondary sm" onClick={() => setConnecting(d)}><Icon name="plus" size={14} /> Connect</button></div>
              </div>
            ))}
          </div>
        )}
        {soon.length > 0 && (
          <>
            <button type="button" className="disclosure" style={{ marginTop: 10 }} onClick={() => setShowSoon(!showSoon)} aria-expanded={showSoon}>
              <span style={{ transform: showSoon ? 'rotate(90deg)' : undefined, display: 'inline-flex' }}><Icon name="chevron" size={14} /></span>
              Coming soon <span className="muted">({soon.length})</span>
            </button>
            {showSoon && (
              <div className="dev-grid">
                {soon.map((d) => (
                  <div key={d.id} className="dev-card soon">
                    <div className="dev-head">
                      <span className="summary-icon tone-gray"><Icon name={DEVICE_ICON[d.id] ?? 'watch'} /></span>
                      <div><strong>{d.name}</strong><small>Coming soon</small></div>
                    </div>
                    <p className="dev-signals">{signalList(d.signals)}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </article>

      {connecting && (connecting.id === 'apple_watch'
        ? <AppleWatchFlow device={connecting} onClose={() => setConnecting(null)} onConnected={(at) => connect(connecting, at)} />
        : <NotAvailable device={connecting} onClose={() => setConnecting(null)} />)}

      {confirmOff && (
        <div className="modal-back" onClick={() => setConfirmOff(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Disconnect {confirmOff.name}?</h2>
            <p className="muted">New data from this device will stop arriving. Tests that are already running keep the data they have.</p>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="button ghost" onClick={() => setConfirmOff(null)}>Keep connected</button>
              <button className="button danger" onClick={() => { disconnect(confirmOff); setConfirmOff(null) }}>Disconnect</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Three guided steps. Only the layout is real: the Shortcut link, QR code and sync are stand-ins. */
function AppleWatchFlow({ device, onClose, onConnected }: { device: Device; onClose: () => void; onConnected: (at: string) => void }) {
  const [step, setStep] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [done, setDone] = useState(false)
  const testSync = () => {
    setSyncing(true)
    // TODO(backend): live push via iOS Shortcut. Until then this is a timer, not a sync.
    window.setTimeout(() => { setSyncing(false); setDone(true); onConnected(new Date().toISOString()) }, 1500)
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal dev-flow" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Connect {device.name}</h2>
        <ol className="dev-steps">
          {['Install the Shortcut', 'Allow Health access', 'Test sync'].map((t, i) => (
            <li key={t} className={step === i + 1 ? 'cur' : step > i + 1 || done ? 'ok' : ''}><b>{step > i + 1 || done ? <Icon name="check" size={13} /> : i + 1}</b>{t}</li>
          ))}
        </ol>

        {step === 1 && (
          <>
            <p className="dev-lead">Install the N1 Hub Shortcut on your iPhone. It sends your watch's daily numbers to N1 Hub.</p>
            <div className="dev-qr-row">
              <div className="dev-qr" aria-label="QR code placeholder">QR code<br />(placeholder)</div>
              <div>
                <button className="button secondary" disabled title="Not available in this preview"><Icon name="phone" /> Get the Shortcut</button>
                <p className="muted small" style={{ marginTop: 8 }}>The Shortcut isn't published yet, so this button does nothing in the preview.</p>
              </div>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="dev-lead">On your iPhone, allow the Shortcut to read only this Health data:</p>
            <ul className="shared-list">
              {WATCH_DATA.map((x) => <li key={x}><span className="ic tone-purple"><Icon name="check" size={16} /></span>{x}</li>)}
            </ul>
            <p className="muted small">Nothing is shared with a clinician until you approve a test plan that lists it.</p>
          </>
        )}
        {step === 3 && (
          done ? (
            <div className="alert alert-info"><Icon name="check" /><span className="grow"><strong>Connected.</strong> Last synced just now. This was a test sync in the preview; no data was sent.</span></div>
          ) : (
            <>
              <p className="dev-lead">Run a test sync to check that your watch and phone can reach N1 Hub.</p>
              <button className="button primary lg" disabled={syncing} onClick={testSync}>{syncing ? 'Syncing…' : 'Run a test sync'}</button>
            </>
          )
        )}

        <div className="row" style={{ justifyContent: 'space-between', marginTop: 20 }}>
          <button className="button ghost" onClick={done ? onClose : step === 1 ? onClose : () => setStep(step - 1)}>{done ? 'Close' : step === 1 ? 'Cancel' : '← Back'}</button>
          {step < 3 && <button className="button primary" onClick={() => setStep(step + 1)}>Next</button>}
          {done && <button className="button primary" onClick={onClose}>Done</button>}
        </div>
      </div>
    </div>
  )
}

function NotAvailable({ device, onClose }: { device: Device; onClose: () => void }) {
  const [asked, setAsked] = useState(false)
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{device.name}</h2>
        <p className="muted">Connecting {device.name} isn't available yet in this demo.</p>
        {asked && <div className="alert alert-info mt"><Icon name="info" /><span>Noted on this screen only. Notifications aren't set up yet.</span></div>}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="button ghost" onClick={onClose}>Close</button>
          {!asked && <button className="button secondary" onClick={() => setAsked(true)}><Icon name="bell" /> Notify me</button>}
        </div>
      </div>
    </div>
  )
}
