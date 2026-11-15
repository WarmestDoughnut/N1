// Smoke test of the CLAUDE.md §10 demo script, driving the real UI in headless Chrome.
// Usage: npm run dev (in another terminal), then `npm run e2e [-- --live] [--shots=DIR]`
//   --live   use the live API instead of sample data
//   CHROME=/path/to/chrome to override the browser.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const LIVE = args.includes('--live')
const SHOTS = args.find((a) => a.startsWith('--shots='))?.slice(8)
const URL = process.env.APP_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1440, height: 950 } })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
// "Failed to load resource" console lines carry no URL, so track HTTP failures via responses instead.
const EXPECTED = (r) =>
  (r.status() === 401 && /\/api\/auth\/login$/.test(r.url())) || // the deliberate wrong-password check
  (r.status() === 404 && /\/results$/.test(r.url())) // results not computed yet
page.on('response', (r) => { if (r.status() >= 400 && !EXPECTED(r)) errors.push(`http ${r.status()}: ${r.url()}`) })
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && !t.includes('ERR_CONNECTION_REFUSED') && !t.startsWith('Failed to load resource')) errors.push('console: ' + t)
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }) }
async function click(text, sel = 'button, a') {
  const ok = await page.evaluate((text, sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text) && !e.disabled)
    if (el) el.click()
    return !!el
  }, text, sel)
  if (!ok) throw new Error(`nothing clickable with text "${text}" (${sel})`)
  await sleep(400)
}
async function signOut() {
  const out = await page.$('button[aria-label="Sign out"]')
  if (out) { await out.click(); await sleep(500) }
}
async function signInAs(role, account) {
  await signOut()
  await click(role === 'clinician' ? 'Clinicians' : 'Patients', '.seg button')
  await click(account, '.account')
  await click('Sign in', 'button[type="submit"]'); await sleep(900)
  if (await page.$('button[aria-label="Sign out"]') == null) throw new Error(`sign-in as ${account} failed`)
}
const bodyText = () => page.evaluate(() => document.body.innerText)
const verdictOnPage = async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return ['Likely real', 'Suggestive', 'Probably chance', 'Not enough data'].find((v) => t.includes(v))
}
const planIdFromUrl = () => decodeURIComponent(page.url().split('/plans/')[1] ?? '')

async function createPlan(patient, { intervention = false, grayOutDemo = false } = {}) {
  await signInAs('clinician', 'Dr. Rivera')
  await page.evaluate(() => { location.hash = '/new' }); await sleep(600)
  await page.waitForSelector('.option', { timeout: 10000 }) // patients load async
  await click(patient, '.option'); await click('Next')
  if (grayOutDemo) {
    // Wait until the device catalog has rendered (it loads async), then until the signals step shows its grayed row.
    await page.waitForFunction(() => [...document.querySelectorAll('.option')].some((e) => e.textContent.includes('Fitbit')), { timeout: 10000 })
    await click('Fitbit', '.option'); await click('Next')
    await page.waitForSelector('.option.unavailable', { timeout: 10000 })
    const grayed = await page.evaluate(() => [...document.querySelectorAll('.option.unavailable .title')].map((e) => e.textContent))
    if (!grayed.includes('Sleep')) throw new Error('Sleep should be grayed out with iPhone only, got ' + grayed)
    console.log('✓ iPhone only → Sleep grayed out')
    await shot('01-grayed')
    await click('Back'); await click('Fitbit', '.option'); await click('Next')
    const sel = await page.evaluate(() => [...document.querySelectorAll('.option.selected .title')].map((e) => e.textContent))
    if (!sel.includes('Sleep')) throw new Error('Sleep should unlock after adding Fitbit')
    console.log('✓ add Fitbit → Sleep unlocks')
  } else await click('Next')
  await click('Next')
  if (intervention) {
    await click('A/B trial'); await sleep(900) // matches 'Intervention (A/B trial)' and 'Try a change (A/B trial)'
    // Live demo data follows a recorded schedule; use it when offered (sample mode has none).
    const rec = await page.evaluate(() => !![...document.querySelectorAll('button')].find((b) => b.textContent.includes('Use recorded schedule')))
    if (rec) { await click('Use recorded schedule'); await sleep(300); console.log('✓ used the recorded A/B schedule') }
  }
  await click('Next'); await click('Send to patient'); await sleep(700)
  return planIdFromUrl()
}
async function approveAndRun(patient, id) {
  await signInAs('patient', patient)
  await page.evaluate((id) => { location.hash = '/plans/' + encodeURIComponent(id) }, id); await sleep(800)
  await click('Approve'); await sleep(500)
  await click('Simulate complete'); await sleep(1800)
}
async function clinicianVerdict(id, name) {
  await signInAs('clinician', 'Dr. Rivera')
  await page.evaluate((id) => { location.hash = '/plans/' + encodeURIComponent(id) }, id); await sleep(1800)
  await shot(name)
  return verdictOnPage()
}

// Live: start from the seed state (backend v1.3 POST /api/demo/reset) so runs are repeatable and
// don't pile up duplicate plans. Each run then leaves exactly one finished example per demo patient.
if (LIVE) {
  const API = process.env.API_URL ?? 'http://localhost:8000'
  const r = await fetch(`${API}/api/demo/reset`, { method: 'POST' })
  if (!r.ok) throw new Error(`demo reset failed: HTTP ${r.status}`)
  console.log('✓ live demo data reset to seed state')
}

await page.goto(URL + '/#/')
await page.evaluate((live) => { localStorage.clear(); localStorage.setItem('n1.dataSource', live ? 'live' : 'fixtures') }, LIVE)
await page.reload(); await sleep(1000) // a same-URL goto doesn't reload, and the data source is read at load
const mode = await page.evaluate(() => localStorage.getItem('n1.dataSource'))
console.log(`mode: ${mode === 'live' ? 'LIVE API' : 'sample data'}`)

// ---- login + connections ----
await signOut()
await page.type('#email', 'rivera@n1hub.demo'); await page.type('#pw', 'wrong')
await click('Sign in', 'button[type="submit"]'); await sleep(500)
if (!(await bodyText()).includes("don't match")) throw new Error('bad password should show an error')
console.log('✓ wrong password rejected')

await signInAs('patient', 'Dana')
await page.evaluate(() => { location.hash = '/care-team' }); await sleep(600)
await page.type('#code', 'RIV-482'); await click('Send request'); await sleep(600)
if (!(await bodyText()).includes('Waiting for approval')) throw new Error('Dana request should be pending')
console.log('✓ patient adds clinician by code → pending')
await shot('00-care-team')

await signInAs('clinician', 'Dr. Rivera')
await page.evaluate(() => { location.hash = '/connections' }); await sleep(800)
if (!(await bodyText()).includes('Connection requests')) throw new Error('Rivera should see requests')
const beforeHasDana = (await page.evaluate(() => [...document.querySelectorAll('.patient-row strong')].map((e) => e.textContent))).some((t) => t.startsWith('Dana'))
if (beforeHasDana && !(await bodyText()).includes('Wants to add you')) throw new Error('Dana listed before accepting')
await shot('00-requests')
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.patient-row')].find((r) => r.textContent.includes('Dana'))
  ;[...row.querySelectorAll('button')].find((b) => b.textContent.includes('Accept')).click()
}); await sleep(1200)
await page.evaluate(() => { location.hash = '/new' }); await sleep(800)
const opts = await page.evaluate(() => [...document.querySelectorAll('.option .title')].map((e) => e.textContent))
if (!opts.some((t) => t.startsWith('Dana'))) throw new Error('Dana should be selectable after accepting, got ' + opts)
if (opts.some((t) => t.startsWith('Leo'))) throw new Error('Leo (pending) must not be selectable')
console.log('✓ clinician accepts → patient appears in wizard; pending patient does not')

const expect = []
const p1 = await createPlan('Maria', { grayOutDemo: true }); await approveAndRun('Maria', p1)
expect.push(['P01-MARIA observational', await clinicianVerdict(p1, '02-maria'), 'Likely real'])
const p2 = await createPlan('James'); await approveAndRun('James', p2)
expect.push(['P02-JAMES observational', await clinicianVerdict(p2, '03-james'), 'Probably chance'])
const p3 = await createPlan('Aisha', { intervention: true }); await approveAndRun('Aisha', p3)
expect.push(['P03-AISHA A/B', await clinicianVerdict(p3, '04-aisha'), 'Likely real'])
await page.evaluate(() => { location.hash = '/' }); await sleep(1500); await shot('05-overview')

let failed = errors.length > 0
for (const [what, got, want] of expect) {
  const ok = got === want
  if (!ok) failed = true
  console.log(`${ok ? '✓' : '✗'} ${what}: ${got} (expected ${want})`)
}
console.log(errors.length ? `✗ page errors:\n  ${errors.join('\n  ')}` : '✓ no page errors')
await browser.close()
process.exit(failed ? 1 : 0)
