import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, sql, expectToast } from './helpers'

// 066: a night period still open past midnight is its own tab, «امبارح», and
// the waiting-room screen stays on it until the desk starts the new day.

const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

test('the evening before stays open as its own tab until today starts', async ({ page, problems }) => {
  const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
  // One late period a day, so today's hasn't begun by the clock.
  const blocks = [{ start: '23:58', end: '23:59' }]
  await sql('UPDATE branches SET schedule_blocks = $2::jsonb WHERE id = $1', [s.branchId, JSON.stringify(Object.fromEntries(KEYS.map(k => [k, blocks])))])
  const eve = []
  for (const name of ['ليل-واحد', 'ليل-اتنين', 'ليل-تلاتة']) eve.push(await seedAppointment(s, { client_name: name, appointment_date: isoDate(-1), appointment_time: '23:58' }))
  const morning = await seedAppointment(s, { client_name: 'النهارده-واحد', appointment_date: isoDate(0), appointment_time: '23:58' })
  // Last night: 1 inside, 2 here, 3 never came.
  await sql('UPDATE appointments SET arrived_at = now() WHERE id = ANY($1)', [[eve[0].id, eve[1].id]])
  await sql('UPDATE appointments SET called_at = now() WHERE id = $1', [eve[0].id])

  await login(page, s)
  // From the menu, as the secretary does: reading two days once opened a
  // second live channel by the same name, which blanked the page.
  await page.goto('/dashboard')
  await page.getByRole('link', { name: 'العيادة' }).first().click()
  await expect(page).toHaveURL(/\/clinic/)
  const desk = page.getByTestId('front-desk')
  // Opens on last night's tab, marked «امبارح», with its patients.
  await expect(desk.getByTestId('evening-tab')).toContainText('امبارح')
  await expect(desk.getByTestId('evening-tab')).toHaveAttribute('aria-selected', 'true')
  await expect(desk.getByTestId('evening-banner')).toBeVisible()
  await expect(desk.getByTestId('period-control')).toContainText('شغالة من امبارح')
  // Today's tab says so, since both may share a name.
  await expect(desk.getByTestId('period-tabs').getByRole('tab').last()).toContainText('· النهارده')
  await expect(desk.getByTestId('inside')).toContainText('ليل-واحد')
  await expect(desk.getByTestId('call-next')).toContainText('نادي رقم 2')
  // Today's patients are under today's tab.
  await desk.getByTestId('period-tabs').getByRole('tab').last().click()
  await expect(desk.getByTestId('waiting-row')).toHaveCount(1)
  await expect(desk.getByTestId('waiting-row')).toContainText('النهارده-واحد')

  // The screen is still on last night.
  const screen = await page.context().newPage()
  await screen.goto(`/q/${s.slug}`)
  await expect(screen.getByTestId('screen-inside')).toHaveText('1')
  await expect(screen.getByTestId('screen-next')).toHaveText('2')

  // Starting today's period asks first, then closes last night.
  await desk.getByTestId('start-period').click()
  await expect(page.getByText('فترة امبارح هتتقفل معاها.')).toBeVisible()
  await page.getByRole('button', { name: 'ابدأ الفترة' }).last().click()
  await expectToast(page, 'بدأت، وشاشة الدور عليها')
  await expect(desk.getByTestId('evening-tab')).toHaveCount(0)
  await expect.poll(async () => (await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [eve[2].id])).s).toBe('no_show')
  expect((await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [eve[0].id])).s).toBe('completed')
  expect((await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [morning.id])).s).toBe('confirmed')
  // And the screen moves to today.
  await expect(screen.getByTestId('screen-next')).toHaveText('1', { timeout: 15_000 })
  await expect(screen.getByTestId('screen-inside')).toHaveText('—')
  expect(problems).toEqual([])
})
