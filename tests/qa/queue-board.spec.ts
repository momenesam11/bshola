import { test, expect, seedBusiness, seedAppointment, isoDate, login, sql, one } from './helpers'

// The dashboard of a clinic that books by turn: periods and numbers instead of
// a calendar of times. Clinics that book by time keep the calendar.

const TWO_PERIODS = Object.fromEntries(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']
  .map(d => [d, [{ start: '00:00', end: '11:00' }, { start: '12:00', end: '23:30' }]]))

test.describe('queue clinic dashboard', () => {
  test('shows each period with its numbers, statuses, count of the limit, and the waitlist', async ({ page, problems }) => {
    const s = await seedBusiness({ fields: { booking_mode: 'queue', queue_limit: 3 } })
    await sql(`UPDATE branches SET schedule_blocks = $2::jsonb WHERE id = $1`, [s.branchId, JSON.stringify(TWO_PERIODS)])
    const names = ['أحمد', 'بسنت', 'جودي']
    const rows = []
    for (const name of names) rows.push(await seedAppointment(s, { client_name: name, appointment_date: isoDate(1), appointment_time: '12:00' }))
    await seedAppointment(s, { client_name: 'صباحي', appointment_date: isoDate(1), appointment_time: '00:00' })
    await seedAppointment(s, { client_name: 'مستني', appointment_date: isoDate(1), appointment_time: '00:00', status: 'waitlist' })
    await seedAppointment(s, { client_name: 'لغى', appointment_date: isoDate(1), appointment_time: '12:00', status: 'cancelled' })
    await sql(`UPDATE appointments SET arrived_at = now() WHERE id = $1`, [rows[1].id])
    await login(page, s)
    await page.goto('/dashboard')

    const board = page.getByTestId('queue-board')
    await expect(board).toBeVisible()
    await expect(page.getByTestId('tomorrow-reminders')).toBeVisible()

    // Tomorrow: 4 booked; the evening period is full (3 of 3).
    const tomorrow = board.getByTestId('board-day').nth(1)
    await expect(tomorrow).toContainText('بكرا')
    await expect(tomorrow).toContainText('4 حجز')
    await tomorrow.click()

    const periods = board.getByTestId('board-period')
    await expect(periods).toHaveCount(2)
    await expect(periods.nth(0)).toContainText('الفترة الصباحية')
    await expect(periods.nth(0).getByTestId('period-count')).toHaveText('1 من 3')
    await expect(periods.nth(1).getByTestId('period-count')).toHaveText('3 من 3')
    await expect(periods.nth(1)).toContainText('اتملت أونلاين')
    const evening = periods.nth(1).getByTestId('board-row')
    await expect(evening).toHaveCount(3)
    for (const [i, name] of names.entries()) {
      await expect(evening.nth(i)).toContainText(name)
      await expect(evening.nth(i)).toContainText(String(i + 1))
    }
    await expect(evening.nth(1)).toContainText('وصل')
    await expect(evening.nth(0)).toContainText('حاجز')
    await expect(board.getByTestId('board-waitlist')).toContainText('مستني')
    await expect(board).toContainText('حجز واحد اتلغى')

    // A name opens the booking; the period's button adds a number to it.
    await evening.nth(0).click()
    await expect(page.getByText('تعديل الموعد')).toBeVisible()
    await page.getByRole('button', { name: 'اقفل' }).click()
    await periods.nth(0).getByRole('button', { name: /رقم جديد/ }).click()
    await expect(page.getByText('موعد جديد').first()).toBeVisible()
    await page.getByRole('button', { name: 'اقفل' }).click()

    // The calendar is one tap away, and the choice is remembered.
    await page.getByRole('tab', { name: 'الكاليندر' }).click()
    await expect(board).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('tab', { name: 'الكاليندر' })).toHaveAttribute('aria-selected', 'true')
    expect(problems).toEqual([])
  })

  test('today links to the front desk', async ({ page }) => {
    const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
    await seedAppointment(s, { client_name: 'النهارده', appointment_date: isoDate(0), appointment_time: '10:00' })
    await login(page, s)
    await page.goto('/dashboard')
    await page.getByRole('link', { name: /افتح شاشة الاستقبال/ }).click()
    await expect(page).toHaveURL(/\/clinic$/)
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE business_id=$1', [s.businessId])).n).toBe(1)
  })

  test('a clinic that books by time keeps the calendar, with no turns view', async ({ page }) => {
    const s = await seedBusiness()
    await login(page, s)
    await page.goto('/dashboard')
    await expect(page.getByTestId('tomorrow-reminders')).toBeVisible()
    await expect(page.getByTestId('queue-board')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'الأدوار' })).toHaveCount(0)
  })
})
