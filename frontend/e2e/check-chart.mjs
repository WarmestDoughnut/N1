// Asserts every recharts plot fills its container (guards against the "squished chart" regression).
// Usage: node e2e/check-chart.mjs <hash-route> [--live]   (signs in as Dr. Rivera)
import puppeteer from 'puppeteer-core'
const [route = '/', flag] = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1440, height: 950 } })
const p = await b.newPage()
await p.goto('http://localhost:5173/#/')
await p.evaluate((live) => {
  localStorage.setItem('n1.dataSource', live ? 'live' : 'fixtures')
  localStorage.setItem('n1.session', JSON.stringify({ role: 'clinician', name: 'Dr. Rivera', accountId: 'acct-rivera', email: 'rivera@n1hub.demo', token: 'acct-rivera', connectCode: 'RIV-482' }))
}, flag === '--live')
await p.goto('http://localhost:5173/#' + route); await p.reload()
await p.waitForSelector('.recharts-wrapper .recharts-line-curve, .recharts-wrapper .recharts-bar-rectangles', { timeout: 15000 }).catch(() => {})
await new Promise((r) => setTimeout(r, 500))
const rows = await p.evaluate(() => [...document.querySelectorAll('.recharts-wrapper')].map((w) => {
  const els = [...w.querySelectorAll('.recharts-line-curve, .recharts-area-area, .recharts-bar-rectangles')]
  if (!els.length) return null
  const l = Math.min(...els.map((e) => e.getBoundingClientRect().left)), r = Math.max(...els.map((e) => e.getBoundingClientRect().right))
  return Math.round(((r - l) / w.getBoundingClientRect().width) * 100)
}))
console.log('plot width as % of chart:', rows)
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT })
await b.close()
process.exit(rows.some((x) => x != null && x < 70) ? 1 : 0)
