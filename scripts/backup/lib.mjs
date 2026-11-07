// Shared pieces of the backup scripts. Everything that can be tested without a
// real database lives here, so the risky parts (encryption, what gets deleted)
// are covered by scripts/backup/lib.test.mjs.

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, readdirSync, readFileSync } from 'node:fs'
import { appendFile, open, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

// File layout: MAGIC + salt + iv + ciphertext + GCM tag. The tag at the end lets
// any change to the file, or a wrong passphrase, be detected on decrypt.
const MAGIC = Buffer.from('BSHB1')
const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 })
}

/**
 * Encrypts a stream straight to dest, so the plain data never touches the disk.
 * Writes to dest.part and renames at the end: a failed run can't leave something
 * that looks like a finished backup, and Google Drive doesn't sync a half file.
 */
export async function encryptStreamToFile(source, dest, passphrase) {
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv)
  const part = `${dest}.part`
  const out = createWriteStream(part)
  out.write(Buffer.concat([MAGIC, salt, iv]))
  try {
    await pipeline(source, cipher, out)
    await appendFile(part, cipher.getAuthTag())
    await rename(part, dest)
  } catch (err) {
    await rm(part, { force: true })
    throw err
  }
}

export const encryptBufferToFile = (buffer, dest, passphrase) =>
  encryptStreamToFile(Readable.from([buffer]), dest, passphrase)

/** Decrypts into a writable stream. Rejects on a wrong passphrase or changed file. */
export async function decryptFileToStream(path, passphrase, target) {
  const { size } = await stat(path)
  if (size < HEADER_LEN + TAG_LEN) throw new Error(`Not a backup file (too small): ${path}`)
  const file = await open(path, 'r')
  const header = Buffer.alloc(HEADER_LEN)
  const tag = Buffer.alloc(TAG_LEN)
  try {
    await file.read(header, 0, HEADER_LEN, 0)
    await file.read(tag, 0, TAG_LEN, size - TAG_LEN)
  } finally {
    await file.close()
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error(`Not a backup file: ${path}`)
  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_LEN)
  const iv = header.subarray(MAGIC.length + SALT_LEN)
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv)
  decipher.setAuthTag(tag)
  const body = size - HEADER_LEN - TAG_LEN
  const source = body > 0
    ? createReadStream(path, { start: HEADER_LEN, end: HEADER_LEN + body - 1 })
    : Readable.from([])
  await pipeline(source, decipher, target)
}

export async function decryptFileToBuffer(path, passphrase) {
  const chunks = []
  const { Writable } = await import('node:stream')
  await decryptFileToStream(path, passphrase, new Writable({
    write(chunk, _enc, done) { chunks.push(chunk); done() },
  }))
  return Buffer.concat(chunks)
}

/** Reads KEY=value lines. Only the first = splits, since values can contain = too. */
export function parseEnv(text) {
  const env = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const at = line.indexOf('=')
    if (at < 1) continue
    env[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
  }
  return env
}

export function loadBackupConfig(root) {
  const path = join(root, '.env.backup')
  if (!existsSync(path)) throw new Error('.env.backup is missing. Run: npm run backup:setup')
  const env = parseEnv(readFileSync(path, 'utf8'))
  for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BACKUP_PASSPHRASE', 'BACKUP_DIR']) {
    if (!env[key]) throw new Error(`${key} is missing from .env.backup`)
  }
  return { ...env, BACKUP_KEEP: Number(env.BACKUP_KEEP) || 30 }
}

/**
 * Connection settings as environment variables, so the password never shows up
 * in a command line where other programs on the machine could read it.
 */
export function pgEnvFromUrl(url, base = process.env) {
  const u = new URL(url)
  const isLocal = isLocalUrl(url)
  return {
    ...base,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || 'postgres',
    PGSSLMODE: isLocal ? 'prefer' : 'require',
  }
}

function isLocalUrl(url) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(url).hostname)
}

/** Newest PostgreSQL install on Windows, otherwise whatever is on PATH. */
export function findPgBin(configured) {
  if (configured) return configured
  const base = 'C:\\Program Files\\PostgreSQL'
  if (!existsSync(base)) return ''
  const versions = readdirSync(base).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a))
  for (const v of versions) {
    const bin = join(base, v, 'bin')
    if (existsSync(join(bin, 'pg_dump.exe'))) return bin
  }
  return ''
}

/** Every file in a bucket. The API returns folders as entries with no id. */
export async function listBucketFiles(fetchFn, baseUrl, serviceKey, bucket, prefix = '') {
  const files = []
  const limit = 1000
  for (let offset = 0; ; offset += limit) {
    const res = await fetchFn(`${baseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!res.ok) throw new Error(`Listing ${bucket} failed: HTTP ${res.status}`)
    const page = await res.json()
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null || item.id === undefined) {
        files.push(...await listBucketFiles(fetchFn, baseUrl, serviceKey, bucket, path))
      } else {
        files.push({
          bucket,
          path,
          version: `${item.updated_at ?? ''}|${item.metadata?.eTag ?? ''}|${item.metadata?.size ?? ''}`,
        })
      }
    }
    if (page.length < limit) return files
  }
}

/** Stored file name. A hash, because real paths contain patient phone numbers. */
export const fileKey = (bucket, path) => createHash('sha256').update(`${bucket}/${path}`).digest('hex')

/**
 * Files only download when new or changed, because the free plan has 5 GB of
 * egress a month. A file deleted from Supabase stays in the backup for keepDays,
 * so deleting something by mistake is still recoverable.
 */
export function planFileSync(remote, index, now, keepDays) {
  const nextIndex = {}
  const download = []
  const seen = new Set()
  for (const f of remote) {
    const key = fileKey(f.bucket, f.path)
    seen.add(key)
    const known = index[key]
    if (known && known.version === f.version) nextIndex[key] = { bucket: f.bucket, path: f.path, version: f.version }
    else download.push({ ...f, key })
  }
  const remove = []
  for (const [key, entry] of Object.entries(index)) {
    if (seen.has(key)) continue
    const missingSince = entry.missingSince ?? now
    if (now - missingSince > keepDays * 86_400_000) remove.push(key)
    else nextIndex[key] = { ...entry, missingSince }
  }
  return { download, remove, nextIndex }
}

/** Database backups to delete: everything past the newest `keep`. Names sort by date. */
export function backupsToDelete(names, keep) {
  return names.filter((n) => /^beshola-.*\.dump\.enc$/.test(n)).sort().reverse().slice(Math.max(keep, 1))
}

export function backupFileName(date) {
  const p = (n) => String(n).padStart(2, '0')
  return `beshola-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}.dump.enc`
}

// Row counts per table. Table names and numbers only, so the result is safe to
// keep unencrypted next to the backup and to show on screen.
export const COUNTS_SQL = `
SELECT t.table_schema || '.' || t.table_name,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text::bigint
FROM information_schema.tables t
WHERE t.table_type = 'BASE TABLE'
  AND t.table_schema IN ('public', 'auth', 'storage')
  AND has_table_privilege(format('%I.%I', t.table_schema, t.table_name), 'SELECT')
ORDER BY 1;`

export function parseCounts(output) {
  const counts = {}
  for (const line of output.split(/\r?\n/)) {
    const [table, n] = line.split('|')
    if (table && n !== undefined) counts[table.trim()] = Number(n)
  }
  return counts
}

/**
 * Compares a restored database with the counts saved at backup time. A small drop
 * is allowed: counts are taken just after the dump, so a booking can land between.
 */
export function compareCounts(expected, actual) {
  const missing = []
  const short = []
  for (const [table, want] of Object.entries(expected)) {
    if (!(table in actual)) { missing.push(table); continue }
    if (want - actual[table] > Math.max(5, want * 0.01)) short.push({ table, want, got: actual[table] })
  }
  return { ok: missing.length === 0 && short.length === 0, missing, short }
}
