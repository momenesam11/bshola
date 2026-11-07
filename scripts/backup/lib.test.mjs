import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  backupFileName, backupsToDelete, compareCounts, decryptFileToBuffer, encryptBufferToFile,
  encryptStreamToFile, fileKey, listBucketFiles, parseCounts, parseEnv,
  pgEnvFromUrl, planFileSync,
} from './lib.mjs'

describe('encryption', () => {
  let dir
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'backup-test-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('gets the exact bytes back, including an empty file', async () => {
    const data = Buffer.from('بيانات مريض 01000000000')
    await encryptBufferToFile(data, join(dir, 'a.enc'), 'secret')
    expect(await decryptFileToBuffer(join(dir, 'a.enc'), 'secret')).toEqual(data)
    await encryptBufferToFile(Buffer.alloc(0), join(dir, 'b.enc'), 'secret')
    expect((await decryptFileToBuffer(join(dir, 'b.enc'), 'secret')).length).toBe(0)
  })

  it('leaves nothing readable in the file', async () => {
    await encryptBufferToFile(Buffer.from('01000000000'), join(dir, 'a.enc'), 'secret')
    expect(readFileSync(join(dir, 'a.enc')).includes('01000000000')).toBe(false)
  })

  it('refuses a wrong passphrase', async () => {
    await encryptBufferToFile(Buffer.from('data'), join(dir, 'a.enc'), 'secret')
    await expect(decryptFileToBuffer(join(dir, 'a.enc'), 'wrong')).rejects.toThrow()
  })

  it('refuses a file changed after the backup', async () => {
    await encryptBufferToFile(Buffer.from('important data'), join(dir, 'a.enc'), 'secret')
    const bytes = readFileSync(join(dir, 'a.enc'))
    bytes[bytes.length - 20] ^= 1
    writeFileSync(join(dir, 'a.enc'), bytes)
    await expect(decryptFileToBuffer(join(dir, 'a.enc'), 'secret')).rejects.toThrow()
  })

  it('refuses a file that is not a backup', async () => {
    writeFileSync(join(dir, 'a.enc'), Buffer.alloc(100))
    await expect(decryptFileToBuffer(join(dir, 'a.enc'), 'secret')).rejects.toThrow(/Not a backup/)
  })

  it('leaves no finished or partial file when the source fails', async () => {
    const failing = new Readable({ read() { this.destroy(new Error('pg_dump died')) } })
    await expect(encryptStreamToFile(failing, join(dir, 'a.enc'), 'secret')).rejects.toThrow('pg_dump died')
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('settings', () => {
  it('keeps = inside values and ignores comments and blank lines', () => {
    expect(parseEnv('# note\n\nA=x=y\r\nB="quoted"\n')).toEqual({ A: 'x=y', B: 'quoted' })
  })

  it('decodes passwords with special characters and requires SSL for Supabase', () => {
    const env = pgEnvFromUrl('postgresql://postgres.abc:p%40ss%23@aws.pooler.supabase.com:5432/postgres', {})
    expect(env).toMatchObject({ PGUSER: 'postgres.abc', PGPASSWORD: 'p@ss#', PGPORT: '5432', PGDATABASE: 'postgres', PGSSLMODE: 'require' })
  })
})

describe('what gets deleted', () => {
  const names = (days) => days.map((d) => `beshola-2026-11-${d}_1300.dump.enc`)

  it('keeps the newest backups and deletes only the oldest', () => {
    expect(backupsToDelete(names(['05', '07', '06', '04']), 2)).toEqual(names(['05', '04']))
  })

  it('ignores any other file in the folder', () => {
    const list = ['notes.txt', 'beshola-2026-11-01_1300.dump.enc.counts.json', ...names(['01'])]
    expect(backupsToDelete(list, 0)).toEqual([])
  })

  it('never deletes the last backup, even with a bad setting', () => {
    expect(backupsToDelete(names(['01']), 0)).toEqual([])
    expect(backupsToDelete(names(['01', '02']), -3)).toEqual(names(['01']))
  })

  it('names files so they sort by date', () => {
    expect(backupFileName(new Date(2026, 10, 7, 9, 5))).toBe('beshola-2026-11-07_0905.dump.enc')
  })
})

describe('file sync', () => {
  const now = Date.UTC(2026, 10, 7)
  const day = 86_400_000
  const file = (path, version = 'v1') => ({ bucket: 'b', path, version })

  it('downloads new and changed files, and skips unchanged ones', () => {
    const index = {
      [fileKey('b', 'same.png')]: file('same.png'),
      [fileKey('b', 'changed.png')]: file('changed.png', 'old'),
    }
    const plan = planFileSync([file('same.png'), file('changed.png', 'new'), file('new.png')], index, now, 30)
    expect(plan.download.map((f) => f.path).sort()).toEqual(['changed.png', 'new.png'])
    expect(plan.nextIndex[fileKey('b', 'same.png')]).toBeDefined()
  })

  it('keeps a file deleted from Supabase for the retention period, then removes it', () => {
    const key = fileKey('b', 'gone.png')
    const first = planFileSync([], { [key]: file('gone.png') }, now, 30)
    expect(first.remove).toEqual([])
    expect(first.nextIndex[key].missingSince).toBe(now)

    const later = planFileSync([], first.nextIndex, now + 29 * day, 30)
    expect(later.remove).toEqual([])
    const expired = planFileSync([], first.nextIndex, now + 31 * day, 30)
    expect(expired.remove).toEqual([key])
    expect(expired.nextIndex[key]).toBeUndefined()
  })

  it('clears the deleted mark if the file comes back', () => {
    const key = fileKey('b', 'back.png')
    const plan = planFileSync([file('back.png')], { [key]: { ...file('back.png'), missingSince: now } }, now, 30)
    expect(plan.nextIndex[key].missingSince).toBeUndefined()
  })

  it('stores files under a hash, so patient phone numbers stay out of file names', () => {
    expect(fileKey('medical-files', 'biz/01000000000/x.png')).not.toContain('01000000000')
  })

  it('walks into folders and pages through long lists', async () => {
    const pages = {
      '': [{ name: 'folder', id: null }, { name: 'a.png', id: '1', updated_at: 't', metadata: { eTag: 'e', size: 1 } }],
      folder: [{ name: 'b.png', id: '2', updated_at: 't', metadata: { eTag: 'e', size: 2 } }],
    }
    const fake = async (_url, opts) => {
      const { prefix } = JSON.parse(opts.body)
      return { ok: true, json: async () => pages[prefix] }
    }
    const files = await listBucketFiles(fake, 'https://x', 'k', 'bucket')
    expect(files.map((f) => f.path).sort()).toEqual(['a.png', 'folder/b.png'])
  })

  it('fails loudly when listing fails instead of treating files as deleted', async () => {
    const fake = async () => ({ ok: false, status: 500 })
    await expect(listBucketFiles(fake, 'https://x', 'k', 'bucket')).rejects.toThrow(/500/)
  })
})

describe('restore check', () => {
  it('reads psql output', () => {
    expect(parseCounts('public.a|5\r\nauth.users|12\n')).toEqual({ 'public.a': 5, 'auth.users': 12 })
  })

  it('passes on a match, and allows a booking that landed just after the dump', () => {
    expect(compareCounts({ a: 100 }, { a: 100 }).ok).toBe(true)
    expect(compareCounts({ a: 100 }, { a: 98 }).ok).toBe(true)
  })

  it('fails when a table is missing or lost real data', () => {
    expect(compareCounts({ a: 1 }, {}).missing).toEqual(['a'])
    const result = compareCounts({ a: 1000 }, { a: 500 })
    expect(result.ok).toBe(false)
    expect(result.short[0].table).toBe('a')
  })
})
