// Creates .env.backup by asking for each value. Run: npm run backup:setup
// The answers stay on this machine: .env.* files are ignored by git.

import { spawnSync } from 'node:child_process'
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
const backupDir = existing.BACKUP_DIR || 'E:\\beshola-backup'
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
  `BACKUP_GITHUB_REPO=${existing.BACKUP_GITHUB_REPO || 'momenesam11/beshola-backups'}`,
  ...(existing.PG_BIN ? [`PG_BIN=${existing.PG_BIN}`] : []),
  '',
].join('\n'))

console.log('\nSaved .env.backup')

// The private repo that holds the off-site copy. Safe to run again.
const repo = existing.BACKUP_GITHUB_REPO || 'momenesam11/beshola-backups'
const gh = (...args) => spawnSync('gh', args, { encoding: 'utf8' })
if (gh('repo', 'view', repo).status !== 0) {
  const made = gh('repo', 'create', repo, '--private', '--add-readme', '--description', 'Encrypted backups. Private.')
  if (made.status !== 0) console.log(`Could not create ${repo}: ${String(made.stderr || made.error).trim()}`)
}
const visibility = gh('repo', 'view', repo, '--json', 'visibility', '--jq', '.visibility').stdout?.trim()
if (visibility === 'PRIVATE') {
  for (const [tag, title] of [['db', 'Database backups'], ['files', 'File backups']]) {
    if (gh('release', 'view', tag, '--repo', repo).status !== 0) {
      gh('release', 'create', tag, '--repo', repo, '--title', title, '--notes', 'Encrypted backups.')
    }
  }
  console.log(`Off-site copy ready: ${repo} (private)`)
} else {
  console.log(`WARNING: ${repo} is not ready or not private (${visibility || 'not found'}). Backups will not upload.`)
}
if (!findPgBin(existing.PG_BIN)) console.log('Note: PostgreSQL tools were not found. Unzip them into E:\\beshola-tools first. See docs/backup.md')
if (isNewPassphrase) {
  console.log('\n================ SAVE THIS NOW ================')
  console.log(passphrase)
  console.log('================================================')
  console.log('This passphrase opens your backups. Keep a copy OUTSIDE this computer.')
  console.log('If this computer dies and the passphrase is lost, the backups cannot be opened.')
}
