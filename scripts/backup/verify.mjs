// Proves the newest backup can really be restored. Run: npm run backup:verify
// Starts a throwaway PostgreSQL in a temp folder, restores into it, compares row
// counts, then deletes it. It never connects to production or to any database that
// already exists on this machine, and it needs no passwords.

import { spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareCounts, COUNTS_SQL, decryptFileToBuffer, decryptFileToStream, findPgBin,
  loadBackupConfig, parseCounts,
} from './lib.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_DB = 'restore_test'

// Roles and extensions Supabase provides, which the backup's rules refer to.
const PREPARE_SQL = `
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','dashboard_user'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
`

async function main() {
  const config = loadBackupConfig(ROOT)
  const bin = findPgBin(config.PG_BIN)
  if (!bin) throw new Error('PostgreSQL was not found. See docs/backup.md')
  const tool = (name) => join(bin, `${name}.exe`)

  const dbDir = join(config.BACKUP_DIR, 'db')
  const newest = readdirSync(dbDir).filter((n) => n.endsWith('.dump.enc')).sort().pop()
  if (!newest) throw new Error('No backups found. Run: npm run backup')
  console.log(`Checking: ${newest}`)

  const work = mkdtempSync(join(tmpdir(), 'beshola-restore-'))
  const data = join(work, 'pg')
  const dump = join(work, 'backup.dump')
  const port = String(54000 + (process.pid % 900))
  const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: port, PGUSER: 'postgres', PGPASSWORD: '', PGSSLMODE: 'disable' }
  let started = false

  const psql = (database, sql) => {
    const r = spawnSync(tool('psql'), ['-At', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: { ...env, PGDATABASE: database }, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`psql failed: ${String(r.stderr || r.error).trim().slice(0, 500)}`)
    return r.stdout
  }

  try {
    await decryptFileToStream(join(dbDir, newest), config.BACKUP_PASSPHRASE, createWriteStream(dump))
    console.log('Decrypted with the passphrase: ok')

    const init = spawnSync(tool('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { encoding: 'utf8' })
    if (init.status !== 0) throw new Error(`initdb failed: ${String(init.stderr || init.error).trim().slice(0, 500)}`)
    // stdio ignored: pg_ctl's server keeps these handles open and would hang the call.
    const start = spawnSync(tool('pg_ctl'), ['-D', data, '-w', '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-l', join(work, 'server.log'), 'start'], { stdio: 'ignore' })
    if (start.status !== 0) throw new Error('Could not start the temporary database')
    started = true

    psql('postgres', `CREATE DATABASE ${TEST_DB}`)
    psql(TEST_DB, PREPARE_SQL)

    // Some Supabase-only objects can't exist on a plain Postgres, so errors are
    // expected here. The row counts below decide whether the data really came back.
    const restore = spawnSync(tool('pg_restore'), ['--no-owner', '--no-privileges', '--dbname', TEST_DB, dump], { env, encoding: 'utf8' })
    const ignored = /errors ignored on restore: (\d+)/.exec(String(restore.stderr))?.[1] ?? '0'
    console.log(`Restore finished, ${ignored} objects skipped (Supabase-only objects are expected here)`)

    const expected = JSON.parse(readFileSync(join(dbDir, `${newest}.counts.json`), 'utf8'))
    const actual = parseCounts(psql(TEST_DB, COUNTS_SQL))
    const result = compareCounts(expected, actual)
    const totalRows = Object.values(actual).reduce((a, b) => a + b, 0)
    console.log(`Tables compared: ${Object.keys(expected).length}, rows restored: ${totalRows}`)

    const filesIndex = join(config.BACKUP_DIR, 'files', 'index.json.enc')
    if (existsSync(filesIndex)) {
      const index = JSON.parse((await decryptFileToBuffer(filesIndex, config.BACKUP_PASSPHRASE)).toString('utf8'))
      const keys = Object.keys(index)
      const absent = keys.filter((k) => !existsSync(join(config.BACKUP_DIR, 'files', `${k}.enc`)))
      if (absent.length) result.ok = false
      for (const key of keys.slice(0, 5)) {
        await decryptFileToBuffer(join(config.BACKUP_DIR, 'files', `${key}.enc`), config.BACKUP_PASSPHRASE)
      }
      console.log(`Files in backup: ${keys.length}, missing: ${absent.length}, sample decrypted: ${Math.min(keys.length, 5)}`)
    }

    if (!result.ok) {
      console.error('RESTORE TEST FAILED')
      if (result.missing.length) console.error('Tables missing:', result.missing.join(', '))
      for (const s of result.short) console.error(`${s.table}: expected ${s.want}, got ${s.got}`)
      process.exitCode = 1
      return
    }
    console.log('RESTORE TEST PASSED')
  } finally {
    if (started) spawnSync(tool('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
