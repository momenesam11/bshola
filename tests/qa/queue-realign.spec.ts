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
  // Since 062 a new booking here takes 4; Rahma is as she was booked before it, a second 1.
  await sql('ALTER TABLE appointments DISABLE TRIGGER assign_queue_number')
  const late = await seedAppointment(s, { client_name: 'رحمة', appointment_date: isoDate(1), appointment_time: '18:00', queue_number: 1 })
  await sql('ALTER TABLE appointments ENABLE TRIGGER assign_queue_number')
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

test('a clinic that switched from booking by time: one tap gives the whole period one numbering', async ({ page }) => {
  const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
  // Today: two done, one inside, two waiting, one no-show, each numbered 1 on its own time.
  const today = [
    ['خلص أ', '09:00', 'completed', 300], ['خلص ب', '09:30', 'completed', 250], ['جوه دلوقتي', '10:00', 'confirmed', 200],
    ['مستني أ', '10:30', 'confirmed', 150], ['مستني ب', '11:00', 'confirmed', 100], ['غايب', '11:30', 'no_show', 50],
  ] as const
  await sql('ALTER TABLE appointments DISABLE TRIGGER assign_queue_number')
  for (const [name, time, status, ago] of today) {
    await seedAppointment(s, { client_name: name, appointment_date: isoDate(0), appointment_time: time, status, queue_number: 1,
      created_at: new Date(Date.now() - ago * 60000).toISOString() })
  }
  await sql('ALTER TABLE appointments ENABLE TRIGGER assign_queue_number')
  await sql(`UPDATE appointments SET called_at = now() - interval '5 minutes' WHERE business_id = $1 AND client_name = 'جوه دلوقتي'`, [s.businessId])

  await login(page, s)
  await page.goto('/dashboard')
  await page.getByTestId('realign-banner').getByRole('button', { name: 'انقلهم لفتراتهم' }).click()
  await expect(page.getByTestId('realign-row').filter({ hasText: 'خلص أ' })).toContainText('خلص')
  await page.getByTestId('realign-plan').getByRole('button', { name: 'انقلهم', exact: true }).click()
  // Only the waiting patients whose number changed get a message.
  const changed = page.getByTestId('realign-done').getByTestId('realign-changed')
  await expect(changed).toHaveCount(2)
  await expect(changed.filter({ hasText: 'مستني أ' })).toContainText('1 ← 4')
  await page.getByTestId('realign-done').getByRole('button', { name: 'تمام' }).click()

  // The period now numbers 1 to 6, each once.
  const numbers = (await sql<{ n: number }>('SELECT queue_number n FROM appointments WHERE business_id = $1 ORDER BY 1', [s.businessId])).map(r => r.n)
  expect(numbers).toEqual([1, 2, 3, 4, 5, 6])
  const rows = page.getByTestId('board-period').first().getByTestId('board-row')
  await expect(rows).toHaveCount(6)
  for (const [i, n] of ['1', '2', '3', '4', '5', '6'].entries()) await expect(rows.nth(i)).toContainText(n)
})
