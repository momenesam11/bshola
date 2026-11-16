import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, sql } from './helpers'

// 061: the clinic changed its hours after people booked by turn. The front desk
// and the dashboard offer to move them into their period, show who changes,
// and then a WhatsApp for each patient whose number changed.

const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']
const hours = (evening: string) => JSON.stringify(Object.fromEntries(DAYS.map(d =>
  [d, { active: true, periods: [{ open: '12:00', close: '16:00' }, { open: evening, close: '23:00' }] }])))

const captureWhatsApp = () => {
  (window as unknown as { __urls: string[] }).__urls = []
  window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
}

test('hours moved from 6:55 to 6:00: move the bookings, earlier bookers keep their numbers, tell the one that changed', async ({ page, problems }) => {
  const s = await seedBusiness({ fields: { booking_mode: 'queue', working_hours: hours('18:55') } })
  // On the clinic's general hours, like the clinic that reported it.
  await sql(`UPDATE branches SET schedule_blocks = '{}'::jsonb WHERE id = $1`, [s.branchId])
  const early = []
  for (const [i, name] of ['نور', 'رانيا', 'أميرة'].entries()) {
    early.push(await seedAppointment(s, { client_name: name, appointment_date: isoDate(1), appointment_time: '18:55', created_at: new Date(Date.now() - (600 - i) * 60000).toISOString() }))
  }
  await sql('UPDATE businesses SET working_hours = $2::jsonb WHERE id = $1', [s.businessId, hours('18:00')])
  const late = await seedAppointment(s, { client_name: 'رحمة', appointment_date: isoDate(1), appointment_time: '18:00' })
  expect((await one<{ n: number }>('SELECT queue_number n FROM appointments WHERE id=$1', [late.id])).n).toBe(1)

  await page.addInitScript(captureWhatsApp)
  await login(page, s)
  await page.goto('/clinic')
  const banner = page.getByTestId('realign-banner')
  await expect(banner).toContainText('3 حجوزات')
  await banner.getByRole('button', { name: 'انقلهم لفتراتهم' }).click()

  // The plan: the three move with their numbers, Rahma goes from 1 to 4.
  const plan = page.getByTestId('realign-plan')
  await expect(plan.getByTestId('realign-row')).toHaveCount(4)
  await expect(plan.getByTestId('realign-row').filter({ hasText: 'نور' })).toContainText('رقم 1')
  await expect(plan.getByTestId('realign-row').filter({ hasText: 'رحمة' })).toContainText('رقم 1 ← 4')
  await plan.getByRole('button', { name: 'انقلهم', exact: true }).click()

  // Only Rahma's number changed: one WhatsApp to send.
  const doneList = page.getByTestId('realign-done')
  await expect(doneList.getByTestId('realign-changed')).toHaveCount(1)
  await doneList.getByRole('button', { name: /ابعت لـرحمة/ }).click()
  const urls = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls)
  expect(urls.at(-1)).toContain(`wa.me/${late.client_phone}`)
  expect(decodeURIComponent(urls.at(-1)!.split('text=')[1])).toContain('رقمك في الدور بقى 4')
  await expect(doneList.getByRole('button', { name: /ابعت لـرحمة/ })).toContainText('اتبعت')

  const rows = await sql<{ t: string; n: number }>(
    `SELECT to_char(appointment_time, 'HH24:MI') t, queue_number n FROM appointments WHERE business_id = $1 ORDER BY queue_number`, [s.businessId])
  expect(rows).toEqual([{ t: '18:00', n: 1 }, { t: '18:00', n: 2 }, { t: '18:00', n: 3 }, { t: '18:00', n: 4 }])
  expect((await one<{ n: number }>('SELECT queue_number n FROM appointments WHERE id=$1', [early[0].id])).n).toBe(1)

  // Nothing left to move: the banner is gone, on the dashboard too.
  await doneList.getByRole('button', { name: 'تمام' }).click()
  await expect(page.getByTestId('realign-banner')).toHaveCount(0)
  await page.goto('/dashboard')
  await expect(page.getByTestId('queue-board')).toBeVisible()
  await expect(page.getByTestId('realign-banner')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('a clinic with nothing out of place sees no banner', async ({ page }) => {
  const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
  await seedAppointment(s, { appointment_date: isoDate(1), appointment_time: '00:00' })
  await login(page, s)
  await page.goto('/clinic')
  await expect(page.getByTestId('front-desk')).toBeVisible()
  await expect(page.getByTestId('realign-banner')).toHaveCount(0)
})
