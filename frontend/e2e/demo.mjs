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
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_REFUSED')) errors.push('console: ' + m.text()) })
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
async function signInAs(role, account) {
  const out = await page.$('button[aria-label="Sign out"]')
  if (out) { await out.click(); await sleep(500) }
  await click(role === 'clinician' ? "I'm a clinician" : "I'm a patient", '.role-card')
  await click(account, '.account'); await click('Continue as'); await sleep(900)
}
const verdictOnPage = async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return ['Likely real', 'Suggestive', 'Probably chance', 'Not enough data'].find((v) => t.includes(v))
}
const planIdFromUrl = () => decodeURIComponent(page.url().split('/plans/')[1] ?? '')

async function createPlan(patient, { intervention = false, grayOutDemo = false } = {}) {
  await signInAs('clinician', 'Dr. Rivera')
  await page.evaluate(() => { location.hash = '/new' }); await sleep(600)
  await click(patient, '.option'); await click('Next')
  if (grayOutDemo) {
    await click('Fitbit', '.option'); await click('Next')
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
  if (intervention) { await click('Intervention (A/B trial)'); await sleep(700) }
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

await page.goto(URL + '/#/')
await page.evaluate((live) => { localStorage.clear(); localStorage.setItem('n1.dataSource', live ? 'live' : 'fixtures') }, LIVE)
await page.goto(URL + '/#/'); await sleep(1000)

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
