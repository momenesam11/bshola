import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { bootDatabase, listMigrations } from '../local-backend/schema.mjs'

// The whole migration history, on a real Postgres. Unlike harness.js, which stubs
// the core tables to test the growth engine, nothing here is simplified, so a
// trigger that can never work fails here instead of in front of a customer.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

async function fixture(tag) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(
    `INSERT INTO businesses (owner_id, name, type, trial_ends_at, is_active) VALUES ($1,'ع','clinic', now() + interval '30 days', true) RETURNING id`,
    [user.id])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'ف',true,1) RETURNING id`, [biz.id])
  const svc = await one(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1,'كشف',30,200) RETURNING id`, [biz.id])
  return { userId: user.id, biz: biz.id, branch: branch.id, svc: svc.id }
}
let slot = 0
async function appointment(f, extra = {}) {
  const row = {
    business_id: f.biz, branch_id: f.branch, service_id: f.svc, client_name: 'عميل', client_phone: '201000000000',
    appointment_date: '2099-01-01', appointment_time: `${String(Math.floor(slot / 2) % 24).padStart(2, '0')}:${slot++ % 2 ? '30' : '00'}`,
    status: 'confirmed', ...extra,
  }
  const keys = Object.keys(row)
  return one(`INSERT INTO appointments (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, Object.values(row))
}
const charges = async (id) => (await db.query(`SELECT amount FROM client_ledger_entries WHERE related_appointment_id=$1`, [id])).rows.map(r => Number(r.amount))

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('migrations', () => {
  it('numbers have no gaps or duplicates', () => {
    const numbers = listMigrations().map(f => Number(f.slice(0, 3)))
    expect(new Set(numbers).size).toBe(numbers.length)
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1))
  })
})

describe('completing an appointment', () => {
  it('charges a priced appointment once', async () => {
    const f = await fixture('a')
    const a = await appointment(f, { price: 350 })
    await db.query(`UPDATE appointments SET status='completed' WHERE id=$1`, [a.id])
    expect(await charges(a.id)).toEqual([350])
  })
  it('does not double-charge when toggled back and forth', async () => {
    const f = await fixture('b')
    const a = await appointment(f, { price: 350 })
    for (const s of ['completed', 'confirmed', 'completed']) await db.query(`UPDATE appointments SET status=$2 WHERE id=$1`, [a.id, s])
    expect(await charges(a.id)).toEqual([350])
  })
  it('falls back to the service price', async () => {
    const f = await fixture('c')
    const a = await appointment(f)
    await db.query(`UPDATE appointments SET status='completed' WHERE id=$1`, [a.id])
    expect(await charges(a.id)).toEqual([200])
  })
  it('charges nothing for a free visit', async () => {
    const f = await fixture('d')
    const a = await appointment(f, { price: 0 })
    await db.query(`UPDATE appointments SET status='completed' WHERE id=$1`, [a.id])
    expect(await charges(a.id)).toEqual([])
  })
  it('keeps the visit when the service was deleted', async () => {
    const f = await fixture('e')
    const a = await appointment(f, { price: 100 })
    await db.query('DELETE FROM services WHERE id=$1', [f.svc])
    await db.query(`UPDATE appointments SET status='completed' WHERE id=$1`, [a.id])
    expect(await charges(a.id)).toEqual([100])
  })
})

describe('plan visits follow their appointment', () => {
  async function planWithVisit(f) {
    const plan = await one(`INSERT INTO client_plans (business_id, client_phone, name, total_visits) VALUES ($1,'201000000000','خ',1) RETURNING id`, [f.biz])
    return one(`INSERT INTO client_plan_visits (plan_id, visit_number) VALUES ($1,1) RETURNING id`, [plan.id])
  }
  const visit = (id) => one('SELECT status, appointment_id FROM client_plan_visits WHERE id=$1', [id])

  it.each([['completed', 'attended'], ['no_show', 'no_show'], ['cancelled', 'cancelled']])(
    'appointment %s -> visit %s', async (status, expected) => {
      const f = await fixture('p')
      const v = await planWithVisit(f)
      const a = await appointment(f, { plan_visit_id: v.id })
      expect((await visit(v.id))).toMatchObject({ status: 'scheduled', appointment_id: a.id })
      await db.query(`UPDATE appointments SET status=$2 WHERE id=$1`, [a.id, status])
      expect((await visit(v.id)).status).toBe(expected)
    })

  it('moving back to confirmed takes the attendance back', async () => {
    const f = await fixture('q')
    const v = await planWithVisit(f)
    const a = await appointment(f, { plan_visit_id: v.id })
    await db.query(`UPDATE appointments SET status='completed' WHERE id=$1`, [a.id])
    await db.query(`UPDATE appointments SET status='confirmed' WHERE id=$1`, [a.id])
    expect((await visit(v.id)).status).toBe('scheduled')
  })

  it('reviving an old cancelled appointment does not steal a rebooked visit', async () => {
    const f = await fixture('r')
    const v = await planWithVisit(f)
    const first = await appointment(f, { plan_visit_id: v.id })
    await db.query(`UPDATE appointments SET status='cancelled' WHERE id=$1`, [first.id])
    const second = await appointment(f, { plan_visit_id: v.id })
    await db.query(`UPDATE appointments SET status='confirmed' WHERE id=$1`, [first.id])
    expect((await visit(v.id)).appointment_id).toBe(second.id)
  })

  it('deleting the plan keeps the appointment', async () => {
    const f = await fixture('s')
    const v = await planWithVisit(f)
    const a = await appointment(f, { plan_visit_id: v.id })
    await db.query(`DELETE FROM client_plans WHERE business_id=$1`, [f.biz])
    expect((await one('SELECT plan_visit_id FROM appointments WHERE id=$1', [a.id])).plan_visit_id).toBeNull()
  })
})

describe('double booking protection', () => {
  it('a full slot refuses another, a cancelled one frees it', async () => {
    const f = await fixture('cap')
    const a = await appointment(f, { appointment_time: '12:00' })
    await expect(appointment(f, { appointment_time: '12:00', client_phone: '201000000001' })).rejects.toThrow(/CAPACITY_EXCEEDED/)
    await db.query(`UPDATE appointments SET status='cancelled' WHERE id=$1`, [a.id])
    await expect(appointment(f, { appointment_time: '12:00', client_phone: '201000000001' })).resolves.toBeTruthy()
  })
})

describe('booking follows the length of the service', () => {
  const longService = async (f, minutes = 60) =>
    (await one(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1,'طويلة',$2,0) RETURNING id`, [f.biz, minutes])).id
  const asOwner = (f, row) => db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [f.userId])
    const keys = Object.keys(row)
    await tx.query(`INSERT INTO appointments (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row))
  })

  it('a visitor cannot book inside a longer visit, and can right after it', async () => {
    const f = await fixture('len')
    await appointment(f, { service_id: await longService(f), appointment_time: '10:00' })
    await expect(appointment(f, { appointment_time: '10:30', client_phone: '201000000001' })).rejects.toThrow(/CAPACITY_EXCEEDED/)
    await expect(appointment(f, { appointment_time: '11:00', client_phone: '201000000002' })).resolves.toBeTruthy()
  })

  it('a long visit cannot start before one that is already booked', async () => {
    const f = await fixture('len2')
    await appointment(f, { appointment_time: '10:30' })
    await expect(appointment(f, { service_id: await longService(f), appointment_time: '10:00', client_phone: '201000000001' })).rejects.toThrow(/CAPACITY_EXCEEDED/)
  })

  it('the owner can add a walk-in over anything', async () => {
    const f = await fixture('own')
    await appointment(f, { service_id: await longService(f), appointment_time: '10:00' })
    await expect(asOwner(f, {
      business_id: f.biz, branch_id: f.branch, service_id: f.svc, client_name: 'وصل', client_phone: '201000000003',
      appointment_date: '2099-01-01', appointment_time: '10:15', status: 'confirmed',
    })).resolves.not.toThrow()
  })

  it('two chairs take back-to-back visits beside a long one', async () => {
    const f = await fixture('two')
    await db.query('UPDATE branches SET capacity = 2 WHERE id = $1', [f.branch])
    await appointment(f, { appointment_time: '10:00' })
    await appointment(f, { appointment_time: '10:30', client_phone: '201000000001' })
    const long = await longService(f)
    await appointment(f, { service_id: long, appointment_time: '10:00', client_phone: '201000000002' })
    await expect(appointment(f, { service_id: long, appointment_time: '10:00', client_phone: '201000000003' })).rejects.toThrow(/CAPACITY_EXCEEDED/)
  })

  it('shows visitors only start times and lengths', async () => {
    const f = await fixture('rpc')
    await appointment(f, { service_id: await longService(f, 45), appointment_time: '09:15' })
    const { rows } = await db.query(`SELECT * FROM public_busy_ranges($1, '2099-01-01')`, [f.biz])
    expect(rows).toEqual([{ start_time: '09:15', duration_minutes: 45 }])
  })

  it('moves services still on the default to the clinic old length, and leaves chosen ones', async () => {
    const f = await fixture('data')
    const chosen = await longService(f, 45)
    await db.query('UPDATE businesses SET slot_duration = 60 WHERE id = $1', [f.biz])
    await db.exec(readFileSync('supabase/migrations/047_service_duration_booking.sql', 'utf8'))
    expect((await one('SELECT duration_minutes d FROM services WHERE id=$1', [f.svc])).d).toBe(60)
    expect((await one('SELECT duration_minutes d FROM services WHERE id=$1', [chosen])).d).toBe(45)
  })
})

describe('rollback for 047', () => {
  it('exists and puts changed services back', async () => {
    const sql = readFileSync('supabase/rollbacks/047_service_duration_booking_down.sql', 'utf8')
    await db.exec(`BEGIN; ${sql}; ROLLBACK;`)
  })
})

describe('rollback for 046', () => {
  it('exists and parses on the real schema', async () => {
    const sql = readFileSync('supabase/rollbacks/046_fix_completion_and_plan_sync_down.sql', 'utf8')
    await db.exec(`BEGIN; ${sql}; ROLLBACK;`)
  })
})
