import { describe, it, expect } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'

const MIGRATION = readSql('supabase/migrations/045_unify_patient_phones.sql')
const ROLLBACK = readSql('supabase/rollbacks/045_unify_patient_phones_down.sql')

const TABLES = `
  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_name text;
  CREATE TABLE clients (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
    name text NOT NULL, phone text NOT NULL, notes text DEFAULT '', tags text[] DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    UNIQUE (business_id, phone)
  );
  CREATE TABLE patient_records (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
    client_phone text NOT NULL, client_name text NOT NULL, allergies text[] DEFAULT '{}',
    UNIQUE (business_id, client_phone)
  );
  CREATE TABLE diagnoses (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, business_id uuid, client_phone text NOT NULL);
  CREATE TABLE prescriptions (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, business_id uuid, client_phone text NOT NULL);
  CREATE TABLE medical_attachments (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, business_id uuid, client_phone text NOT NULL);
  CREATE TABLE client_plans (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, business_id uuid, client_phone text NOT NULL);
  CREATE TABLE client_ledger_entries (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, business_id uuid, client_phone text NOT NULL);
`

async function setup() {
  const db = await freshDb()
  await db.exec(TABLES)
  const owner = await createUser(db, 'owner@test.local')
  const { id: biz } = await createBusiness(db, owner)
  const appt = (phone, b = biz) => db.query('INSERT INTO appointments (business_id, client_phone) VALUES ($1, $2)', [b, phone])
  const phones = async (table, column = 'client_phone', b = biz) =>
    (await db.query(`SELECT ${column} AS p FROM ${table} WHERE business_id = $1 ORDER BY 1`, [b])).rows.map((r) => r.p)
  return { db, owner, biz, appt, phones }
}

describe('045 unify patient phones', () => {
  it('rewrites Egyptian mobiles in every table that holds a patient number', async () => {
    const { db, biz, appt, phones } = await setup()
    await appt('01012345678')
    await db.query(`INSERT INTO patient_records (business_id, client_phone, client_name) VALUES ($1, '01012345678', 'سارة')`, [biz])
    for (const t of ['diagnoses', 'prescriptions', 'medical_attachments', 'client_plans', 'client_ledger_entries']) {
      await db.query(`INSERT INTO ${t} (business_id, client_phone) VALUES ($1, '01012345678')`, [biz])
    }
    await db.query(`INSERT INTO clients (business_id, name, phone) VALUES ($1, 'سارة', '01012345678')`, [biz])
    await db.exec(MIGRATION)
    for (const t of ['appointments', 'patient_records', 'diagnoses', 'prescriptions', 'medical_attachments', 'client_plans', 'client_ledger_entries']) {
      expect(await phones(t), t).toEqual(['201012345678'])
    }
    expect(await phones('clients', 'phone')).toEqual(['201012345678'])
  })

  it('handles each mobile prefix and a number with its zero missing', async () => {
    const { db, appt, phones } = await setup()
    for (const p of ['01112345678', '01212345678', '01512345678', '1012345678']) await appt(p)
    await db.exec(MIGRATION)
    expect(await phones('appointments')).toEqual(['201012345678', '201112345678', '201212345678', '201512345678'])
  })

  it('leaves anything that is not clearly an Egyptian mobile', async () => {
    const { db, appt, phones } = await setup()
    const untouched = ['0501234567', '0223456789', '01312345678', '201012345678', '966501234567', '447911123456']
    for (const p of untouched) await appt(p)
    await db.exec(MIGRATION)
    expect(await phones('appointments')).toEqual([...untouched].sort())
  })

  it('never merges two medical files: that patient stays exactly as they were', async () => {
    const { db, biz, appt, phones } = await setup()
    await db.query(`INSERT INTO patient_records (business_id, client_phone, client_name, allergies) VALUES
      ($1, '01012345678', 'سارة', '{بنسلين}'), ($1, '201012345678', 'سارة', '{}')`, [biz])
    await appt('01012345678')
    await appt('201012345678')
    await db.query(`INSERT INTO clients (business_id, name, phone) VALUES ($1, 'سارة', '01012345678'), ($1, 'سارة', '201012345678')`, [biz])
    await appt('01099999999')
    await db.exec(MIGRATION)
    expect(await phones('patient_records')).toEqual(['01012345678', '201012345678'])
    expect(await phones('clients', 'phone')).toEqual(['01012345678', '201012345678'])
    expect(await phones('appointments')).toEqual(['01012345678', '201012345678', '201099999999'])
    const old = await one(db, `SELECT allergies FROM patient_records WHERE client_phone = '01012345678'`)
    expect(old.allergies).toEqual(['بنسلين'])
  })

  it('keeps two businesses separate', async () => {
    const { db, owner, biz, appt, phones } = await setup()
    const { id: other } = await createBusiness(db, owner, { name: 'تانية' })
    await db.query(`INSERT INTO patient_records (business_id, client_phone, client_name) VALUES
      ($1, '01012345678', 'أ'), ($1, '201012345678', 'أ'), ($2, '01012345678', 'ب')`, [biz, other])
    await appt('01012345678', other)
    await db.exec(MIGRATION)
    expect(await phones('patient_records', 'client_phone', biz)).toEqual(['01012345678', '201012345678'])
    expect(await phones('patient_records', 'client_phone', other)).toEqual(['201012345678'])
    expect(await phones('appointments', 'client_phone', other)).toEqual(['201012345678'])
  })

  it('merges duplicate client rows without losing notes or tags', async () => {
    const { db, biz, phones } = await setup()
    await db.query(`INSERT INTO clients (business_id, name, phone, notes, tags) VALUES
      ($1, 'سارة', '01012345678', 'بتحب الصبح', '{مهم}'), ($1, 'سارة', '201012345678', 'اتصلت', '{جديد,مهم}')`, [biz])
    await db.exec(MIGRATION)
    const rows = (await db.query('SELECT phone, notes, tags FROM clients WHERE business_id = $1', [biz])).rows
    expect(rows).toHaveLength(1)
    expect(rows[0].phone).toBe('201012345678')
    expect(rows[0].notes).toContain('بتحب الصبح')
    expect(rows[0].notes).toContain('اتصلت')
    expect([...rows[0].tags].sort()).toEqual(['جديد', 'مهم'])
    expect(await phones('clients', 'phone')).toEqual(['201012345678'])
  })

  it('makes a patient with bookings in both formats one patient', async () => {
    const { db, biz, appt } = await setup()
    await appt('01012345678')
    await appt('201012345678')
    await db.exec(MIGRATION)
    const { c } = await one(db, 'SELECT count(DISTINCT client_phone)::int AS c FROM appointments WHERE business_id = $1', [biz])
    expect(c).toBe(1)
  })

  it('reports totals only, and can run twice', async () => {
    const { db, biz, appt } = await setup()
    await appt('01012345678')
    await appt('0501234567')
    await db.query(`INSERT INTO patient_records (business_id, client_phone, client_name) VALUES ($1, '01111111111', 'أ'), ($1, '201111111111', 'أ')`, [biz])
    await db.exec(MIGRATION)
    const results = await db.exec(MIGRATION)
    expect(results.at(-1).rows[0]).toEqual({
      appointments_updated: 1,
      duplicate_clients_merged: 0,
      patients_left_with_two_files: 1,
      appointments_still_old_format: 1,
    })
    expect(Object.keys(results.at(-1).rows[0]).join()).not.toMatch(/phone$/)
  })

  it('hides the log, which holds phones, from the site', async () => {
    const { db, appt } = await setup()
    await appt('01012345678')
    await db.exec(MIGRATION)
    await expect(as(db, 'anon', (tx) => tx.query('SELECT * FROM phone_unify_log'))).rejects.toThrow()
    await expect(as(db, 'authenticated', (tx) => tx.query('SELECT * FROM phone_unify_log'))).rejects.toThrow()
  })

  it('rolls everything back exactly, including merged clients', async () => {
    const { db, biz, appt, phones } = await setup()
    await appt('01012345678')
    await appt('201099999999')
    await db.query(`INSERT INTO patient_records (business_id, client_phone, client_name) VALUES ($1, '01012345678', 'سارة')`, [biz])
    await db.query(`INSERT INTO clients (business_id, name, phone, notes, tags) VALUES
      ($1, 'سارة', '01012345678', 'قديمة', '{أ}'), ($1, 'سارة', '201012345678', 'جديدة', '{ب}')`, [biz])
    await db.exec(MIGRATION)
    await db.exec(ROLLBACK)
    expect(await phones('appointments')).toEqual(['01012345678', '201099999999'])
    expect(await phones('patient_records')).toEqual(['01012345678'])
    const rows = (await db.query('SELECT phone, notes, tags FROM clients WHERE business_id = $1 ORDER BY phone', [biz])).rows
    expect(rows).toEqual([
      { phone: '01012345678', notes: 'قديمة', tags: ['أ'] },
      { phone: '201012345678', notes: 'جديدة', tags: ['ب'] },
    ])
    expect((await one(db, `SELECT to_regclass('public.phone_unify_log') AS t`)).t).toBeNull()
  })
})
