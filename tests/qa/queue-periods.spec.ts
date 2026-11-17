import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, sql, phone, expectToast } from './helpers'

// Booking by turn: the periods are the working hours' and nothing else. The
// clinic adds a patient by picking the day and a period (no time), sees the
// number they'll get, can't pick a period that already ended today, and each
// period has a name (by default from when it starts) the clinic can change.

const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']
const blocks = (list: Array<{ start: string; end: string; name?: string }>) => JSON.stringify(Object.fromEntries(DAYS.map(d => [d, list])))

test('the clinic adds a patient by period, with no time, and sees the number they get', async ({ page, problems }) => {
  const s = await seedBusiness({ fields: { booking_mode: 'queue', queue_limit: 20 } })
  // A period that ended at 00:01 today, and one open until 23:59.
  await sql('UPDATE branches SET schedule_blocks = $2::jsonb WHERE id = $1', [s.branchId,
    blocks([{ start: '00:00', end: '00:01' }, { start: '00:01', end: '23:59', name: 'كشف المساء' }])])
  for (const name of ['أول', 'تاني']) await seedAppointment(s, { client_name: `حاجز ${name}`, appointment_date: isoDate(0), appointment_time: '00:01' })
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()

  const picker = page.getByTestId('period-picker')
  await expect(picker).toBeVisible()
  await expect(page.getByLabel('وقت الموعد')).toHaveCount(0)
  await expect(picker.getByRole('radio', { name: /الفترة الصباحية/ })).toBeDisabled()
  await expect(picker.getByRole('radio', { name: /الفترة الصباحية/ })).toContainText('الفترة خلصت')
  const evening = picker.getByRole('radio', { name: /كشف المساء/ })
  await expect(evening).toHaveAttribute('aria-checked', 'true')
  await expect(evening).toContainText('اتحجز 2 من 20')
  await expect(page.getByTestId('next-number')).toHaveText('رقمها في الدور هيبقى 3')

  const tel = phone()
  await page.getByPlaceholder('محمد أحمد').fill('جاية بالتليفون')
  await page.getByRole('textbox', { name: /واتساب/ }).fill(tel)
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expectToast(page, 'تم الحجز بنجاح')
  const row = await one<{ t: string; n: number }>('SELECT appointment_time::text t, queue_number n FROM appointments WHERE client_phone = $1', [tel])
  expect(row).toEqual({ t: '00:01:00', n: 3 })
  expect(problems).toEqual([])
})

test('a day with no period on the hours can\'t take a booking', async ({ page }) => {
  const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
  await sql(`UPDATE branches SET schedule_blocks = $2::jsonb WHERE id = $1`, [s.branchId,
    JSON.stringify(Object.fromEntries(DAYS.map(d => [d, []])))])
  await sql(`UPDATE businesses SET working_hours = '{}'::jsonb WHERE id = $1`, [s.businessId])
  await login(page, s)
  await page.goto('/appointments')
  await page.getByRole('button', { name: '+ موعد جديد' }).click()
  await expect(page.getByTestId('no-periods')).toBeVisible()
  await page.getByPlaceholder('محمد أحمد').fill('مش هينفع')
  await page.getByRole('textbox', { name: /واتساب/ }).fill(phone())
  await page.getByRole('button', { name: 'إضافة الموعد' }).click()
  await expect(page.getByText('اختاري الفترة')).toBeVisible()
  expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE business_id = $1', [s.businessId])).n).toBe(0)
})

test('the clinic names its periods from the hours, and patients see the name', async ({ page }) => {
  const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
  await sql('UPDATE branches SET schedule_blocks = $2::jsonb WHERE id = $1', [s.branchId,
    blocks([{ start: '09:00', end: '13:00' }, { start: '17:00', end: '22:00' }])])
  await login(page, s)
  await page.goto('/settings?tab=hours')
  // With two periods a day, each has a name field showing its default name.
  const name = page.getByLabel('اسم الفترة 2 يوم السبت')
  await expect(name).toHaveAttribute('placeholder', 'الفترة المسائية')
  await name.fill('كشف الأطفال')
  await page.getByRole('button', { name: /حفظ/ }).first().click()
  await expect.poll(async () => (await one<{ n: string | null }>(
    `SELECT schedule_blocks->'sat'->1->>'name' n FROM branches WHERE id = $1`, [s.branchId])).n).toBe('كشف الأطفال')

  // Named for every day: the booking page lists the period by that name.
  await sql('UPDATE branches SET schedule_blocks = $2::jsonb WHERE id = $1', [s.branchId,
    blocks([{ start: '09:00', end: '13:00' }, { start: '17:00', end: '22:00', name: 'كشف الأطفال' }])])
  await page.goto(`/book/${s.slug}`)
  await page.getByRole('button', { name: /كشف عام/ }).click()
  await page.locator('.overflow-x-auto button').nth(1).click()
  await expect(page.getByTestId('queue-period').filter({ hasText: 'كشف الأطفال' })).toBeVisible()
  await expect(page.getByTestId('queue-period').filter({ hasText: 'الفترة الصباحية' })).toBeVisible()
})
