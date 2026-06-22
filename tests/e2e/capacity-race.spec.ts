import { test, expect } from '@playwright/test'
import { seedBusiness, teardownBusiness, supabaseAdmin, type TestFixture } from './helpers/fixtures'
import { supabaseAnon } from './helpers/apiClient'

// C4 verification: two anon clients insert into the SAME branch/date/time
// slot on a capacity=1 branch at the same instant via Promise.all(), the
// same way two real customers tapping "confirm" on the last open clinic
// slot within the same second would race the old (frontend-only) check.
// Before the 021_capacity_lock_trigger.sql migration, both inserts could
// succeed. After it, Postgres re-counts inside the same transaction as the
// write, so exactly one must succeed and the other must be rejected with
// the CAPACITY_EXCEEDED error raised by check_capacity_before_insert().

let fixture: TestFixture

test.describe('Capacity race condition (C4)', () => {
  test.beforeAll(async () => {
    fixture = await seedBusiness({ capacity: 1 })
  })

  test.afterAll(async () => {
    await teardownBusiness(fixture)
  })

  test('two simultaneous bookings for the same slot → exactly one succeeds', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const sharedSlot = {
      business_id: fixture.businessId,
      branch_id: fixture.branchId,
      service_id: fixture.serviceId,
      appointment_date: tomorrow,
      appointment_time: '11:00',
      status: 'confirmed' as const,
    }

    const [resultA, resultB] = await Promise.all([
      supabaseAnon.from('appointments').insert({
        ...sharedSlot,
        client_name: 'عميل أ',
        client_phone: '201000000001',
      }),
      supabaseAnon.from('appointments').insert({
        ...sharedSlot,
        client_name: 'عميل ب',
        client_phone: '201000000002',
      }),
    ])

    const outcomes = [resultA, resultB]
    const succeeded = outcomes.filter(r => !r.error)
    const failed = outcomes.filter(r => r.error)

    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0].error?.message).toContain('CAPACITY_EXCEEDED')

    // Belt-and-suspenders: confirm the database actually has exactly one
    // confirmed row for this slot, not just that one client call failed.
    // anon has no SELECT policy on appointments, so this read uses the
    // service-role client to bypass RLS rather than reflecting a false
    // "zero rows" from a blocked anon read.
    const { data: rows, error } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('branch_id', fixture.branchId)
      .eq('appointment_date', tomorrow)
      .eq('appointment_time', '11:00')
      .eq('status', 'confirmed')
    expect(error).toBeNull()
    expect(rows).toHaveLength(1)
  })
})
