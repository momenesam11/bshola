import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, sql, phone } from './helpers'
import type { Page } from '@playwright/test'

// Booking by turn (migration 057): the patient picks a period, the database
// gives the number, the page shows who is inside on the day itself.

const queueClinic = (fields: Record<string, unknown> = {}) => seedBusiness({ fields: { booking_mode: 'queue', ...fields } })

async function bookPeriod(page: Page, slug: string, name: string, dayIndex = 1) {
  await page.goto(`/book/${slug}`)
  await page.getByRole('button', { name: /كشف عام/ }).click()
  await page.locator('.overflow-x-auto button').nth(dayIndex).click()
  await page.getByTestId('queue-period').first().click()
  await page.getByPlaceholder('مثال: محمد أحمد').fill(name)
  await page.getByRole('textbox', { name: /واتساب/ }).fill(phone())
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
}

test.describe('booking by turn', () => {
  test('the clinic switches to turns and sets a limit in Settings', async ({ page }) => {
    const s = await seedBusiness()
    await login(page, s)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'ساعات العمل' }).first().click()
    await page.getByRole('radio', { name: /بالدور/ }).click()
    await page.getByLabel('أقصى عدد في الفترة (أونلاين)').fill('20')
    await page.getByRole('button', { name: 'حفظ طريقة الحجز' }).click()
    await expect.poll(async () => one<{ m: string; l: number }>('SELECT booking_mode m, queue_limit l FROM businesses WHERE id=$1', [s.businessId]))
      .toEqual({ m: 'queue', l: 20 })
  })

  test('patients pick a period and get numbers in order', async ({ page }) => {
    const s = await queueClinic()
    const card = async () => {
      await page.goto(`/book/${s.slug}`)
      await page.getByRole('button', { name: /كشف عام/ }).click()
      await page.locator('.overflow-x-auto button').nth(1).click()
      return page.getByTestId('queue-period').first()
    }
    await expect(await card()).toContainText('هتاخد رقم1')

    await bookPeriod(page, s.slug, 'الأول')
    await expect(page.getByTestId('queue-number')).toHaveText('1')
    await bookPeriod(page, s.slug, 'التاني')
    await expect(page.getByTestId('queue-number')).toHaveText('2')
    const rows = await sql<{ n: number; t: string }>(`SELECT queue_number n, appointment_time::text t FROM appointments WHERE business_id=$1 ORDER BY queue_number`, [s.businessId])
    expect(rows).toEqual([{ n: 1, t: '00:00:00' }, { n: 2, t: '00:00:00' }])
    await expect(await card()).toContainText('اتحجز 2')
  })

  test('a full period is closed and the waitlist is offered', async ({ page }) => {
    const s = await queueClinic({ queue_limit: 1 })
    await seedAppointment(s, { appointment_date: isoDate(1), appointment_time: '00:00' })
    await page.goto(`/book/${s.slug}`)
    await page.getByRole('button', { name: /كشف عام/ }).click()
    await page.locator('.overflow-x-auto button').nth(1).click()
    const period = page.getByTestId('queue-period').first()
    await expect(period).toContainText('الفترة اتملت')
    await expect(period).toBeDisabled()
    await page.getByRole('button', { name: 'انضم لقائمة الانتظار' }).click()
    await expect(page.getByPlaceholder('مثال: محمد أحمد')).toBeVisible()
  })

  test('booking for today shows the number inside once the session started', async ({ page }) => {
    const s = await queueClinic()
    const first = await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '00:00' })
    await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '00:00' })
    const today = async () => {
      await page.goto(`/book/${s.slug}`)
      await page.getByRole('button', { name: /كشف عام/ }).click()
      await page.locator('.overflow-x-auto button').nth(0).click()
      return page.getByTestId('inside-now')
    }
    await expect(await today()).toHaveText('الكشف لسه ما بدأش')
    await sql(`UPDATE appointments SET status='completed' WHERE id=$1`, [first.id])
    await expect(await today()).toHaveText('جوه دلوقتي رقم 2')
    await expect(page.getByTestId('queue-period').first()).toContainText('هتاخد رقم3')
  })

  test('the dashboard queue follows the numbers, and the reminder carries the number', async ({ page }) => {
    const s = await queueClinic()
    for (const name of ['رقم واحد', 'رقم اتنين']) await seedAppointment(s, { client_name: name, appointment_date: isoDate(0), appointment_time: '00:00' })
    const tomorrow = await seedAppointment(s, { client_name: 'بكرا', appointment_date: isoDate(1), appointment_time: '00:00' })
    expect((await one<{ n: number }>('SELECT queue_number n FROM appointments WHERE id=$1', [tomorrow.id])).n).toBe(1)
    await page.addInitScript(() => {
      (window as unknown as { __urls: string[] }).__urls = []
      window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
    })
    await login(page, s)
    await page.goto('/dashboard')
    const rows = page.getByTestId('queue-row')
    await expect(rows.nth(0)).toContainText('رقم واحد')
    await expect(rows.nth(0)).toContainText('1')
    await expect(rows.nth(1)).toContainText('رقم اتنين')

    await page.getByRole('tab', { name: /تذكيرات بكرا/ }).click()
    await page.getByRole('button', { name: 'تذكير', exact: true }).click()
    const url = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls[0])
    expect(decodeURIComponent(url.split('text=')[1])).toContain('رقمك في الدور: 1')
  })
})
