import { test, expect, seedBusiness, seedAppointment, API, isoDate } from './helpers'
import type { Page } from '@playwright/test'

async function injectSession(page: Page, ownerId: string, opts: { expired?: boolean; badRefresh?: boolean } = {}) {
  const res = await fetch(`${API}/__test/session`, { method: 'POST', body: JSON.stringify({ id: ownerId, ...opts }) })
  const session = await res.json()
  await page.addInitScript((value) => localStorage.setItem('sb-127-auth-token', value), JSON.stringify(session))
}

test.describe('sessions', () => {
  test('an expired session renews itself and the dashboard still loads', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { client_name: 'بعد التجديد', appointment_date: isoDate(0), appointment_time: '23:00' })
    await injectSession(page, s.ownerId, { expired: true })
    await page.goto('/appointments')
    await expect(page.getByText('بعد التجديد').filter({ visible: true })).toBeVisible()
  })

  test('a session that can no longer renew lands on the login page, not a blank screen', async ({ page }) => {
    const s = await seedBusiness()
    await injectSession(page, s.ownerId, { expired: true, badRefresh: true })
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
  })

  test('logging out in one tab logs out the other tab too', async ({ page, context }) => {
    const s = await seedBusiness()
    await injectSession(page, s.ownerId)
    await page.goto('/dashboard')
    const other = await context.newPage()
    await other.goto('/dashboard')
    await expect(other).toHaveURL(/\/dashboard/)
    await other.getByRole('button', { name: 'تسجيل الخروج' }).first().click()
    await expect(other).toHaveURL(/\/login/)
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
  })
})

test.describe('printing', () => {
  test('the printed report has the clinic, the period, the numbers and every row', async ({ page }) => {
    const s = await seedBusiness()
    for (const [t, st] of [['08:00', 'completed'], ['09:00', 'no_show'], ['10:00', 'confirmed']]) {
      await seedAppointment(s, { client_name: `مطبوع ${t}`, appointment_date: isoDate(0), appointment_time: t, status: st })
    }
    await injectSession(page, s.ownerId)
    await page.goto('/reports')
    await expect(page.getByText('3 موعد').filter({ visible: true })).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    const printed = await page.evaluate(() => document.body.innerText)
    expect(printed).toContain(s.name)
    for (const t of ['08:00', '09:00', '10:00']) expect(printed).toContain(`مطبوع ${t}`)
    // Screen-only controls stay off the paper.
    expect(printed).not.toContain('تصدير CSV')
    const pdf = await page.pdf({ format: 'A4' })
    expect(pdf.byteLength).toBeGreaterThan(10_000)
  })

  test('the printed prescription shows the medicines, not the app around it', async ({ page }) => {
    const s = await seedBusiness()
    const appt = await seedAppointment(s)
    await fetch(`${API}/__test/sql`, { method: 'POST', body: JSON.stringify({
      sql: `INSERT INTO prescriptions (business_id, client_phone, medications, instructions) VALUES ($1, $2, $3::jsonb, 'بعد الأكل')`,
      params: [s.businessId, appt.client_phone, JSON.stringify([{ drug: 'أموكسيسيلين', dose: '500', freq: 'يومي', duration: '5 أيام' }])],
    }) })
    await injectSession(page, s.ownerId)
    await page.goto(`/patients/${appt.client_phone}`)
    await page.getByRole('button', { name: 'الروشتات' }).click()
    await expect(page.getByRole('cell', { name: 'أموكسيسيلين' })).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    const printed = await page.evaluate(() => document.body.innerText)
    expect(printed).toContain('أموكسيسيلين')
    expect(printed).toContain('بعد الأكل')
    expect(printed).not.toContain('روشتة جديدة')
  })
})
