import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { bootDatabase } from '../local-backend/schema.mjs'

// 049: the clinic asks for deletion, the admin deletes. Runs on the full schema,
// so the cascade covers every table that really hangs off businesses.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const count = async (sql, params) => (await one(sql, params)).n

async function as(role, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId || ''])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}

async function clinic(tag) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type) VALUES ($1, $2, 'clinic') RETURNING id`, [user.id, `عيادة ${tag}`])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'ف',true,1) RETURNING id`, [biz.id])
  const svc = await one(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1,'كشف',30,200) RETURNING id`, [biz.id])
  await db.query(
    `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time, status)
     VALUES ($1,$2,$3,'عميل','201000000000','2099-01-01','10:00','confirmed')`, [biz.id, branch.id, svc.id])
  return { userId: user.id, bizId: biz.id }
}

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('049 account deletion', () => {
  it('the owner asks once, sees the request, and can cancel it', async () => {
    const c = await clinic('a')
    const first = (await as('authenticated', c.userId, tx => tx.query('SELECT * FROM request_account_deletion($1, $2)', [c.bizId, '  مش محتاجه  ']))).rows[0]
    expect(first.reason).toBe('مش محتاجه')
    const again = (await as('authenticated', c.userId, tx => tx.query('SELECT * FROM request_account_deletion($1)', [c.bizId]))).rows[0]
    expect(again.id).toBe(first.id)

    const mine = await as('authenticated', c.userId, tx => tx.query('SELECT * FROM my_account_deletion_request($1)', [c.bizId]))
    expect(mine.rows).toHaveLength(1)

    await as('authenticated', c.userId, tx => tx.query('SELECT cancel_account_deletion($1)', [c.bizId]))
    const after = await as('authenticated', c.userId, tx => tx.query('SELECT * FROM my_account_deletion_request($1)', [c.bizId]))
    expect(after.rows).toHaveLength(0)
    expect(await count(`SELECT count(*)::int n FROM businesses WHERE id = $1`, [c.bizId])).toBe(1)
  })

  it('nobody can ask for, see or cancel another clinic\'s request', async () => {
    const c = await clinic('b')
    const other = await clinic('c')
    await as('authenticated', c.userId, tx => tx.query('SELECT * FROM request_account_deletion($1)', [c.bizId]))
    await expect(as('authenticated', other.userId, tx => tx.query('SELECT * FROM request_account_deletion($1)', [c.bizId]))).rejects.toThrow(/not allowed/)
    await expect(as('authenticated', other.userId, tx => tx.query('SELECT cancel_account_deletion($1)', [c.bizId]))).rejects.toThrow(/not allowed/)
    const seen = await as('authenticated', other.userId, tx => tx.query('SELECT * FROM my_account_deletion_request($1)', [c.bizId]))
    expect(seen.rows).toHaveLength(0)
    await expect(as('anon', null, tx => tx.query('SELECT * FROM request_account_deletion($1)', [c.bizId]))).rejects.toThrow(/permission denied/)
    await expect(as('authenticated', c.userId, tx => tx.query('SELECT * FROM account_deletion_requests'))).rejects.toThrow(/permission denied/)
  })

  it('only the service role can list files or delete an account', async () => {
    const c = await clinic('d')
    for (const role of ['anon', 'authenticated']) {
      await expect(as(role, c.userId, tx => tx.query('SELECT * FROM admin_delete_business($1)', [c.bizId]))).rejects.toThrow(/permission denied/)
      await expect(as(role, c.userId, tx => tx.query('SELECT * FROM admin_business_files($1)', [c.bizId]))).rejects.toThrow(/permission denied/)
    }
    expect(await count(`SELECT count(*)::int n FROM businesses WHERE id = $1`, [c.bizId])).toBe(1)
  })

  it('deleting removes the account and everything under it, and keeps a record', async () => {
    const c = await clinic('e')
    const keep = await clinic('f')
    await as('authenticated', c.userId, tx => tx.query('SELECT * FROM request_account_deletion($1, $2)', [c.bizId, 'سبب']))
    await db.query(`INSERT INTO storage.buckets (id, name) VALUES ('business-assets','business-assets'), ('medical-files','medical-files') ON CONFLICT DO NOTHING`)
    await db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('business-assets', $1), ('medical-files', $2), ('medical-files', $3)`,
      [`${c.bizId}/logo.png`, `${c.bizId}/201000000000/x.pdf`, `${keep.bizId}/201000000000/y.pdf`])

    const files = await as('service_role', null, tx => tx.query('SELECT * FROM admin_business_files($1) ORDER BY name', [c.bizId]))
    expect(files.rows.map(f => f.name)).toEqual([`${c.bizId}/201000000000/x.pdf`, `${c.bizId}/logo.png`])

    const res = (await as('service_role', null, tx => tx.query('SELECT * FROM admin_delete_business($1)', [c.bizId]))).rows[0]
    expect(res).toEqual({ owner_id: c.userId, other_businesses: 0 })

    expect(await count(`SELECT count(*)::int n FROM businesses WHERE id = $1`, [c.bizId])).toBe(0)
    for (const t of ['appointments', 'services', 'branches']) {
      expect(await count(`SELECT count(*)::int n FROM ${t} WHERE business_id = $1`, [c.bizId])).toBe(0)
    }
    expect(await count(`SELECT count(*)::int n FROM appointments WHERE business_id = $1`, [keep.bizId])).toBe(1)

    const log = await one(`SELECT business_id, business_name, status, requested_by, reason FROM account_deletion_requests WHERE business_name = 'عيادة e'`)
    expect(log).toEqual({ business_id: null, business_name: 'عيادة e', status: 'deleted', requested_by: 'owner', reason: 'سبب' })
  })

  it('an admin deletion with no request is recorded too, and a missing account fails', async () => {
    const c = await clinic('g')
    await as('service_role', null, tx => tx.query('SELECT * FROM admin_delete_business($1)', [c.bizId]))
    const log = await one(`SELECT status, requested_by FROM account_deletion_requests WHERE business_name = 'عيادة g'`)
    expect(log).toEqual({ status: 'deleted', requested_by: 'admin' })
    await expect(as('service_role', null, tx => tx.query('SELECT * FROM admin_delete_business($1)', [c.bizId]))).rejects.toThrow(/not found/)
  })

  it('rolls back cleanly', async () => {
    const fresh = await bootDatabase()
    await fresh.exec(readFileSync('supabase/rollbacks/049_account_deletion_down.sql', 'utf8'))
    const row = (await fresh.query(`SELECT to_regclass('public.account_deletion_requests') AS t`)).rows[0]
    expect(row.t).toBeNull()
    await fresh.close()
  }, 120000)
})
