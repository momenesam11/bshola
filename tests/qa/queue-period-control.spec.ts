import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, sql, expectToast } from './helpers'

// 065: the desk starts and ends periods and writes a note for the waiting-room
// screen; a period still being seen keeps the desk and the screen; whoever is
// here is called first, and a patient at home is told why a bigger number is in.

const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

async function twoPeriods() {
  const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
  const blocks = [{ start: '00:00', end: '12:00' }, { start: '12:00', end: '23:59', name: 'فترة الليل' }]
  await sql('UPDATE branches SET schedule_blocks = $2::jsonb WHERE id = $1', [s.branchId, JSON.stringify(Object.fromEntries(KEYS.map(k => [k, blocks])))])
  const first = []
  for (const name of ['ص-واحد', 'ص-اتنين', 'ص-تلاتة']) first.push(await seedAppointment(s, { client_name: name, appointment_date: isoDate(0), appointment_time: '00:00' }))
  const second = await seedAppointment(s, { client_name: 'ل-واحد', appointment_date: isoDate(0), appointment_time: '12:00' })
  // The first period is being seen: 2 inside, 3 here, 1 never came.
  await sql('UPDATE appointments SET arrived_at = now() WHERE id = ANY($1)', [[first[1].id, first[2].id]])
  await sql('UPDATE appointments SET called_at = now() WHERE id = $1', [first[1].id])
  return { s, first, second }
}

test.describe('queue periods run by the desk', () => {
  test('the desk ends a period, writes a note, and the screen shows it', async ({ page, problems }) => {
    const { s, first } = await twoPeriods()
    await login(page, s)
    await page.goto('/clinic')
    const desk = page.getByTestId('front-desk')

    // Whatever the clock says, the period being seen is the one shown; 3 is here, so 3 is next.
    await expect(desk.getByTestId('period-control')).toContainText('الفترة الصباحية')
    await expect(desk.getByTestId('inside')).toContainText('ص-اتنين')
    await expect(desk.getByTestId('call-next')).toContainText('نادي رقم 3')

    // A note for the screen.
    await desk.getByLabel('رسالة على شاشة الدور').fill('فترة الليل هتبدأ بعد ما يخلص 2')
    await desk.getByRole('button', { name: 'اعرضها' }).click()
    await expectToast(page, 'الرسالة ظاهرة على شاشة الدور')

    // Ending the period: 1 never came and is marked ما جاش; 3 is here and stays.
    await desk.getByTestId('end-period').click()
    await expect(page.getByText('1 ما وصلوش هيتسجلوا «ما جاش»')).toBeVisible()
    await page.getByRole('button', { name: 'خلّص الفترة' }).last().click()
    await expectToast(page, 'الفترة الصباحية خلصت')
    await expect.poll(async () => (await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [first[0].id])).s).toBe('no_show')
    expect((await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [first[2].id])).s).toBe('confirmed')

    // The night period can be started from its tab.
    await desk.getByTestId('period-tabs').getByRole('tab', { name: /فترة الليل/ }).click()
    await expect(desk.getByTestId('period-control')).toContainText('لسه ما بدأتش')
    await desk.getByTestId('start-period').click()
    await expectToast(page, 'فترة الليل بدأت، وشاشة الدور عليها')
    await expect(desk.getByTestId('period-control')).toContainText('شغالة')

    // The screen: the started period, the note, and 3 (still here from the morning) next.
    await page.goto(`/q/${s.slug}`)
    await expect(page.getByTestId('screen-note')).toHaveText('فترة الليل هتبدأ بعد ما يخلص 2')
    await expect(page.getByTestId('screen-period')).toContainText('فترة الليل')
    await expect(page.getByTestId('screen-next')).toHaveText('3')
    await expect(page.getByTestId('queue-screen')).not.toContainText('ص-')
    expect(problems).toEqual([])
  })

  test('a patient at home is told why a bigger number is inside', async ({ page }) => {
    const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
    const rows = []
    for (const name of ['أ', 'ب', 'ج', 'د', 'ه', 'و']) rows.push(await seedAppointment(s, { client_name: name, appointment_date: isoDate(0), appointment_time: '10:00' }))
    // 1-3 haven't come; 4 and 6 are here and 6 is inside.
    await sql('UPDATE appointments SET arrived_at = now() WHERE id = ANY($1)', [[rows[3].id, rows[5].id]])
    await sql('UPDATE appointments SET called_at = now() WHERE id = $1', [rows[5].id])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/q/${s.slug}`)
    await expect(page.getByTestId('screen-inside')).toHaveText('6')
    // Whoever is here is next, not number 1.
    await expect(page.getByTestId('screen-next')).toHaveText('4')
    await page.getByLabel('رقمك كام؟').fill('5')
    const place = page.getByTestId('my-place')
    // 6 inside, 4 here, and 1-3 still expected.
    await expect(place).toContainText('قدامك 5 مرضى')
    await expect(page.getByTestId('my-coming')).toHaveText('رقم 6 جوه دلوقتي، بس لسه فيه 3 مرضى قبلك جايين.')
    await expect(place).toContainText('هنبعتلك رسالة تتحرك لما دورك يقرب.')

    // The same on their own page.
    const code = (await one<{ c: string }>('SELECT manage_code c FROM appointments WHERE id=$1', [rows[4].id])).c
    await page.goto(`/m/${code}`)
    await expect(page.getByTestId('coming')).toContainText('لسه فيه 3 مرضى قبلك جايين')
  })
})
