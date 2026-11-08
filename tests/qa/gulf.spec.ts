import { test, expect, seedBusiness, seedAppointment, login, one, isoDate } from './helpers'

// A Saudi clinic: riyal everywhere it shows money, Saudi numbers by default.

const saudi = () => seedBusiness({ fields: { country: 'SA', currency: 'SAR', phone: '966500000999' } })

test('a visitor books with a local Saudi number, and prices are in riyal', async ({ page }) => {
  const s = await saudi()
  await page.goto(`/book/${s.slug}`)
  await expect(page.getByText(/200 ر\.س/).first()).toBeVisible()
  await expect(page.getByText('ج.م')).toHaveCount(0)
  await page.getByRole('button', { name: /كشف عام/ }).click()
  await page.locator('.overflow-x-auto button').nth(1).click()
  await page.getByRole('button', { name: '9:00 ص', exact: true }).click()
  await page.getByPlaceholder('مثال: محمد أحمد').fill('مراجع سعودي')
  // Typed the way Saudis write it locally, with the leading 0.
  await page.getByRole('textbox', { name: /واتساب/ }).fill('0501234567')
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible()
  const row = await one<{ client_phone: string }>('SELECT client_phone FROM appointments WHERE business_id=$1', [s.businessId])
  expect(row.client_phone).toBe('966501234567')
})

test('no Egyptian pound on any owner screen of a Saudi clinic', async ({ page }) => {
  const s = await saudi()
  const appt = await seedAppointment(s, { client_phone: '966501112233', price: 350, status: 'completed' })
  await login(page, s)
  const found: string[] = []
  for (const path of ['/dashboard', '/appointments', '/crm', '/reports', '/settings', `/patients/${appt.client_phone}`]) {
    await page.goto(path)
    await page.waitForTimeout(800)
    // The country/currency picker lists every currency; that list doesn't count.
    const text = await page.evaluate(() => {
      const copy = document.body.cloneNode(true) as HTMLElement
      copy.querySelectorAll('select, option').forEach(e => e.remove())
      return copy.innerText
    })
    if (/ج\.م|جنيه/.test(text)) found.push(path)
  }
  expect(found).toEqual([])
})

test('the statement and the appointment form show riyal', async ({ page }) => {
  const s = await saudi()
  const appt = await seedAppointment(s, { client_phone: '966501112244', price: 350 })
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()
  await expect(page.getByText(/ر\.س/).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto(`/patients/${appt.client_phone}`)
  await page.getByRole('button', { name: 'كشف الحساب' }).click()
  await page.getByRole('button', { name: 'مصروف إضافي' }).click()
  await page.getByLabel('الوصف').fill('أشعة')
  await page.getByLabel('المبلغ').fill('120')
  await page.getByRole('button', { name: 'إضافة', exact: true }).click()
  await expect(page.getByText(/120 ر\.س/).first()).toBeVisible()
})

test('changing the country in settings switches the currency and is saved', async ({ page }) => {
  const s = await seedBusiness()
  await login(page, s)
  await page.goto('/settings')
  await page.getByRole('combobox').filter({ has: page.locator('option[value="AE"]') }).last().selectOption('AE')
  await page.getByRole('button', { name: 'حفظ', exact: true }).click()
  await expect(page.getByText('تم الحفظ')).toBeVisible()
  const b = await one<{ country: string; currency: string }>('SELECT country, currency FROM businesses WHERE id=$1', [s.businessId])
  expect(b).toEqual({ country: 'AE', currency: 'AED' })
})

test('the reminder to a Saudi patient goes to the full international number', async ({ page }) => {
  const s = await saudi()
  await seedAppointment(s, { client_name: 'تذكير سعودي', client_phone: '966501119988', appointment_date: isoDate(1) })
  await page.addInitScript(() => {
    (window as unknown as { __urls: string[] }).__urls = []
    window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
  })
  await login(page, s)
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'تذكير', exact: true }).click()
  const url = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls[0])
  expect(url).toContain('wa.me/966501119988')
})
