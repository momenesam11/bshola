import { test, expect, seedBusiness, seedAppointment, login, one, sql, phone, isoDate, expectToast } from './helpers'
import type { Page } from '@playwright/test'

const form = (page: Page) => page.locator('form')

async function fillNew(page: Page, name: string, tel: string) {
  await page.getByPlaceholder('محمد أحمد').fill(name)
  await page.getByRole('textbox', { name: /واتساب/ }).fill(tel)
}

test('adding an appointment saves it and it appears in the list right away', async ({ page }) => {
  const s = await seedBusiness()
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()
  const tel = phone()
  await fillNew(page, 'أحمد علي', tel)
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expectToast(page, 'تم الحجز بنجاح')
  await expect(page.getByRole('cell', { name: /أحمد علي/ })).toBeVisible()
  const row = await one<{ price: string; status: string }>('SELECT price, status FROM appointments WHERE client_phone = $1', [tel])
  expect(row.status).toBe('confirmed')
  expect(Number(row.price)).toBe(200) // prefilled from the service
})

test('calendar cards fit their text, and overlapping visits sit side by side', async ({ page }) => {
  const s = await seedBusiness({ capacity: 60 })
  const long = await one<{ id: string }>(
    `INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1, 'خلع', 60, 0) RETURNING id`, [s.businessId])
  await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '10:00', client_name: 'زيارة طويلة', service_id: long.id })
  await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '10:30', client_name: 'زيارة قصيرة' })
  await login(page, s)
  await page.goto('/dashboard')
  const card = (name: string) => page.locator('.absolute.rounded-xl:visible').filter({ hasText: name })
  await expect(card('زيارة قصيرة')).toBeVisible()
  expect(await card('زيارة قصيرة').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
  const longBox = await card('زيارة طويلة').boundingBox()
  const shortBox = await card('زيارة قصيرة').boundingBox()
  expect(shortBox!.x + shortBox!.width).toBeLessThanOrEqual(longBox!.x + 1)
})

test('required fields and a bad phone are refused with a message', async ({ page }) => {
  const s = await seedBusiness()
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expect(page.getByText('اسم العميل مطلوب')).toBeVisible()
  await fillNew(page, 'أحمد علي', '123')
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expect(page.getByText(/رقم الواتساب/).filter({ hasText: /غير صحيح|يجب/ })).toBeVisible()
  expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE business_id=$1', [s.businessId])).n).toBe(0)
})

test('a slot already taken is refused with a clear message', async ({ page }) => {
  const s = await seedBusiness()
  await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '09:00' })
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()
  await fillNew(page, 'سارة', phone())
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expect(page.getByText('هذا الموعد ممتلئ بالفعل', { exact: false }).first()).toBeVisible()
})

test('a client with 2 active bookings needs a confirmation for a third', async ({ page }) => {
  const s = await seedBusiness()
  const tel = phone()
  await seedAppointment(s, { client_phone: tel, appointment_time: '10:00' })
  await seedAppointment(s, { client_phone: tel, appointment_time: '11:00' })
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()
  await fillNew(page, 'عميل كتير', tel)
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expect(page.getByText('حجز نشط بالفعل')).toBeVisible()
  await page.getByRole('button', { name: 'تأكيد', exact: true }).click()
  await expectToast(page, 'تم الحجز بنجاح')
})

for (const [status, label] of [['completed', 'مكتمل'], ['no_show', 'لم يحضر'], ['cancelled', 'ملغي']] as const) {
  test(`changing status to ${label} saves and refreshes the list`, async ({ page }) => {
    const s = await seedBusiness()
    const appt = await seedAppointment(s, { price: 200 })
    await login(page, s)
    await page.goto('/appointments')
    await page.getByRole('button', { name: 'تعديل' }).first().click()
    await form(page).getByRole('button', { name: label }).click()
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expectToast(page, 'تم حفظ الموعد')
    expect((await one<{ status: string }>('SELECT status FROM appointments WHERE id=$1', [appt.id])).status).toBe(status)
    // The badge in the row, without reloading.
    await expect(page.locator('tbody tr').first().getByText(label)).toBeVisible()
  })
}

test('completing a priced appointment adds exactly one charge, even if toggled back and forth', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s, { price: 350 })
  await login(page, s)
  await page.goto('/appointments')
  for (const label of ['مكتمل', 'مؤكد', 'مكتمل']) {
    await page.getByRole('button', { name: 'تعديل' }).first().click()
    await form(page).getByRole('button', { name: label }).click()
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expectToast(page, 'تم حفظ الموعد')
    await expect(form(page)).toHaveCount(0)
  }
  const rows = await sql<{ amount: string }>(`SELECT amount FROM client_ledger_entries WHERE related_appointment_id = $1`, [appt.id])
  expect(rows.map(r => Number(r.amount))).toEqual([350])
})

test('an online booking (no price of its own) is charged at the service price on completion', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s) // no price, like a visitor's booking
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: 'تعديل' }).first().click()
  await form(page).getByRole('button', { name: 'مكتمل' }).click()
  await page.getByRole('button', { name: 'حفظ', exact: true }).click()
  await expectToast(page, 'تم حفظ الموعد')
  const row = await one<{ amount: string }>('SELECT amount FROM client_ledger_entries WHERE related_appointment_id=$1', [appt.id])
  expect(Number(row.amount)).toBe(200)
})

test('cancel button: asks first, then cancels and refreshes', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: 'تعديل' }).first().click()
  await page.getByRole('button', { name: 'إلغاء الموعد' }).click()
  await expect(page.getByText(/متأكد إنك عايز تلغي/)).toBeVisible()
  await page.getByRole('button', { name: 'إلغاء الموعد' }).last().click()
  await expectToast(page, 'تم إلغاء الموعد')
  expect((await one<{ status: string }>('SELECT status FROM appointments WHERE id=$1', [appt.id])).status).toBe('cancelled')
  await expect(page.locator('tbody tr').first().getByText('ملغي')).toBeVisible()
})

test('delete button: asks first, deletes, tells you, and the row goes away', async ({ page }) => {
  const s = await seedBusiness()
  const appt = await seedAppointment(s)
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: 'تعديل' }).first().click()
  await page.getByTitle('حذف الموعد نهائياً').click()
  await page.getByRole('button', { name: 'حذف', exact: true }).click()
  await expectToast(page, 'تم حذف الموعد')
  await expect(page.locator('tbody tr')).toHaveCount(0)
  expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE id=$1', [appt.id])).n).toBe(0)
})

test('filters: status tabs, search by name and phone, clear', async ({ page }) => {
  const s = await seedBusiness()
  await seedAppointment(s, { client_name: 'منى', appointment_time: '10:00', status: 'completed' })
  const b = await seedAppointment(s, { client_name: 'خالد', appointment_time: '11:00' })
  await login(page, s)
  await page.goto('/appointments')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: 'مكتمل', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByRole('cell', { name: /منى/ })).toBeVisible()
  await page.getByRole('button', { name: 'الكل', exact: true }).click()
  await page.getByPlaceholder('ابحث باسم العميل أو رقمه...').fill(b.client_phone)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: 'إلغاء كل الفلاتر' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
})

test('"all branches" view can still add an appointment by choosing a branch', async ({ page }) => {
  const s = await seedBusiness()
  await sql(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'فرع المعادي',false,1)`, [s.businessId])
  await page.addInitScript(() => localStorage.setItem('beshola_branch_id', 'all'))
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()
  await fillNew(page, 'من كل الفروع', phone())
  await page.getByText('اختر الفرع...').click()
  await page.getByRole('button', { name: 'فرع المعادي' }).last().click()
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expectToast(page, 'تم الحجز بنجاح')
  const row = await one<{ name: string }>(`SELECT b.name FROM appointments a JOIN branches b ON b.id = a.branch_id WHERE a.business_id = $1`, [s.businessId])
  expect(row.name).toBe('فرع المعادي')
})

test('waitlist: the alert appears on cancelling and promotes the first person', async ({ page, opened: _ }) => {
  const s = await seedBusiness()
  const date = isoDate(2)
  const appt = await seedAppointment(s, { appointment_date: date, appointment_time: '10:00' })
  // A visitor joins the waitlist for a whole day, the only way the page allows.
  const wait = await seedAppointment(s, { client_name: 'منتظرة', appointment_date: date, appointment_time: '00:00', status: 'waitlist' })
  await page.addInitScript(() => { window.open = () => window })
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: 'الكل', exact: true }).click()
  await page.locator('tr', { hasText: 'عميل تجربة' }).getByRole('button', { name: 'تعديل' }).click()
  await form(page).getByRole('button', { name: 'ملغي' }).click()
  await page.getByRole('button', { name: /أبلّغ منتظرة/ }).click()
  await expect(page.getByText('تم فتح واتساب للعميل الأول')).toBeVisible()
  await expect.poll(async () =>
    (await one<{ status: string; t: string }>('SELECT status, appointment_time::text t FROM appointments WHERE id=$1', [wait.id])).status,
  ).toBe('confirmed')
  // They take the freed slot, not midnight.
  const moved = await one<{ t: string }>('SELECT appointment_time::text t FROM appointments WHERE id=$1', [wait.id])
  expect(moved.t.slice(0, 5)).toBe('10:00')
  void appt
})

test.describe('tomorrow reminders on the dashboard', () => {
  test('the message has the real date, and the reminder is remembered after reload', async ({ page }) => {
    const s = await seedBusiness()
    const appt = await seedAppointment(s, { client_name: 'تذكير', appointment_date: isoDate(1) })
    await page.addInitScript(() => {
      (window as unknown as { __urls: string[] }).__urls = []
      window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
    })
    await login(page, s)
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'تذكير', exact: true }).click()
    const url = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls[0])
    const text = decodeURIComponent(url.split('text=')[1])
    expect(url).toContain(appt.client_phone)
    expect(text).toMatch(/التاريخ: \S+/) // a date, not an empty line
    expect(text).not.toContain('Invalid')
    await expect.poll(async () =>
      (await one<{ r: boolean }>('SELECT reminder_sent r FROM appointments WHERE id=$1', [appt.id])).r,
    ).toBe(true)
    await page.reload()
    await expect(page.getByText('تم', { exact: true })).toBeVisible()
  })

  test('marking one client as reminded does not mark the others', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { client_name: 'الأول', appointment_date: isoDate(1), appointment_time: '10:00' })
    await seedAppointment(s, { client_name: 'التاني', appointment_date: isoDate(1), appointment_time: '11:00' })
    await page.addInitScript(() => { window.open = () => window })
    await login(page, s)
    await page.goto('/dashboard')
    await expect(page.getByRole('button', { name: 'إرسال الكل' })).toBeVisible()
    await page.getByRole('button', { name: 'تذكير', exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'تذكير', exact: true })).toHaveCount(1)
    // One is still pending, so "send all" must still be offered with a count of 1.
    await expect(page.getByRole('button', { name: 'إرسال الكل' })).toBeVisible()
  })

  test('with two branches, each branch shows only its own reminders', async ({ page }) => {
    const s = await seedBusiness()
    const other = await one<{ id: string }>(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'فرع تاني',false,1) RETURNING id`, [s.businessId])
    await seedAppointment(s, { client_name: 'في الرئيسي', appointment_date: isoDate(1) })
    await seedAppointment(s, { client_name: 'في التاني', appointment_date: isoDate(1), branch_id: other.id })
    await login(page, s)
    await page.goto('/dashboard')
    await expect(page.getByText('في الرئيسي').first()).toBeVisible()
    await expect(page.getByText('في التاني')).toHaveCount(0)
  })

  test('"send all" walks through every client', async ({ page }) => {
    const s = await seedBusiness()
    const a = await seedAppointment(s, { client_name: 'الأول', appointment_date: isoDate(1), appointment_time: '10:00' })
    const b = await seedAppointment(s, { client_name: 'التاني', appointment_date: isoDate(1), appointment_time: '11:00' })
    await page.addInitScript(() => { window.open = () => window })
    await login(page, s)
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'إرسال الكل' }).click()
    await page.getByRole('button', { name: /افتح واتساب لـ/ }).click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByRole('button', { name: /افتح واتساب لـ/ }).click()
    await page.getByRole('button', { name: 'إنهاء' }).click()
    await expect.poll(async () =>
      (await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE id = ANY($1::uuid[]) AND reminder_sent', [[a.id, b.id]])).n,
    ).toBe(2)
  })
})
