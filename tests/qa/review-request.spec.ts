import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, expectToast } from './helpers'

// Asking a patient for a Google review after a finished visit (migration 051).

const captureWhatsApp = () => {
  (window as unknown as { __urls: string[] }).__urls = []
  window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
}

test.describe('google review requests', () => {
  test('without a link the dashboard points to Settings, and saving one there turns on the button', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { client_name: 'مريض خلص', appointment_date: isoDate(0), status: 'completed' })
    await login(page, s)
    await page.goto('/dashboard')
    const panel = page.getByTestId('review-requests')
    await expect(panel).toContainText('حط لينك التقييم بتاع جوجل الأول')
    await panel.getByRole('link', { name: 'الإعدادات' }).click()

    await expect(page.getByText('لينك التقييم على جوجل')).toBeVisible()
    const field = page.getByLabel('لينك التقييم على جوجل')
    await field.fill('http://g.page/r/test')
    await page.getByRole('button', { name: 'حفظ اللينك' }).click()
    await expect(page.getByText('اللينك لازم يبدأ بـ https://')).toBeVisible()
    await field.fill('https://g.page/r/test-review')
    await page.getByRole('button', { name: 'حفظ اللينك' }).click()
    await expect.poll(async () => (await one<{ u: string }>('SELECT google_review_url u FROM businesses WHERE id=$1', [s.businessId])).u)
      .toBe('https://g.page/r/test-review')

    await page.goto('/dashboard')
    await expect(page.getByTestId('review-candidate').filter({ hasText: 'مريض خلص' })).toBeVisible()
  })

  test('sends the request once and never offers the same number again', async ({ page }) => {
    const s = await seedBusiness({ fields: { google_review_url: 'https://g.page/r/clinic' } })
    const done = await seedAppointment(s, { client_name: 'منى', appointment_date: isoDate(-1), status: 'completed' })
    await seedAppointment(s, { client_name: 'لسه ما جاش', appointment_date: isoDate(0), appointment_time: '23:00' })
    await seedAppointment(s, { client_name: 'زيارة قديمة', appointment_date: isoDate(-10), status: 'completed' })
    await page.addInitScript(captureWhatsApp)
    await login(page, s)
    await page.goto('/dashboard')

    const rows = page.getByTestId('review-candidate')
    await expect(rows).toHaveCount(1)
    await rows.getByRole('button', { name: 'اطلب تقييم' }).click()
    await expect(rows).toContainText('اتبعت')
    const url = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls[0])
    expect(url).toContain(`wa.me/${done.client_phone}`)
    expect(decodeURIComponent(url.split('text=')[1])).toContain('https://g.page/r/clinic')
    await expect.poll(async () => (await one<{ r: string | null }>('SELECT review_requested_at r FROM appointments WHERE id=$1', [done.id])).r).not.toBeNull()

    // A later visit by the same patient isn't offered again.
    await seedAppointment(s, { client_name: 'منى', client_phone: done.client_phone, appointment_date: isoDate(0), appointment_time: '08:00', status: 'completed' })
    await page.reload()
    await expect(page.getByTestId('review-requests')).toHaveCount(0)
  })

  test('marking a visit completed puts it on the dashboard list', async ({ page }) => {
    const s = await seedBusiness({ fields: { google_review_url: 'https://g.page/r/clinic' } })
    await seedAppointment(s, { client_name: 'هيخلص دلوقتي', appointment_date: isoDate(0), appointment_time: '01:00' })
    await login(page, s)
    await page.goto('/dashboard')
    await expect(page.getByTestId('review-requests')).toHaveCount(0)
    await page.goto('/appointments')
    await page.getByRole('button', { name: 'تعديل' }).first().click()
    await page.locator('form').getByRole('button', { name: 'مكتمل' }).click()
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expectToast(page, 'تم حفظ الموعد')
    await page.getByRole('link', { name: 'الرئيسية' }).first().click()
    await expect(page.getByTestId('review-candidate').filter({ hasText: 'هيخلص دلوقتي' })).toBeVisible()
  })
})
