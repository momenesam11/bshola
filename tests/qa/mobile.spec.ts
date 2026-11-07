import { test, expect, seedBusiness, seedAppointment, login, one, isoDate, expectToast, phone } from './helpers'

// Run by the "iphone" (WebKit, i.e. Safari) and "android" projects in
// playwright.local.config.ts. Most reception desks and patients are on phones.

const OWNER_PAGES = ['/dashboard', '/appointments', '/crm', '/reports', '/settings', '/settings/branches']
const PUBLIC_PAGES = ['/', '/product', '/faq', '/guides', '/tools/no-show-calculator', '/login', '/register', '/forgot-password', '/partner', '/admin']

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    if (doc.scrollWidth <= doc.clientWidth + 1) return null
    // Name the widest offender, so the report says what to fix.
    let worst = null
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.right > doc.clientWidth + 1 && (!worst || r.right > worst.right)) {
        worst = { right: Math.round(r.right), tag: el.tagName, cls: String(el.className).slice(0, 80), text: (el.textContent || '').trim().slice(0, 40) }
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, worst }
  })
}

test('no page scrolls sideways on a phone', async ({ page }) => {
  test.setTimeout(120_000)
  const s = await seedBusiness()
  const appt = await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '23:00' })
  const found = {}
  for (const path of PUBLIC_PAGES.concat([`/book/${s.slug}`])) {
    await page.goto(path)
    await page.waitForTimeout(600)
    const o = await overflow(page)
    if (o) found[path] = o
  }
  await login(page, s)
  for (const path of OWNER_PAGES.concat([`/patients/${appt.client_phone}`])) {
    await page.goto(path)
    await page.waitForTimeout(800)
    const o = await overflow(page)
    if (o) found[path] = o
  }
  expect(found).toEqual({})
})

test('booking from a phone, start to finish', async ({ page }) => {
  const s = await seedBusiness()
  await page.goto(`/book/${s.slug}`)
  await page.getByRole('button', { name: /كشف عام/ }).tap()
  await page.locator('.overflow-x-auto button').nth(1).tap()
  await page.getByRole('button', { name: '9:00 ص', exact: true }).tap()
  await page.getByPlaceholder('مثال: محمد أحمد').fill('من الموبايل')
  const tel = phone()
  await page.getByPlaceholder('201XXXXXXXXX').fill(tel)
  await page.getByRole('button', { name: 'تأكيد الحجز' }).tap()
  await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible()
  expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE client_phone=$1', [tel])).n).toBe(1)
})

test('the menu opens, navigates and logs out', async ({ page }) => {
  const s = await seedBusiness()
  await login(page, s)
  await page.goto('/dashboard')
  await page.getByLabel('القائمة', { exact: true }).tap()
  await page.getByRole('link', { name: 'العملاء' }).filter({ visible: true }).tap()
  await expect(page).toHaveURL(/\/crm/)
  await page.getByLabel('القائمة', { exact: true }).tap()
  await page.getByRole('button', { name: 'تسجيل الخروج' }).filter({ visible: true }).tap()
  await expect(page).toHaveURL(/\/login/)
})

test('appointments on a phone: card opens the edit form, saving updates the card', async ({ page }) => {
  const s = await seedBusiness()
  await seedAppointment(s, { client_name: 'كارت موبايل' })
  await login(page, s)
  await page.goto('/appointments')
  await page.getByText('كارت موبايل').filter({ visible: true }).tap()
  await page.locator('form').getByRole('button', { name: 'مكتمل' }).tap()
  await page.getByRole('button', { name: 'حفظ', exact: true }).tap()
  await expectToast(page, 'تم حفظ الموعد')
  await expect(page.locator('div.md\\:hidden').getByText('مكتمل').first()).toBeVisible()
})

test('a new appointment from a phone', async ({ page }) => {
  const s = await seedBusiness()
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).tap()
  await page.getByPlaceholder('محمد أحمد').fill('عميل موبايل')
  await page.getByPlaceholder('201XXXXXXXXX').fill(phone())
  await page.getByRole('button', { name: 'إضافة الموعد' }).tap()
  await expectToast(page, 'تم الحجز بنجاح')
  await expect(page.getByText('عميل موبايل').filter({ visible: true })).toBeVisible()
})

test('client drawer and visit plan on a phone', async ({ page }) => {
  const s = await seedBusiness()
  await seedAppointment(s)
  await login(page, s)
  await page.goto('/crm')
  await page.getByRole('button', { name: 'عرض الملف' }).first().tap()
  await page.getByRole('button', { name: 'خطة الزيارات' }).tap()
  await page.getByRole('button', { name: 'إضافة خطة' }).tap()
  await page.getByLabel('اسم الخطة').fill('خطة موبايل')
  await page.getByRole('button', { name: 'إنشاء' }).tap()
  await expect(page.getByText('خطة موبايل')).toBeVisible()
})

test('patient record fields save on a phone', async ({ page }) => {
  const s = await seedBusiness()
  const { client_phone: tel } = await seedAppointment(s)
  await login(page, s)
  await page.goto(`/patients/${tel}`)
  await page.getByRole('button', { name: 'O-', exact: true }).tap()
  await expect.poll(async () =>
    (await one<{ b: string }>('SELECT blood_type b FROM patient_records WHERE business_id=$1', [s.businessId]))?.b,
  ).toBe('O-')
})

test('every button on the phone menus and dialogs fits the screen', async ({ page }) => {
  const s = await seedBusiness()
  await seedAppointment(s)
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).tap()
  const vw = page.viewportSize()!.width
  // The closed side menu waits off-screen on purpose, and scrolling strips
  // (status tabs) are meant to run past the edge.
  const offscreen = await page.locator('button:visible').evaluateAll((els, width) =>
    els.filter(e => !e.closest('.pointer-events-none, .overflow-x-auto'))
      .map(e => e.getBoundingClientRect()).filter(r => r.right > width + 1 || r.left < -1).length, vw)
  expect(offscreen).toBe(0)
})
