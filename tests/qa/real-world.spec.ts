import { test, expect, seedBusiness, seedAppointment, login, one, sql, isoDate } from './helpers'

// Conditions real clinics hit that a tidy test database never does.

test('a patient typing the number in Arabic digits can book', async ({ page }) => {
  const s = await seedBusiness()
  await page.goto(`/book/${s.slug}`)
  await page.getByRole('button', { name: /كشف عام/ }).click()
  await page.locator('.overflow-x-auto button').nth(1).click()
  await page.getByRole('button', { name: '9:00 ص', exact: true }).click()
  await page.getByPlaceholder('مثال: محمد أحمد').fill('مريضة بالعربي')
  await page.getByRole('textbox', { name: /واتساب/ }).fill('٢٠١٠٠٧٧٧٨٨٩٩')
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible()
  const row = await one<{ client_phone: string }>('SELECT client_phone FROM appointments WHERE business_id=$1', [s.businessId])
  expect(row.client_phone).toBe('201007778899')
})

test('Persian digits (Gulf keyboards) work in the dashboard form too', async ({ page }) => {
  const s = await seedBusiness()
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()
  await page.getByPlaceholder('محمد أحمد').fill('عميل خليجي')
  await page.getByRole('textbox', { name: /واتساب/ }).fill('+۹۶۶۵۱۲۳۴۵۶۷۸')
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expect.poll(async () =>
    (await one<{ p: string }>('SELECT client_phone p FROM appointments WHERE business_id=$1', [s.businessId]))?.p,
  ).toBe('966512345678')
})

test('a clinic with more than 1000 appointments sees all of them in clients and reports', async ({ page }) => {
  test.setTimeout(120_000)
  // Today, so every report period includes them; 60 chairs so they fit.
  const s = await seedBusiness({ capacity: 60 })
  // 1200 completed visits, 1200 different clients.
  await sql(`
    INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time, status)
    SELECT $1, $2, $3, 'عميل ' || g, '2011' || lpad(g::text, 8, '0'),
           current_date, make_time(g % 20, 0, 0), 'completed'
    FROM generate_series(1, 1200) g`, [s.businessId, s.branchId, s.serviceId])
  await login(page, s)
  await page.goto('/crm')
  await expect(page.getByRole('button', { name: /^الكل\s*1200$/ })).toBeVisible({ timeout: 20000 })
  await page.goto('/reports')
  await expect(page.getByText(/^1200 موعد$/).filter({ visible: true })).toBeVisible({ timeout: 20000 })
})

test('double-clicking "confirm booking" books once', async ({ page }) => {
  const s = await seedBusiness()
  await page.goto(`/book/${s.slug}`)
  await page.getByRole('button', { name: /كشف عام/ }).click()
  await page.locator('.overflow-x-auto button').nth(1).click()
  await page.getByRole('button', { name: '9:00 ص', exact: true }).click()
  await page.getByPlaceholder('مثال: محمد أحمد').fill('مستعجل')
  await page.getByRole('textbox', { name: /واتساب/ }).fill('201005556666')
  await page.getByRole('button', { name: 'تأكيد الحجز' }).dblclick()
  await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible()
  expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE client_phone=$1', ['201005556666'])).n).toBe(1)
})

test('double-clicking "add appointment" in the dashboard adds once', async ({ page }) => {
  const s = await seedBusiness()
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()
  await page.getByPlaceholder('محمد أحمد').fill('ضغط مرتين')
  await page.getByRole('textbox', { name: /واتساب/ }).fill('201005557777')
  await page.getByRole('button', { name: 'إضافة الموعد' }).dblclick()
  await page.waitForTimeout(1500)
  expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE client_phone=$1', ['201005557777'])).n).toBe(1)
})

test('a server error while booking shows a message and keeps what was typed', async ({ page }) => {
  const s = await seedBusiness()
  await page.route('**/rest/v1/appointments', r => r.request().method() === 'POST'
    ? r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service Unavailable' }) })
    : r.continue())
  await page.goto(`/book/${s.slug}`)
  await page.getByRole('button', { name: /كشف عام/ }).click()
  await page.locator('.overflow-x-auto button').nth(1).click()
  await page.getByRole('button', { name: '9:00 ص', exact: true }).click()
  await page.getByPlaceholder('مثال: محمد أحمد').fill('النت فصل')
  await page.getByRole('textbox', { name: /واتساب/ }).fill('201005558888')
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.locator('[role="status"]').filter({ hasText: /حدث خطأ/ })).toBeVisible()
  await expect(page.getByPlaceholder('مثال: محمد أحمد')).toHaveValue('النت فصل')
})

test('a client name that looks like code is shown as text, never run', async ({ page }) => {
  const s = await seedBusiness()
  await seedAppointment(s, { client_name: '<img src=x onerror="window.__pwned=1">', appointment_date: isoDate(0), appointment_time: '23:00' })
  await login(page, s)
  for (const path of ['/dashboard', '/appointments', '/crm', '/reports']) {
    await page.goto(path)
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned), path).toBeUndefined()
  }
})

test('the browser bundle carries no server secret', async ({ page }) => {
  const scripts: string[] = []
  page.on('response', async r => { if (r.url().endsWith('.js')) scripts.push(await r.text().catch(() => '')) })
  for (const path of ['/', '/login', '/admin', '/dashboard']) await page.goto(path)
  const all = scripts.join('\n')
  expect(all).not.toContain('local-service-role-key')
  expect(all).not.toMatch(/service_role/)
  expect(all).not.toContain('local-admin-password')
})

test.describe('time zones', () => {
  for (const tz of ['Asia/Riyadh', 'Asia/Dubai']) {
    test.use({ timezoneId: tz })
    test(`a visitor in ${tz} books the time they clicked`, async ({ page }) => {
      const s = await seedBusiness()
      await page.goto(`/book/${s.slug}`)
      await page.getByRole('button', { name: /كشف عام/ }).click()
      await page.locator('.overflow-x-auto button').nth(1).click()
      await page.getByRole('button', { name: '9:00 ص', exact: true }).click()
      await page.getByPlaceholder('مثال: محمد أحمد').fill('من الخليج')
      await page.getByRole('textbox', { name: /واتساب/ }).fill('+966500000001')
      await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
      await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible()
      const row = await one<{ t: string }>('SELECT appointment_time::text t FROM appointments WHERE client_phone=$1 AND business_id=$2', ['966500000001', s.businessId])
      expect(row.t.slice(0, 5)).toBe('09:00')
    })
  }
})
