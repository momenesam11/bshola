import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, sql, expectToast, phone } from './helpers'

// /clinic: the front desk (migration 058). Call the next patient, mark who
// arrived, send a late one back, and the patient's page follows it.

const captureWhatsApp = () => {
  (window as unknown as { __urls: string[] }).__urls = []
  window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
}
const lastMessage = async (page: import('@playwright/test').Page) => {
  const urls = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls)
  return decodeURIComponent(urls[urls.length - 1].split('text=')[1])
}

test.describe('front desk', () => {
  test('calls patients in, marks arrivals, sends a late one back, and the patient page follows', async ({ page, problems }) => {
    const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
    await sql(`UPDATE branches SET map_url = 'https://www.google.com/maps/@29.96,31.25,17z' WHERE id = $1`, [s.branchId])
    const names = ['أمل', 'بسمة', 'تامر', 'ثريا', 'جمال']
    const rows = []
    for (const name of names) rows.push(await seedAppointment(s, { client_name: name, appointment_date: isoDate(0), appointment_time: '10:00' }))
    await seedAppointment(s, { client_name: 'بكرا', appointment_date: isoDate(1), appointment_time: '10:00' })
    await page.addInitScript(captureWhatsApp)
    await login(page, s)
    await page.goto('/clinic')

    const desk = page.getByTestId('front-desk')
    await expect(desk.getByTestId('inside')).toContainText('مفيش حد جوه')
    await expect(desk.getByTestId('waiting-row')).toHaveCount(5)
    await expect(desk.getByTestId('call-next')).toContainText('نادي رقم 1')

    // Number 2 arrives.
    await desk.getByTestId('waiting-row').nth(1).getByRole('button', { name: 'وصل' }).click()
    await expect(desk.getByTestId('waiting-row').nth(1)).toContainText('وصل ')
    await expect.poll(async () => (await one<{ t: string | null }>('SELECT arrived_at t FROM appointments WHERE id=$1', [rows[1].id])).t).not.toBeNull()

    // Call 1, then 2: 1 is done with its times stamped, 2 is inside.
    await desk.getByTestId('call-next').click()
    await expect(desk.getByTestId('inside')).toContainText('أمل')
    await expect(desk.getByTestId('call-next')).toContainText('نادي رقم 2')
    await desk.getByTestId('call-next').click()
    await expect(desk.getByTestId('inside')).toContainText('بسمة')
    const first = await one<{ status: string; called_at: string | null; finished_at: string | null }>(
      'SELECT status, called_at, finished_at FROM appointments WHERE id=$1', [rows[0].id])
    expect(first.status).toBe('completed')
    expect(first.called_at).not.toBeNull()
    expect(first.finished_at).not.toBeNull()

    // 3 is late: back three places, behind 4 and 5 (only two after them).
    await desk.getByTestId('waiting-row').first().getByRole('button', { name: /رجّعه/ }).click()
    await expectToast(page, 'تامر رجع 3 أدوار')
    await expect(desk.getByTestId('waiting-row').first()).toContainText('ثريا')
    await expect(desk.getByTestId('waiting-row').nth(2)).toContainText('تامر')
    await expect(desk.getByTestId('waiting-row').nth(2)).toContainText('اتأخر')

    // WhatsApp the place: number, how many ahead, about how long.
    await desk.getByTestId('waiting-row').nth(2).getByTitle('ابعتله دوره').click()
    const text = await lastMessage(page)
    expect(text).toContain('رقمك 3.')
    expect(text).toContain('الوقت المتوقع حوالي')

    // Search by name.
    await desk.getByLabel('ابحث في الدور').fill('جمال')
    await expect(desk.getByTestId('waiting-row')).toHaveCount(1)
    await desk.getByLabel('ابحث في الدور').fill('')

    // The done tab shows 1 with when they went in and out; a mistake can be undone.
    await desk.getByRole('tab', { name: /خلصوا النهارده/ }).click()
    await expect(desk.getByTestId('done-row')).toHaveCount(1)
    await expect(desk.getByTestId('done-row').first()).toContainText('دخل')
    await expect(desk.getByTestId('done-row').first()).toContainText('خرج')

    // Number 3's own page: 2 inside, 3 ahead of them (2, 4, 5), about how long, and directions.
    const code = (await one<{ c: string }>('SELECT manage_code c FROM appointments WHERE id=$1', [rows[2].id])).c
    await page.goto(`/m/${code}`)
    const ahead = page.getByTestId('ahead')
    await expect(ahead).toContainText('قدامك 3 مرضى')
    await expect(page.getByTestId('now-serving')).toHaveText('رقم 2')
    await expect(page.getByTestId('eta')).toContainText('د')
    await expect(page.getByTestId('directions')).toHaveAttribute('href', 'https://www.google.com/maps/@29.96,31.25,17z')
    await expect(page.getByTestId('map')).toHaveAttribute('src', /maps\.google\.com\/maps\?q=29\.96,31\.25/)

    // The inside patient's page says it's their turn.
    const insideCode = (await one<{ c: string }>('SELECT manage_code c FROM appointments WHERE id=$1', [rows[1].id])).c
    await page.goto(`/m/${insideCode}`)
    await expect(page.getByTestId('ahead')).toContainText('دورك جوه دلوقتي')

    // The map iframe can't reach Google here (the internet is blocked), and the
    // test's sign-in script then fails inside that error frame: not the app.
    expect(problems.filter(p => !/localStorage/.test(p.detail))).toEqual([])
  })

  test('a patient who already arrived never gets the come-now WhatsApp, and a mistaken arrival can be undone', async ({ page }) => {
    const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
    const rows = []
    for (const name of ['واحد', 'اتنين', 'تلاتة', 'اربعة', 'خمسة', 'ستة']) rows.push(await seedAppointment(s, { client_name: name, appointment_date: isoDate(0), appointment_time: '10:00' }))
    // Number 4 came early.
    await sql('UPDATE appointments SET arrived_at = now() WHERE id = $1', [rows[3].id])
    await page.addInitScript(captureWhatsApp)
    await login(page, s)
    await page.goto('/clinic')
    const desk = page.getByTestId('front-desk')

    // Calling 1 would tell number 4 (3 ahead), but 4 is here: number 3 is told instead.
    await expect(desk.getByTestId('call-tells')).toContainText('تلاتة')
    await desk.getByTestId('call-next').click()
    await expect(desk.getByTestId('inside')).toContainText('واحد')
    expect(await lastMessage(page)).toContain('أهلاً يا تلاتة')
    // Next call: 4 still skipped; 5 (3 ahead after the call) is told.
    await expect(desk.getByTestId('call-tells')).toContainText('خمسة')
    await desk.getByTestId('call-next').click()
    expect(await lastMessage(page)).toContain('أهلاً يا خمسة')
    const told = await sql<{ n: string }>('SELECT client_name n FROM appointments WHERE business_id = $1 AND queue_notified_at IS NOT NULL ORDER BY 1', [s.businessId])
    expect(told.map(r => r.n).sort()).toEqual(['تلاتة', 'خمسة'].sort())

    // Being called doesn't count as arrived.
    expect((await one<{ a: string | null }>('SELECT arrived_at a FROM appointments WHERE id=$1', [rows[1].id])).a).toBeNull()

    // A mistaken arrival: tapping it again takes it off.
    const four = desk.getByTestId('waiting-row').filter({ hasText: 'اربعة' })
    await four.getByRole('button', { name: /وصل/ }).click()
    await expect(four.getByRole('button', { name: 'وصل', exact: true })).toBeVisible()
    await expect.poll(async () => (await one<{ a: string | null }>('SELECT arrived_at a FROM appointments WHERE id=$1', [rows[3].id])).a).toBeNull()
  })

  test('a walk-in is saved as arrived and takes the next number of the running period', async ({ page }) => {
    const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
    for (const name of ['قديم1', 'قديم2']) await seedAppointment(s, { client_name: name, appointment_date: isoDate(0), appointment_time: '00:00' })
    await login(page, s)
    await page.goto('/clinic')
    await page.getByRole('button', { name: 'مريض جاي من غير حجز' }).click()
    const tel = phone()
    await page.getByPlaceholder('محمد أحمد').fill('جاي دلوقتي')
    await page.getByRole('textbox', { name: /واتساب/ }).fill(tel)
    await page.getByRole('button', { name: 'إضافة الموعد' }).click()
    await expect(page.getByTestId('waiting-row').filter({ hasText: 'جاي دلوقتي' })).toContainText('وصل')
    const row = await one<{ n: number; t: string; a: string | null }>('SELECT queue_number n, appointment_time::text t, arrived_at a FROM appointments WHERE client_phone = $1', [tel])
    expect(row.n).toBe(3)
    expect(row.t).toBe('00:00:00')
    expect(row.a).not.toBeNull()
  })

  test('a time clinic uses the same desk, and a walk-in can be added from it', async ({ page, problems }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { client_name: 'الساعة 9', appointment_date: isoDate(0), appointment_time: '09:00' })
    await seedAppointment(s, { client_name: 'الساعة 11', appointment_date: isoDate(0), appointment_time: '11:00' })
    await login(page, s)
    await page.goto('/clinic')
    const desk = page.getByTestId('front-desk')
    await expect(desk.getByTestId('call-next')).toContainText('نادي الساعة 9')
    await desk.getByRole('button', { name: 'مريض جاي من غير حجز' }).click()
    await expect(page.getByText('موعد جديد').first()).toBeVisible()
    expect(problems).toEqual([])
  })

  test('the branch map link is saved from the branches page', async ({ page }) => {
    const s = await seedBusiness()
    await login(page, s)
    await page.goto('/settings/branches')
    await page.getByRole('button', { name: 'تعديل الفرع' }).click()
    await page.getByLabel('لينك المكان على جوجل ماب').fill('https://maps.app.goo.gl/test123')
    await page.getByRole('button', { name: /حفظ/ }).first().click()
    await expect.poll(async () => (await one<{ m: string | null }>('SELECT map_url m FROM branches WHERE id=$1', [s.branchId])).m).toBe('https://maps.app.goo.gl/test123')
  })
})
