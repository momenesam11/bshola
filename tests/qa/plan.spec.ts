import { test, expect, seedBusiness, seedAppointment, login, one, sql, phone, expectToast } from './helpers'

// "خطة الزيارات" in the client drawer: the feature that failed while being
// demoed. Every button on the tab, start to finish.

async function openPlanTab(page, s, clientPhone) {
  await login(page, s)
  await page.goto('/crm')
  await page.getByRole('button', { name: 'عرض الملف' }).first().click()
  await page.getByRole('button', { name: 'خطة الزيارات' }).click()
  await expect(page.getByText(clientPhone).first()).toBeVisible()
}

test('creating a plan shows it, with one row per visit, and saves exactly one plan', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  await openPlanTab(page, s, appt.client_phone)

  await page.getByRole('button', { name: 'إضافة خطة' }).click()
  await page.getByLabel('اسم الخطة').fill('كورس علاج الأسنان')
  await page.getByLabel('عدد الزيارات').fill('3')
  await page.getByRole('button', { name: 'إنشاء' }).click()

  await expect(page.getByText('كورس علاج الأسنان')).toBeVisible()
  await expect(page.getByText('0 من 3 زيارات مكتملة')).toBeVisible()
  await expect(page.getByRole('button', { name: 'حجز الآن' })).toHaveCount(3)

  const { n } = await one<{ n: number }>('SELECT count(*)::int n FROM client_plans WHERE business_id = $1', [s.businessId])
  expect(n).toBe(1)
  const visits = await sql('SELECT status FROM client_plan_visits v JOIN client_plans p ON p.id = v.plan_id WHERE p.business_id = $1', [s.businessId])
  expect(visits).toHaveLength(3)
})

test('an empty plan name shows an error instead of doing nothing', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  await openPlanTab(page, s, appt.client_phone)
  await page.getByRole('button', { name: 'إضافة خطة' }).click()
  await page.getByRole('button', { name: 'إنشاء' }).click()
  await expect(page.getByText('اكتب اسم الخطة')).toBeVisible()
  const { n } = await one<{ n: number }>('SELECT count(*)::int n FROM client_plans WHERE business_id = $1', [s.businessId])
  expect(n).toBe(0)
})

test.describe('visit counts the database would reject', () => {
  for (const bad of ['0', '-2', '51']) {
    test(`${bad} visits is refused with a message`, async ({ page }) => {
      const s = await seedBusiness()
      const appt = await seedAppointment(s)
      await openPlanTab(page, s, appt.client_phone)
      await page.getByRole('button', { name: 'إضافة خطة' }).click()
      await page.getByLabel('اسم الخطة').fill('خطة')
      await page.getByLabel('عدد الزيارات').fill(bad)
      await page.getByRole('button', { name: 'إنشاء' }).click()
      await expect(page.getByText('عدد الزيارات لازم يكون من 1 لـ 50')).toBeVisible()
      const { n } = await one<{ n: number }>('SELECT count(*)::int n FROM client_plans WHERE business_id = $1', [s.businessId])
      expect(n).toBe(0)
    })
  }
})

async function seedPlan(s, clientPhone, visits = 2) {
  const plan = await one<{ id: string }>(
    `INSERT INTO client_plans (business_id, client_phone, name, total_visits) VALUES ($1,$2,'خطة العلاج',$3) RETURNING id`,
    [s.businessId, clientPhone, visits])
  for (let i = 1; i <= visits; i++) {
    await sql('INSERT INTO client_plan_visits (plan_id, visit_number) VALUES ($1,$2)', [plan.id, i])
  }
  return plan
}

test('booking a visit links the appointment; attending and missing it update the plan', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  await seedPlan(s, appt.client_phone)
  await openPlanTab(page, s, appt.client_phone)

  await page.getByRole('button', { name: 'حجز الآن' }).first().click()
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expectToast(page, 'تم الحجز بنجاح')

  // Booked: the row now offers the appointment instead of "book".
  await expect(page.getByText('محجوزة')).toBeVisible()
  await expect(page.getByRole('button', { name: 'حجز الآن' })).toHaveCount(1)
  const visit = await one<{ status: string; appointment_id: string }>(
    `SELECT v.status, v.appointment_id FROM client_plan_visits v JOIN client_plans p ON p.id = v.plan_id
     WHERE p.business_id = $1 AND v.visit_number = 1`, [s.businessId])
  expect(visit.status).toBe('scheduled')
  expect(visit.appointment_id).toBeTruthy()

  await page.getByRole('button', { name: 'عرض الموعد' }).click()
  await page.getByRole('button', { name: 'مكتمل' }).click()
  await page.getByRole('button', { name: 'حفظ', exact: true }).click()
  await expectToast(page, 'تم حفظ الموعد')
  await expect(page.getByText('1 من 2 زيارات مكتملة')).toBeVisible()
})

test('cancelling the appointment frees the visit to be rebooked', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  await seedPlan(s, appt.client_phone, 1)
  await openPlanTab(page, s, appt.client_phone)

  await page.getByRole('button', { name: 'حجز الآن' }).click()
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expectToast(page, 'تم الحجز بنجاح')
  await page.getByRole('button', { name: 'عرض الموعد' }).click()
  await page.getByRole('button', { name: 'إلغاء الموعد' }).click()
  await page.getByRole('button', { name: 'إلغاء الموعد' }).last().click()
  await expect(page.getByRole('button', { name: 'إعادة حجز' })).toBeVisible()
})

test('deleting the linked appointment does not leave the visit stuck with no buttons', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  await seedPlan(s, appt.client_phone, 1)
  await openPlanTab(page, s, appt.client_phone)

  await page.getByRole('button', { name: 'حجز الآن' }).click()
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expectToast(page, 'تم الحجز بنجاح')
  await page.getByRole('button', { name: 'عرض الموعد' }).click()
  await page.getByTitle('حذف الموعد نهائياً').click()
  await page.getByRole('button', { name: 'حذف', exact: true }).click()
  await expect(page.getByRole('button', { name: 'حجز الآن' })).toBeVisible()
})

test('the suggested date is saved and prefilled when booking', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  const plan = await seedPlan(s, appt.client_phone, 1)
  await openPlanTab(page, s, appt.client_phone)
  await page.getByText('تاريخ مقترح').click()
  await page.getByRole('button', { name: 'اليوم', exact: true }).click()
  await expect.poll(async () =>
    (await one<{ d: string | null }>('SELECT suggested_date::text d FROM client_plan_visits WHERE plan_id = $1', [plan.id])).d,
  ).toBeTruthy()
})

test('deleting a plan removes it and keeps the booked appointments', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  const plan = await seedPlan(s, appt.client_phone, 1)
  const booked = await seedAppointment(s, { client_phone: appt.client_phone, appointment_time: '11:00', plan_visit_id: (await one<{ id: string }>('SELECT id FROM client_plan_visits WHERE plan_id=$1', [plan.id])).id })
  await openPlanTab(page, s, appt.client_phone)

  await page.getByRole('button', { name: 'حذف الخطة' }).click()
  await page.getByRole('button', { name: 'حذف', exact: true }).click()
  await expect(page.getByText('لا توجد خطة زيارات لهذا العميل')).toBeVisible()
  expect((await one<{ n: number }>('SELECT count(*)::int n FROM client_plans WHERE id = $1', [plan.id])).n).toBe(0)
  expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE id = $1', [booked.id])).n).toBe(1)
})

test('a failure loading the plan is shown as an error, not as "no plan"', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  await seedPlan(s, appt.client_phone, 1)
  await page.route('**/rest/v1/client_plans*', r => r.request().method() === 'GET'
    ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'X', message: 'boom' }) })
    : r.continue())
  await openPlanTab(page, s, appt.client_phone)
  await expect(page.getByText('تعذر تحميل الخطة')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'إضافة خطة' })).toHaveCount(0)
})

test('a plan from another clinic cannot be read', async ({ page }) => {
  const a = await seedBusiness()
  const b = await seedBusiness()
  const shared = phone()
  await seedAppointment(a, { client_phone: shared })
  await seedAppointment(b, { client_phone: shared })
  await seedPlan(a, shared, 1)
  await openPlanTab(page, b, shared)
  await expect(page.getByText('لا توجد خطة زيارات لهذا العميل')).toBeVisible()
})
