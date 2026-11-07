// Daily backup: database and Supabase Storage files, encrypted, into BACKUP_DIR
// (a Google Drive folder). Reads production only. Run: npm run backup
// Setup and restore steps: docs/backup.md

import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import {
  backupFileName, backupsToDelete, COUNTS_SQL, decryptFileToBuffer, encryptBufferToFile,
  encryptStreamToFile, findPgBin, listBucketFiles, loadBackupConfig, parseCounts,
  pgEnvFromUrl, planFileSync, planRemoteUpload, remoteToDelete,
} from './lib.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCHEMAS = ['public', 'auth', 'storage']

function tool(bin, name) {
  return bin ? join(bin, `${name}.exe`) : name
}

async function backupDatabase(config, bin, dbDir, date) {
  const name = backupFileName(date)
  const child = spawn(tool(bin, 'pg_dump'), [
    '--format=custom', '--no-owner', '--no-privileges',
    ...SCHEMAS.map((s) => `--schema=${s}`),
  ], { env: pgEnvFromUrl(config.DATABASE_URL), stdio: ['ignore', 'pipe', 'pipe'] })

  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d })
  // Resolves either way: a rejection here would crash the process before the
  // failure could be written to LAST_STATUS.txt and shown on screen.
  const exited = new Promise((res) => {
    child.on('error', (err) => res({ startError: err.code }))
    child.on('close', (code) => res({ code }))
  })

  const dest = join(dbDir, name)
  let streamError = null
  try {
    await encryptStreamToFile(child.stdout, dest, config.BACKUP_PASSPHRASE)
  } catch (err) {
    streamError = err
  }
  const { startError, code } = await exited
  if (startError) throw new Error(`pg_dump could not start (${startError}). Is PostgreSQL installed?`)
  if (streamError || code !== 0) {
    rmSync(dest, { force: true })
    throw new Error(`pg_dump failed: ${stderr.trim().slice(0, 500) || streamError?.message}`)
  }

  const counts = spawnSync(tool(bin, 'psql'), ['-At', '-F', '|', '-c', COUNTS_SQL], {
    env: pgEnvFromUrl(config.DATABASE_URL), encoding: 'utf8',
  })
  if (counts.status !== 0) throw new Error(`Row count failed: ${String(counts.stderr).trim().slice(0, 500)}`)
  writeFileSync(`${dest}.counts.json`, JSON.stringify(parseCounts(counts.stdout), null, 2))
  return { name, size: statSync(dest).size }
}

async function backupFiles(config, filesDir, now) {
  const baseUrl = config.SUPABASE_URL.replace(/\/$/, '')
  const headers = { apikey: config.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}` }

  const bucketsRes = await fetch(`${baseUrl}/storage/v1/bucket`, { headers })
  if (!bucketsRes.ok) throw new Error(`Listing buckets failed: HTTP ${bucketsRes.status}`)
  const remote = []
  for (const b of await bucketsRes.json()) {
    remote.push(...await listBucketFiles(fetch, baseUrl, config.SUPABASE_SERVICE_ROLE_KEY, b.id))
  }

  const indexPath = join(filesDir, 'index.json.enc')
  const index = existsSync(indexPath)
    ? JSON.parse((await decryptFileToBuffer(indexPath, config.BACKUP_PASSPHRASE)).toString('utf8'))
    : {}
  const { download, remove, nextIndex } = planFileSync(remote, index, now, config.BACKUP_KEEP)

  let downloaded = 0
  for (const f of download) {
    const url = `${baseUrl}/storage/v1/object/${encodeURIComponent(f.bucket)}/${f.path.split('/').map(encodeURIComponent).join('/')}`
    const res = await fetch(url, { headers })
    if (!res.ok || !res.body) throw new Error(`Downloading a file from ${f.bucket} failed: HTTP ${res.status}`)
    await encryptStreamToFile(Readable.fromWeb(res.body), join(filesDir, `${f.key}.enc`), config.BACKUP_PASSPHRASE)
    nextIndex[f.key] = { bucket: f.bucket, path: f.path, version: f.version }
    downloaded++
  }
  for (const key of remove) rmSync(join(filesDir, `${key}.enc`), { force: true })

  await encryptBufferToFile(Buffer.from(JSON.stringify(nextIndex)), indexPath, config.BACKUP_PASSPHRASE)
  return { total: Object.keys(nextIndex).length, downloaded, removed: remove.length }
}

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`GitHub upload failed: ${String(r.stderr || r.error).trim().slice(0, 500)}`)
  return r.stdout
}

const remoteAssets = (repo, tag) =>
  gh(['release', 'view', tag, '--repo', repo, '--json', 'assets', '--jq', '.assets[].name']).split(/\r?\n/).filter(Boolean)

/** Sends the encrypted files off this computer. They are already encrypted here. */
function uploadOffsite(config, dbDir, filesDir) {
  const repo = config.BACKUP_GITHUB_REPO
  // The files are encrypted, but they still never go to a repo anyone can read.
  const visibility = gh(['repo', 'view', repo, '--json', 'visibility', '--jq', '.visibility']).trim()
  if (visibility !== 'PRIVATE') throw new Error(`${repo} is not private (${visibility}). Nothing was uploaded.`)
  const dbRemote = remoteAssets(repo, 'db')
  const dbNew = planRemoteUpload(readdirSync(dbDir), dbRemote)
  for (const name of dbNew) gh(['release', 'upload', 'db', join(dbDir, name), '--repo', repo])
  const after = [...dbRemote, ...dbNew]
  const stale = remoteToDelete(after, config.BACKUP_KEEP)
  for (const name of stale) gh(['release', 'delete-asset', 'db', name, '--repo', repo, '-y'])

  const filesRemote = remoteAssets(repo, 'files')
  const filesLocal = readdirSync(filesDir)
  const filesNew = planRemoteUpload(filesLocal.filter((n) => n !== 'index.json.enc'), filesRemote)
  for (const name of filesNew) gh(['release', 'upload', 'files', join(filesDir, name), '--repo', repo])
  // The list of files changes every run, so it replaces the previous copy.
  gh(['release', 'upload', 'files', join(filesDir, 'index.json.enc'), '--repo', repo, '--clobber'])
  const gone = filesRemote.filter((n) => n !== 'index.json.enc' && !filesLocal.includes(n))
  for (const name of gone) gh(['release', 'delete-asset', 'files', name, '--repo', repo, '-y'])

  return { db: dbNew.length, files: filesNew.length, removed: stale.length + gone.length }
}

async function main() {
  const config = loadBackupConfig(ROOT)
  const dir = config.BACKUP_DIR
  const dbDir = join(dir, 'db')
  const filesDir = join(dir, 'files')
  mkdirSync(dbDir, { recursive: true })
  mkdirSync(filesDir, { recursive: true })

  const started = new Date()
  const logLine = (text) => {
    const line = `${new Date().toISOString()} ${text}`
    console.log(line)
    appendFileSync(join(dir, 'backup.log'), `${line}\n`)
  }

  try {
    const bin = findPgBin(config.PG_BIN)
    const db = await backupDatabase(config, bin, dbDir, started)
    logLine(`database ok: ${db.name} (${(db.size / 1024 / 1024).toFixed(1)} MB)`)

    const files = await backupFiles(config, filesDir, started.getTime())
    logLine(`files ok: ${files.total} kept, ${files.downloaded} new or changed, ${files.removed} removed`)

    if (config.BACKUP_GITHUB_REPO) {
      const sent = uploadOffsite(config, dbDir, filesDir)
      logLine(`off-site ok: ${sent.db} database files and ${sent.files} files sent, ${sent.removed} old removed`)
    }

    // Only after a fully successful run, so failures never eat into good backups.
    for (const old of backupsToDelete(readdirSync(dbDir), config.BACKUP_KEEP)) {
      rmSync(join(dbDir, old), { force: true })
      rmSync(join(dbDir, `${old}.counts.json`), { force: true })
      logLine(`removed old backup: ${old}`)
    }
    writeFileSync(join(dir, 'LAST_STATUS.txt'), `OK ${new Date().toISOString()} ${db.name}\n`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logLine(`FAILED: ${message}`)
    writeFileSync(join(dir, 'LAST_STATUS.txt'), `FAILED ${new Date().toISOString()} ${message}\n`)
    // A backup that fails silently is worse than none. msg.exe pops up on screen.
    spawnSync('msg', ['*', 'بسهولة: الباك اب فشل. افتح backup.log في فولدر الباك اب.'], { stdio: 'ignore' })
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
