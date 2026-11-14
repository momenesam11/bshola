import { test, expect, seedBusiness, seedAppointment, isoDate, API, ADMIN_PASSWORD } from './helpers'
import type { Page } from '@playwright/test'

// /admin "sleeping clinics": open accounts with no new booking in a week, and
// the per-clinic usage column (migration 050).

const adminIn = async (page: Page) => {
  await page.goto('/admin')
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.keyboard.press('Enter')
  await expect(page.getByText('لوحة تحكم بسهولة')).toBeVisible()
}
const call = (payload: Record<string, unknown>) =>
  fetch(`${API}/functions/v1/admin`, { method: 'POST', body: JSON.stringify(payload) })
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

test.describe('admin sleeping clinics', () => {
  test('lists a quiet clinic with a check-in message and leaves busy and new ones out', async ({ page }) => {
    const quiet = await seedBusiness({ fields: { created_at: daysAgo(30), owner_phone: '201000000321' } })
    await seedAppointment(quiet, { appointment_date: isoDate(-10), status: 'completed', reminder_sent: true, created_at: daysAgo(10) })
    const never = await seedBusiness({ fields: { created_at: daysAgo(15) } })
    const busy = await seedBusiness({ fields: { created_at: daysAgo(30) } })
    await seedAppointment(busy, { appointment_date: isoDate(-2), status: 'completed', reminder_sent: true, created_at: daysAgo(2) })
    await seedAppointment(busy, { appointment_date: isoDate(-1), appointment_time: '11:00', status: 'completed', created_at: daysAgo(2) })
    const fresh = await seedBusiness({ fields: { created_at: daysAgo(2) } })
    const expired = await seedBusiness({ fields: { created_at: daysAgo(30), trial_ends_at: daysAgo(1) } })

    await adminIn(page)
    const section = page.getByTestId('sleeping-clinics')
    await expect(section).toBeVisible()
    const row = section.getByTestId('sleeping-clinic').filter({ hasText: quiet.name })
    await expect(row).toContainText('آخر حجز من 10 يوم')
    await expect(section.getByTestId('sleeping-clinic').filter({ hasText: never.name })).toContainText('مفيش ولا حجز من ساعة ما سجّل')
    for (const s of [busy, fresh, expired]) {
      await expect(section.getByTestId('sleeping-clinic').filter({ hasText: s.name })).toHaveCount(0)
    }

    const href = await row.getByRole('link', { name: 'اطمن عليها' }).getAttribute('href')
    expect(href).toContain('https://wa.me/201000000321?text=')
    expect(decodeURIComponent(href!.split('text=')[1])).toContain('مفيش حجوزات اتسجلت على حسابك')

    // The table shows the last 30 days for every clinic.
    await page.getByPlaceholder('بحث بالاسم أو رقم التليفون...').fill(busy.name)
    const usage = page.locator('tr', { hasText: busy.name }).getByTestId('usage-cell')
    await expect(usage).toContainText('2 موعد · 1 تذكير')
    await expect(usage).toContainText('آخر حجز من 2 يوم')
    await page.getByPlaceholder('بحث بالاسم أو رقم التليفون...').fill(fresh.name)
    await expect(page.locator('tr', { hasText: fresh.name }).getByTestId('usage-cell')).toContainText('مفيش حجوزات')
  })

  test('the activity action needs an admin session and returns counts only', async ({ page }) => {
    const s = await seedBusiness({ fields: { created_at: daysAgo(20) } })
    await seedAppointment(s, { appointment_date: isoDate(-3), created_at: daysAgo(3) })
    expect((await call({ action: 'activity', token: 'fake' })).status).toBe(401)

    await adminIn(page)
    const token = await page.evaluate(() => sessionStorage.getItem('beshola_admin_token'))
    const body = await (await call({ action: 'activity', token })).json()
    const row = body.activity.find((a: { business_id: string }) => a.business_id === s.businessId)
    expect(Object.keys(row).sort()).toEqual(['bookings_30d', 'business_id', 'last_booking_at', 'reminders_30d', 'visits_30d'])
    expect(row).toMatchObject({ bookings_30d: 1, visits_30d: 1, reminders_30d: 0 })
  })
})

test.describe('admin renewal summary', () => {
  test('shows the last 30 days and a ready WhatsApp message to the doctor', async ({ page }) => {
    const s = await seedBusiness({ fields: {
      created_at: daysAgo(60), owner_phone: '201000000432', subscription_type: 'paid',
      trial_ends_at: new Date(Date.now() + 3 * 86400000 + 3600000).toISOString(),
    } })
    await seedAppointment(s, { appointment_date: isoDate(-4), status: 'completed', reminder_sent: true })
    await seedAppointment(s, { appointment_date: isoDate(-3), appointment_time: '11:00', status: 'completed', booking_ip_hash: 'x' })
    await seedAppointment(s, { appointment_date: isoDate(-2), appointment_time: '12:00', status: 'no_show' })

    await adminIn(page)
    await page.getByPlaceholder('بحث بالاسم أو رقم التليفون...').fill(s.name)
    await page.locator('tr', { hasText: s.name }).getByTitle('ملخص آخر 30 يوم').click()
    const modal = page.getByTestId('summary-modal')
    const message = modal.getByTestId('summary-message')
    await expect(message).toContainText('3 موعد، منهم 1 حجزوا بنفسهم من لينك الحجز')
    await expect(message).toContainText('2 حضروا و1 ما جوش، يعني نسبة الحضور 67%')
    await expect(message).toContainText('اشتراكك بتخلص بعد 4 أيام')
    const href = await modal.getByRole('link', { name: 'ابعت الملخص للدكتور' }).getAttribute('href')
    expect(href).toContain('https://wa.me/201000000432?text=')
    expect(decodeURIComponent(href!.split('text=')[1])).toContain('نسبة الحضور 67%')
  })

  test('the summary action needs an admin session', async () => {
    const s = await seedBusiness()
    expect((await call({ action: 'summary', id: s.businessId, token: 'fake' })).status).toBe(401)
  })
})
