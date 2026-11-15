import { useState, type FormEvent } from 'react'
import { api, friendlyError } from '../api'
import type { DemoAccount, Role } from '../types'
import { useAsync } from '../lib/hooks'
import { initials, sessionFrom, signIn } from '../lib/session'
import { Icon } from '../components/Icon'

export function SignIn() {
  const demo = useAsync<DemoAccount[]>(() => api.demoAccounts(), [])
  const [tab, setTab] = useState<Role>('clinician')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!email.trim() || !password) { setErr('Enter your email and password.'); return }
    setBusy(true); setErr(null)
    try {
      const { account, token } = await api.login(email, password)
      signIn(sessionFrom(account, token)) // the account decides: clinician app or patient app
    } catch (ex) {
      setErr(friendlyError(ex))
      setBusy(false)
    }
  }

  const pick = (a: DemoAccount) => { setEmail(a.email); setPassword('demo'); setErr(null) }
  const list = (demo.data ?? []).filter((a) => a.role === tab)

  return (
    <div className="signin">
      <aside className="signin-aside">
        <div className="brand"><span className="brand-mark">N1</span><span>N1 Hub</span></div>
        <div>
          <h1>Turn a clinical hunch into an honest answer.</h1>
          <p>N1 Hub runs structured n-of-1 tests on one patient's own phone and wearable data, then says plainly whether a pattern is likely real or probably chance.</p>
          <ul>
            <li><span><Icon name="shield" size={17} /></span><div><strong>The test plan is the consent.</strong> Patients approve exactly which signals are shared, and for how long.</div></li>
            <li><span><Icon name="people" size={17} /></span><div><strong>Patients choose their care team.</strong> A clinician only sees patients who added them.</div></li>
            <li><span><Icon name="shuffle" size={17} /></span><div><strong>Honest statistics.</strong> Every result is checked against thousands of random shuffles.</div></li>
          </ul>
        </div>
        <div className="cite">Based on n-of-1 trial methodology: Lillie EO et al., Personalized Medicine 2011;8(2):161–173.</div>
      </aside>

      <main className="signin-main">
        <div className="signin-panel">
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to N1 Hub</h2>

          <form onSubmit={submit} className="card" style={{ marginTop: 20 }} noValidate>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="username" placeholder="you@example.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setErr(null) }} />
            </div>
            <div className="field">
              <label htmlFor="pw">Password</label>
              <div style={{ position: 'relative' }}>
                <input id="pw" type={showPw ? 'text' : 'password'} autoComplete="current-password" value={password} style={{ width: '100%', paddingRight: 70 }}
                  onChange={(e) => { setPassword(e.target.value); setErr(null) }} />
                <button type="button" className="link-btn" style={{ position: 'absolute', right: 12, top: 12 }} onClick={() => setShowPw((v) => !v)}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            {err && <div className="alert alert-error mb" role="alert"><Icon name="info" />{err}</div>}
            <button type="submit" className="button primary lg" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Signing in…' : <>Sign in <Icon name="chevron" size={16} /></>}
            </button>
          </form>

          <div className="row-between" style={{ marginTop: 26, marginBottom: 10 }}>
            <span className="chart-title">Demo accounts <span className="muted small" style={{ fontWeight: 500 }}>· password "demo"</span></span>
            <div className="seg" role="tablist">
              <button type="button" className={tab === 'clinician' ? 'active' : ''} onClick={() => setTab('clinician')}>Clinicians</button>
              <button type="button" className={tab === 'patient' ? 'active' : ''} onClick={() => setTab('patient')}>Patients</button>
            </div>
          </div>
          {demo.loading && !demo.data && <div className="spinner">Loading accounts…</div>}
          {demo.error && <div className="alert alert-error">{demo.error}</div>}
          <div className="account-list" style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
            {list.map((a) => (
              <button key={a.email} type="button" className={`account ${email === a.email ? 'selected' : ''}`} onClick={() => pick(a)}>
                <span className="avatar" style={a.role === 'patient' ? { background: '#e4f5f0', color: '#119274' } : undefined}>{initials(a.name)}</span>
                <span className="meta"><strong>{a.name}</strong><small>{a.email} · {a.detail}</small></span>
                {email === a.email ? <Icon name="check" /> : <span className="muted small">Use</span>}
              </button>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 12, textAlign: 'center' }}>Demo build: no real patient data or passwords. Not diagnostic.</p>
        </div>
      </main>
    </div>
  )
}
