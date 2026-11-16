import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, API_URL, friendlyError, getDataSource, onDataSourceChange, setDataSource } from '../api'
import { signOut, initials, type Session } from '../lib/session'
import { navigate } from '../lib/hooks'
import { Icon, type IconName } from './Icon'

// ---------- toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export interface NavItem { label: string; icon: IconName; href: string; badge?: number; match?: (route: string[]) => boolean }
export interface SearchItem { label: string; sub?: string; href: string; icon: IconName }

interface Props {
  session: Session
  subtitle: string
  route: string[]
  nav: NavItem[]
  secondary?: NavItem[]
  searchPlaceholder: string
  searchItems: SearchItem[]
  notifications: number
  onNotifications: () => void
  className?: string
  children: ReactNode
}

export function Shell({ session, subtitle, route, nav, secondary = [], searchPlaceholder, searchItems, notifications, onNotifications, className, children }: Props) {
  const [notice, setNotice] = useState('')
  const timer = useRef<number>()
  const toast = useCallback((msg: string) => {
    setNotice(msg)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(''), 2800)
  }, [])

  const isActive = (n: NavItem) => (n.match ? n.match(route) : `#/${route.join('/')}` === n.href || (n.href === '#/' && route.length === 0))

  return (
    <ToastCtx.Provider value={toast}>
      <div className={`app-shell ${className ?? ''}`}>
        <aside className="sidebar">
          <a className="brand" href="#/">
            <span className="brand-mark">N1</span>
            <span>N1<b>Hub</b></span>
          </a>
          <nav className="nav-group" aria-label="Primary navigation">
            <p>{session.role === 'clinician' ? 'Workspace' : 'My health'}</p>
            {nav.map((n) => (
              <a key={n.label} href={n.href} className={`nav-item ${isActive(n) ? 'active' : ''}`} aria-current={isActive(n) ? 'page' : undefined}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {n.badge ? <b>{n.badge}</b> : null}
              </a>
            ))}
          </nav>
          {secondary.length > 0 && (
            <nav className="nav-group secondary">
              <p>More</p>
              {secondary.map((n) => (
                <a key={n.label} href={n.href} className={`nav-item ${isActive(n) ? 'active' : ''}`}>
                  <Icon name={n.icon} />
                  <span>{n.label}</span>
                </a>
              ))}
            </nav>
          )}
          <DemoCard />
          <div className="profile">
            <div className="avatar">{initials(session.name)}</div>
            <div>
              <strong>{session.name}</strong>
              <span>{subtitle}</span>
            </div>
            <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={signOut}>
              <Icon name="logout" />
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <Search placeholder={searchPlaceholder} items={searchItems} />
            <div className="top-actions">
              <DataSourceBadge />
              {/* Bell removed from the clinician view at our human's request (the Patients home already shows what needs attention). */}
              {session.role !== 'clinician' && (
                <>
                  <span className="divider" />
                  <button className="icon-btn" aria-label={`${notifications} items need attention`} title="Needs attention" onClick={onNotifications}>
                    <Icon name="bell" />
                    {notifications > 0 && <i />}
                  </button>
                </>
              )}
            </div>
          </header>
          <div className="content">
            {children}
            <footer className="app-footer">
              Not diagnostic: results are worth discussing with your clinician.
              <br />Demo data. Includes data from PMData (Thambawita et al., MMSys 2020, CC BY-NC 4.0).
            </footer>
          </div>
        </main>
        {notice && <div className="toast" role="status"><Icon name="check" />{notice}</div>}
      </div>
    </ToastCtx.Provider>
  )
}

function Search({ placeholder, items }: { placeholder: string; items: SearchItem[] }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus() } }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return items.filter((i) => `${i.label} ${i.sub ?? ''}`.toLowerCase().includes(t)).slice(0, 7)
  }, [q, items])
  return (
    <label className="search">
      <Icon name="search" />
      <input ref={ref} aria-label="Search" placeholder={placeholder} value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      <kbd>⌘ K</kbd>
      {open && hits.length > 0 && (
        <div className="search-results">
          {hits.map((h) => (
            <button key={h.href + h.label} onMouseDown={(e) => e.preventDefault()} onClick={() => { navigate(h.href.replace(/^#/, '')); setQ(''); setOpen(false) }}>
              <Icon name={h.icon} size={16} />
              <span><strong>{h.label}</strong>{h.sub && <span className="muted small"> · {h.sub}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </label>
  )
}

function DataSourceBadge() {
  const [ds, setDs] = useState(getDataSource())
  const [store, setStore] = useState<string | null>(null)
  useEffect(() => onDataSourceChange(() => setDs(getDataSource())), [])
  useEffect(() => {
    if (ds.source !== 'live') { setStore(null); return }
    api.health().then((h) => setStore(h.store ?? null)).catch(() => setStore(null))
  }, [ds.source])
  return (
    <span className={`pill ${ds.source === 'live' ? 'pill-green' : 'pill-gray'}`} title={ds.source === 'live' ? `Connected to ${API_URL}${store ? ` · store: ${store}` : ''}` : `Using built-in sample data${ds.fellBack ? ` (couldn't reach ${API_URL})` : ''}`}>
      {ds.source === 'live' ? 'Live API' : ds.fellBack ? 'Offline · sample data' : 'Sample data'}
    </span>
  )
}

function DemoCard() {
  const [ds, setDs] = useState(getDataSource())
  const [resetting, setResetting] = useState(false)
  const toast = useToast()
  useEffect(() => onDataSourceChange(() => setDs(getDataSource())), [])
  // Restores the seed state (seeded plans, demo accounts, connections). Press before the pitch / between judges.
  const reset = async () => {
    if (!window.confirm('Reset the demo? This removes every plan and connection change made since the demo started and restores the starting data.')) return
    setResetting(true)
    try { await api.demoReset(); toast('Demo data restored') }
    catch (e) { toast(friendlyError(e)) }
    finally { setResetting(false) }
  }
  return (
    <div className="sidebar-card">
      <span><Icon name="sparkles" size={15} /> Demo mode</span>
      <p>Plans run instantly on recorded data.</p>
      <div className="row">
        {ds.source === 'live'
          ? <button className="link-btn" onClick={() => setDataSource('fixtures')}>Use sample data <Icon name="chevron" size={13} /></button>
          : <button className="link-btn" onClick={() => setDataSource('live')}>Try live API <Icon name="chevron" size={13} /></button>}
        <button className="link-btn" style={{ color: '#8d8d98' }} disabled={resetting} onClick={reset}>{resetting ? 'Resetting…' : 'Reset demo'}</button>
      </div>
    </div>
  )
}
