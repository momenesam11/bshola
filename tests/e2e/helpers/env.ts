import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Minimal .env loader (no new dependency) — reads KEY=VALUE lines, skips
// comments/blanks, never overwrites a var that's already set in the
// environment. Loads .env (Supabase URL/anon key, shared with the app)
// and .env.test.local (service-role key + admin password — gitignored via
// the existing `*.local` rule, never committed).
function loadFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export function loadEnv() {
  const root = path.resolve(__dirname, '..', '..', '..')
  loadFile(path.join(root, '.env.test.local'))
  loadFile(path.join(root, '.env'))
}
