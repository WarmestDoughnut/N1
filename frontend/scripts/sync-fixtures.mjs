// Copies ../shared/fixtures/*.json into src/fixtures/ (read-only use; originals are never edited).
import { readdirSync, copyFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', 'shared', 'fixtures')
const dst = join(here, '..', 'src', 'fixtures')
mkdirSync(dst, { recursive: true })
for (const f of readdirSync(dst)) if (f.endsWith('.json')) rmSync(join(dst, f))
if (!existsSync(src)) { console.log('[fixtures] no shared/fixtures dir; using built-in mocks'); process.exit(0) }
const files = readdirSync(src).filter((f) => f.endsWith('.json'))
for (const f of files) copyFileSync(join(src, f), join(dst, f))
console.log(`[fixtures] copied ${files.length} file(s) from shared/fixtures`)
