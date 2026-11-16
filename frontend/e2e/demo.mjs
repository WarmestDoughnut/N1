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
  (r.status() === 404 && /\/results$/.test(r.url())) || // results not computed yet
  (r.status() === 404 && /\/api\/patients\/[^/]+\/episodes$/.test(r.url())) || // patient log list (falls back to this browser until the backend ships it)
  // v1.5 endpoints the frontend calls before the backend ships them (handled: falls back to the mock)
  (r.status() === 404 && /\/api\/(patients\/[^/]+\/symptoms|plans\/[^/]+\/(notes|analyses|results\/(comment|review)))/.test(r.url()))
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
    const sel = await page.evaluate(() => [...document.querySelectorAll('.option:not(.unavailable) .title')].map((e) => e.textContent))
    if (!sel.includes('Sleep')) throw new Error('Sleep should unlock after adding Fitbit')
    console.log('✓ add Fitbit → Sleep unlocks')
  } else await click('Next')
  await click('Next')
  if (intervention) {
    await click('A/B trial'); await sleep(900) // matches 'Intervention (A/B trial)' and 'Try a change (A/B trial)'
    // Live demo data follows a recorded schedule; use it when offered (sample mode has none).
    const rec = await page.evaluate(() => !![...document.querySelectorAll('button')].find((b) => b.textContent.includes('Use recorded schedule')))
    if (rec) { await click('Use recorded schedule'); await sleep(300); console.log('✓ used the recorded A/B schedule') }
    else {
      // Nothing is pre-filled: choose the outcome and name both options (slot 1 opens by itself).
      await click('Sleep', '.td-editor .td-chip'); await click('higher', '.td-editor .seg button'); await click('Done')
      await click('What you are trying', '.td-slot')
      await page.type('#b', 'Melatonin 3mg'); await page.type('#a', 'No melatonin'); await click('Done')
      // Place periods on the calendar: first period by clicking its first and last day, the second by one click
      // (same length as its partner), repeat that rhythm to 12, then let the coin flip assign A/B per pair.
      const day0 = await page.evaluate(() => document.querySelector('.sc-day[data-date]').dataset.date)
      const plus = (n) => new Date(Date.parse(day0 + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
      const clickDay = async (d) => { const el = await page.$(`[data-date="${d}"]`); await el.scrollIntoView(); const bb = await el.boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(250) }
      // Paint A (drag 6 days), then B one click later (same length), repeat that pattern for 12 weeks,
      // and let the coin decide A/B per pair (optional, gives the full-strength result).
      const dragDays = async (a, z) => { const box = async (d) => { const el = await page.$(`[data-date="${d}"]`); await el.scrollIntoView(); const bb = await el.boundingBox(); return [bb.x + bb.width / 2, bb.y + bb.height / 2] }; const [x1, y1] = await box(a); const [x2, y2] = await box(z); await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 6 }); await page.mouse.up(); await sleep(250) }
      await click('A · ', '.sc-toolbar button'); await dragDays(day0, plus(5))
      await click('B · ', '.sc-toolbar button'); await clickDay(plus(8))
      await page.type('[aria-label="Weeks"]', '12'); await click('Repeat', '.sc-fill button')
      await click('Randomize for me'); await sleep(400)
    }
  } else {
    // Pattern test: nothing is pre-filled. Pick the signal and the direction (slot 2 opens by itself).
    // Slot 1 opens first: what the test explains = the patient's own symptom (v1.5 B1).
    await page.waitForSelector('.td-editor .td-chip', { timeout: 10000 })
    await page.evaluate(() => document.querySelector('.td-editor .td-chip').click()); await sleep(300); await click('Done')
    await click('What might come first', '.td-slot')
    await click('Sleep', '.td-chip'); await click('lower', '.td-editor .seg button'); await click('Done')
    await click('How far back', '.td-slot'); await page.type('[aria-label="Shortest look-back"]', '1'); await page.type('[aria-label="Longest look-back"]', '3'); await click('Done')
    await click('Over what dates', '.td-slot'); await click('All past data', '.td-editor button'); await click('Done')
  }
  await click('Next'); await click('Send to patient'); await sleep(700)
  return planIdFromUrl()
}
async function approveAndRun(patient, id) {
  await signInAs('patient', patient)
  await page.evaluate((id) => { location.hash = '/plans/' + encodeURIComponent(id) }, id); await sleep(800)
  await click('Approve'); await sleep(900)
  // v1.6: a past-only window is shared (and analysed) at approval; prospective/mixed plans still use the demo button.
  const canSimulate = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Simulate complete') && !b.disabled))
  if (canSimulate) { await click('Simulate complete'); await sleep(1800) } else await sleep(1500)
}
// Patient comments (our human asked us to make sure patients can comment on tests).
async function patientComment(id, text) {
  // assumes the patient is signed in (right after approveAndRun)
  await page.evaluate((id) => { location.hash = '/plans/' + encodeURIComponent(id) }, id); await sleep(900)
  await page.waitForSelector('[aria-label="Add a note"]', { timeout: 10000 })
  await page.type('[aria-label="Add a note"]', text)
  await click('Send comment'); await sleep(900)
  if (!(await bodyText()).includes(text)) throw new Error('patient comment did not appear on the patient page')
  console.log('✓ patient can comment on a test')
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
const comment = `e2e: slept badly before Tuesday's migraine (${Date.now() % 100000})`
await patientComment(p1, comment)
expect.push(['P01-MARIA observational', await clinicianVerdict(p1, '02-maria'), 'Likely real'])
expect.push(["Clinician sees the patient's comment", (await bodyText()).includes(comment) ? 'yes' : 'no', 'yes'])
// Data & graphs (our human: all shared data, overlay, summary stats). Maria's test is now shared.
await page.evaluate(() => { location.hash = '/patients/P01-MARIA/data' }); await sleep(800)
const dx = await page.waitForSelector('table[aria-label="Summary statistics"] tbody tr', { timeout: 15000 }).then(() => true).catch(() => false)
const dxLines = await page.evaluate(() => document.querySelectorAll('.recharts-line-curve').length)
await shot('02b-data-graphs')
expect.push(['Data & graphs: chart + summary statistics for shared data', dx && dxLines > 0 ? 'yes' : `no (stats=${dx}, lines=${dxLines})`, 'yes'])
const p2 = await createPlan('James'); await approveAndRun('James', p2)
expect.push(['P02-JAMES observational', await clinicianVerdict(p2, '03-james'), 'Probably chance'])
// Amendment fe-main #14: A/B tests are future-only; the demo approves the seeded, recorded A/B plan.
// "Simulate complete" was removed (our human): approving the seeded prospective plan can't finish it,
// so the A/B verdict is read from the pre-completed DONE-P03-AISHA (same schedule and data).
const p3 = 'DEMO-P03-AISHA'; await approveAndRun('Aisha', p3)
if (mode === 'live') expect.push(['P03-AISHA A/B', await clinicianVerdict('DONE-P03-AISHA', '04-aisha'), 'Likely real'])
else {
  // sample data has no pre-completed plans; check the verdict only while the plan can still be finished here
  const v = await clinicianVerdict(p3, '04-aisha')
  if (v) expect.push(['P03-AISHA A/B', v, 'Likely real']); else console.log('· P03-AISHA A/B verdict skipped in sample mode (no Simulate; live checks DONE-P03-AISHA)')
}
// Live only: the seeded phone-only patient (backend v1.4, P08-SAM). Late-night screen time precedes migraines.
if (LIVE) {
  const sam = 'DEMO-P08-SAM'
  await approveAndRun('Sam', sam)
    // backend demo (0be204c): Sam's pre-completed test is the honest negative (total screen time → probably chance)
  expect.push(['P08-SAM total screen time, pre-completed (phone only)', await clinicianVerdict('DONE-P08-SAM', '04b-sam'), 'Probably chance'])
}
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
