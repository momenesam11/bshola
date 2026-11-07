// Creates .env.backup by asking for each value. Run: npm run backup:setup
// The answers stay on this machine: .env.* files are ignored by git.

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { findPgBin, parseEnv } from './lib.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const path = join(ROOT, '.env.backup')
const existing = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}
const rl = createInterface({ input: process.stdin, output: process.stdout })

async function ask(label, key, check) {
  for (;;) {
    const hint = existing[key] ? ' (Enter = keep the current value)' : ''
    const answer = (await rl.question(`\n${label}${hint}\n> `)).trim() || existing[key] || ''
    const problem = check(answer)
    if (!problem) return answer
    console.log(`  ${problem}`)
  }
}

const validUrl = (v, fn) => {
  try { return fn(new URL(v)) } catch { return 'That does not look like a full address. Paste it again.' }
}

const databaseUrl = await ask('1. Supabase database address (Connect > Session pooler), with your password in it:', 'DATABASE_URL',
  (v) => validUrl(v, (u) => {
    if (!u.protocol.startsWith('postgres')) return 'It should start with postgresql://'
    if (!u.password || u.password.includes('YOUR-PASSWORD')) return 'Replace [YOUR-PASSWORD] with your real database password.'
    return ''
  }))
const supabaseUrl = await ask('2. Project URL (https://....supabase.co):', 'SUPABASE_URL',
  (v) => validUrl(v, (u) => (u.protocol === 'https:' ? '' : 'It should start with https://')))
const serviceKey = await ask('3. Service role key (Settings > API Keys):', 'SUPABASE_SERVICE_ROLE_KEY',
  (v) => (v.length > 20 ? '' : 'That looks too short.'))
const backupDir = await ask('4. Backup folder inside Google Drive (for example G:\\My Drive\\beshola-backup):', 'BACKUP_DIR',
  (v) => (v ? '' : 'A folder is required.'))
rl.close()

const isNewPassphrase = !existing.BACKUP_PASSPHRASE
const passphrase = existing.BACKUP_PASSPHRASE || randomBytes(24).toString('base64url')

mkdirSync(backupDir, { recursive: true })
writeFileSync(path, [
  `DATABASE_URL=${databaseUrl}`,
  `SUPABASE_URL=${supabaseUrl}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
  `BACKUP_DIR=${backupDir}`,
  `BACKUP_PASSPHRASE=${passphrase}`,
  `BACKUP_KEEP=${existing.BACKUP_KEEP || 30}`,
  ...(existing.PG_BIN ? [`PG_BIN=${existing.PG_BIN}`] : []),
  '',
].join('\n'))

console.log('\nSaved .env.backup')
if (!findPgBin(existing.PG_BIN)) console.log('Note: PostgreSQL was not found in C:\\Program Files\\PostgreSQL. Install it first.')
if (isNewPassphrase) {
  console.log('\n================ SAVE THIS NOW ================')
  console.log(passphrase)
  console.log('================================================')
  console.log('This passphrase opens your backups. Keep a copy OUTSIDE this computer.')
  console.log('If this computer dies and the passphrase is lost, the backups cannot be opened.')
}
