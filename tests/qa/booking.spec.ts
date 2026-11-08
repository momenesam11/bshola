import { test, expect, seedBusiness, seedAppointment, one, sql, phone, isoDate } from './helpers'
import type { Page } from '@playwright/test'

// The public page patients use. No login anywhere in this file.

async function chooseService(page: Page, name = 'كشف عام') {
  await page.getByRole('button', { name: new RegExp(name) }).click()
}
// Tomorrow is always open and has no past slots, whatever time the suite runs.
async function chooseTomorrow(page: Page) {
  await page.locator('.overflow-x-auto button').nth(1).click()
}
async function chooseSlot(page: Page, label = '9:00 ص') {
  await page.getByRole('button', { name: label, exact: true }).click()
}
async function fillClient(page: Page, name: string, tel: string) {
  await page.getByPlaceholder('مثال: محمد أحمد').fill(name)
  await page.getByRole('textbox', { name: /واتساب/ }).fill(tel)
}

test('a visitor books, sees the receipt, and the appointment and notification exist', async ({ page }) => {
  const s = await seedBusiness()
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await chooseSlot(page)
  const tel = phone()
  await fillClient(page, 'مريض أونلاين', tel)
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible()
  const row = await one<{ status: string; t: string; d: string }>(
    `SELECT status, appointment_time::text t, appointment_date::text d FROM appointments WHERE client_phone=$1`, [tel])
  expect(row).toMatchObject({ status: 'confirmed', d: isoDate(1) })
  expect(row.t.slice(0, 5)).toBe('09:00')
  const n = await one<{ n: number }>(`SELECT count(*)::int n FROM notifications WHERE business_id=$1 AND type='new_booking'`, [s.businessId])
  expect(n.n).toBe(1)
})

test('phone formats a person really types are accepted', async ({ page }) => {
  const s = await seedBusiness()
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await chooseSlot(page)
  await fillClient(page, 'صيغة رقم', '+20 100-123-4567')
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible()
  const row = await one<{ client_phone: string }>('SELECT client_phone FROM appointments WHERE business_id=$1', [s.businessId])
  expect(row.client_phone).toBe('201001234567')
})

test('bad name and phone are refused', async ({ page }) => {
  const s = await seedBusiness()
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await chooseSlot(page)
  await fillClient(page, 'م', '123')
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText('الاسم مطلوب')).toBeVisible()
  await expect(page.getByText(/رقم الواتساب/).filter({ hasText: /غير صحيح|يجب/ })).toBeVisible()
})

test('a booked slot shows as booked and cannot be pressed', async ({ page }) => {
  const s = await seedBusiness()
  await seedAppointment(s, { appointment_date: isoDate(1), appointment_time: '09:00' })
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await expect(page.getByRole('button', { name: '9:30 ص', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '9:00 ص', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'محجوز' }).first()).toBeDisabled()
})

test('a long service closes the times it covers, and needs its whole length free', async ({ page }) => {
  const s = await seedBusiness()
  const long = await one<{ id: string }>(
    `INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1, 'خلع', 60, 500) RETURNING id`, [s.businessId])
  await seedAppointment(s, { service_id: long.id, appointment_date: isoDate(1), appointment_time: '10:00' })
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await expect(page.getByRole('button', { name: '9:30 ص', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '10:30 ص', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '11:00 ص', exact: true })).toBeEnabled()
  await page.reload()
  await chooseService(page, 'خلع')
  await chooseTomorrow(page)
  await expect(page.getByRole('button', { name: '9:30 ص', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '9:00 ص', exact: true })).toBeEnabled()
})

test('someone taking the slot first sends you back with a message, not a crash', async ({ page }) => {
  const s = await seedBusiness()
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await chooseSlot(page)
  await fillClient(page, 'متأخر', phone())
  await seedAppointment(s, { appointment_date: isoDate(1), appointment_time: '09:00' })
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText(/تم حجز هذا الموعد للتو/)).toBeVisible()
  await expect(page.getByText('اختر الموعد')).toBeVisible()
})

test('a third active booking from the same number is refused', async ({ page }) => {
  const s = await seedBusiness()
  const tel = phone()
  await seedAppointment(s, { client_phone: tel, appointment_date: isoDate(1), appointment_time: '12:00' })
  await seedAppointment(s, { client_phone: tel, appointment_date: isoDate(1), appointment_time: '12:30' })
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await chooseSlot(page)
  await fillClient(page, 'كتير', tel)
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText(/أقصى عدد حجوزات/)).toBeVisible()
})

test('back buttons walk back through the steps', async ({ page }) => {
  const s = await seedBusiness()
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await chooseSlot(page)
  await expect(page.getByText('بياناتك').first()).toBeVisible()
  await page.locator('button.text-gray-400').first().click()
  await expect(page.getByText('اختر الموعد')).toBeVisible()
  await page.locator('button.text-gray-400').first().click()
  await expect(page.getByText('اختر الخدمة')).toBeVisible()
})

test('multi-branch: the choice decides which branch is booked and whose slots show', async ({ page }) => {
  const s = await seedBusiness()
  const other = await one<{ id: string }>(
    `INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks)
     VALUES ($1,'فرع المعادي',false,1,(SELECT schedule_blocks FROM branches WHERE id=$2)) RETURNING id`, [s.businessId, s.branchId])
  await seedAppointment(s, { appointment_date: isoDate(1), appointment_time: '09:00' })
  await page.goto(`/book/${s.slug}`)
  await page.getByRole('button', { name: 'فرع المعادي' }).click()
  await chooseService(page)
  await chooseTomorrow(page)
  await chooseSlot(page) // free here though taken at the main branch
  const tel = phone()
  await fillClient(page, 'في المعادي', tel)
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible()
  await expect(page.getByText('فرع المعادي')).toBeVisible()
  const row = await one<{ branch_id: string }>('SELECT branch_id FROM appointments WHERE client_phone=$1', [tel])
  expect(row.branch_id).toBe(other.id)
})

async function fullDay(s, capacitySlots = ['00:00']) {
  await sql(`UPDATE branches SET schedule_blocks = $2::jsonb WHERE id=$1`, [s.branchId, JSON.stringify(
    Object.fromEntries(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].map(d => [d, [{ start: '09:00', end: '10:00' }]])))])
  for (const t of ['09:00', '09:30']) await seedAppointment(s, { appointment_date: isoDate(1), appointment_time: t })
  void capacitySlots
}

test('full day: joining the waitlist works and is recorded as waitlist', async ({ page }) => {
  const s = await seedBusiness()
  await fullDay(s)
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await page.getByRole('button', { name: 'انضم لقائمة الانتظار' }).click()
  const tel = phone()
  await fillClient(page, 'في الانتظار', tel)
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText('تم التسجيل في قائمة الانتظار!')).toBeVisible()
  expect((await one<{ status: string }>('SELECT status FROM appointments WHERE client_phone=$1', [tel])).status).toBe('waitlist')
})

test('backing out of the waitlist and picking another day makes a real booking', async ({ page }) => {
  const s = await seedBusiness()
  await fullDay(s)
  await page.goto(`/book/${s.slug}`)
  await chooseService(page)
  await chooseTomorrow(page)
  await page.getByRole('button', { name: 'انضم لقائمة الانتظار' }).click()
  await page.locator('button.text-gray-400').first().click()
  await page.getByRole('button', { name: 'اختر يوماً آخر' }).click()
  await page.locator('.overflow-x-auto button').nth(2).click()
  await chooseSlot(page)
  const tel = phone()
  await fillClient(page, 'غيرت رأيي', tel)
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible()
  expect((await one<{ status: string }>('SELECT status FROM appointments WHERE client_phone=$1', [tel])).status).toBe('confirmed')
})

test('a wrong link says so', async ({ page }) => {
  await page.goto('/book/does-not-exist-anywhere')
  await expect(page.getByText('صفحة الحجز غير موجودة')).toBeVisible()
})

for (const [name, fields] of [
  ['suspended', { is_active: false }],
  ['expired', { trial_ends_at: new Date(Date.now() - 86400000).toISOString() }],
] as const) {
  test(`a ${name} business takes no bookings, on screen or through the API`, async ({ page }) => {
    const s = await seedBusiness({ fields })
    await page.goto(`/book/${s.slug}`)
    await expect(page.getByText('الحجز غير متاح حالياً')).toBeVisible()
    const denied = await page.evaluate(async ({ business, branch, service, date }) => {
      const res = await fetch('http://127.0.0.1:54399/rest/v1/appointments', {
        method: 'POST',
        headers: { apikey: 'local-anon-key', authorization: 'Bearer local-anon-key', 'content-type': 'application/json' },
        body: JSON.stringify({ business_id: business, branch_id: branch, service_id: service, client_name: 'مهاجم', client_phone: '201000000000', appointment_date: date, appointment_time: '09:00', status: 'confirmed' }),
      })
      return res.status
    }, { business: s.businessId, branch: s.branchId, service: s.serviceId, date: isoDate(1) })
    expect(denied).toBeGreaterThanOrEqual(400)
  })
}

test('the page works by id as well as by slug (old links and retargeting messages)', async ({ page }) => {
  const s = await seedBusiness()
  await page.goto(`/book/${s.businessId}`)
  await expect(page.getByText('اختر الخدمة')).toBeVisible()
})

test('a business with no services says so instead of a dead end', async ({ page }) => {
  const s = await seedBusiness({ noService: true })
  await page.goto(`/book/${s.slug}`)
  await expect(page.getByText('لا توجد خدمات متاحة حالياً')).toBeVisible()
})

test('the visitor never receives private business columns', async ({ page }) => {
  const s = await seedBusiness({ fields: { owner_phone: '201999999999' } })
  const bodies: string[] = []
  page.on('response', async r => { if (r.url().includes('/rest/v1/')) bodies.push(await r.text().catch(() => '')) })
  await page.goto(`/book/${s.slug}`)
  await expect(page.getByText('اختر الخدمة')).toBeVisible()
  expect(bodies.join('')).not.toContain('201999999999')
})
