import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './env'

loadEnv()

const url = process.env.VITE_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) {
  throw new Error('VITE_SUPABASE_URL is missing — copy .env.test.example to .env.test.local and check .env')
}
if (!serviceRoleKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is missing. Tests need it to create/clean up fixtures ' +
    '(test owner account + business + branch + service) without going through RLS. ' +
    'Get it from Supabase Dashboard → Project Settings → API, and put it in .env.test.local ' +
    '(already gitignored). Never commit it or ship it to the frontend.'
  )
}

// Service-role client — bypasses RLS entirely. Node-side only, never
// imported by app code or shipped to the browser.
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FAR_FUTURE_TRIAL_END = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

// All 7 days wide open 00:00–23:30, so booking tests aren't sensitive to
// which real-world weekday/time they happen to run at.
function fullWeekScheduleBlocks() {
  const blocks = [{ start: '00:00', end: '23:30' }]
  return { sun: blocks, mon: blocks, tue: blocks, wed: blocks, thu: blocks, fri: blocks, sat: blocks }
}

export interface TestFixture {
  ownerId: string
  ownerEmail: string
  ownerPassword: string
  businessId: string
  businessName: string
  bookingSlug: string
  branchId: string
  serviceId: string
}

// Creates a fully isolated owner + business + branch + service, so each
// test run never touches real data and never collides with another run.
// `capacity` controls the branch's parallel-booking limit (1 = clinic-style,
// used by the capacity-race test).
export async function seedBusiness({ capacity = 1 }: { capacity?: number } = {}): Promise<TestFixture> {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const ownerEmail = `e2e-${stamp}@mawid-test.local`
  const ownerPassword = 'E2eTestPass123'

  const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  })
  if (userErr) throw userErr
  const ownerId = userRes.user.id

  const bookingSlug = `e2e-${stamp}`
  const businessName = `E2E Test Business ${stamp}`
  const { data: business, error: bizErr } = await supabaseAdmin
    .from('businesses')
    .insert({
      owner_id: ownerId,
      name: businessName,
      type: 'salon',
      booking_slug: bookingSlug,
      slot_duration: 30,
      is_active: true,
      trial_ends_at: FAR_FUTURE_TRIAL_END,
    })
    .select()
    .single()
  if (bizErr) throw bizErr

  const { data: branch, error: branchErr } = await supabaseAdmin
    .from('branches')
    .insert({
      business_id: business.id,
      name: 'الفرع الرئيسي',
      is_main: true,
      capacity,
      schedule_blocks: fullWeekScheduleBlocks(),
    })
    .select()
    .single()
  if (branchErr) throw branchErr

  const { data: service, error: svcErr } = await supabaseAdmin
    .from('services')
    .insert({ business_id: business.id, name: 'خدمة تجريبية', duration_minutes: 30, price: 100 })
    .select()
    .single()
  if (svcErr) throw svcErr

  return {
    ownerId,
    ownerEmail,
    ownerPassword,
    businessId: business.id,
    businessName,
    bookingSlug,
    branchId: branch.id,
    serviceId: service.id,
  }
}

// Deletes the business (cascades to branches/services/appointments) and
// the owner auth user. Safe to call even if some pieces failed to create.
export async function teardownBusiness(fixture: Partial<TestFixture>) {
  if (fixture.businessId) {
    await supabaseAdmin.from('businesses').delete().eq('id', fixture.businessId)
  }
  if (fixture.ownerId) {
    await supabaseAdmin.auth.admin.deleteUser(fixture.ownerId)
  }
}

export async function createConfirmedUser(email: string, password: string) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  return data.user
}

export async function deleteUserByEmail(email: string) {
  let page = 1
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find(u => u.email === email)
    if (match) {
      await supabaseAdmin.auth.admin.deleteUser(match.id)
      return
    }
    if (data.users.length < 200) return
    page++
  }
}

// A near-future date (tomorrow) the seeded business is always open on,
// formatted YYYY-MM-DD — avoids "today but the slot already passed" flake.
export function tomorrowISODate() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
