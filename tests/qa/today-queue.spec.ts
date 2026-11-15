import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, expectToast } from './helpers'

// "How many are ahead of you" (migration 053), now on the front desk page
// /clinic (058). The dashboard keeps only tomorrow's reminders.

const captureWhatsApp = () => {
  (window as unknown as { __urls: string[] }).__urls = []
  window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
}
const lastMessage = async (page: import('@playwright/test').Page) => {
  const urls = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls)
  const url = urls[urls.length - 1]
  return { url, text: decodeURIComponent(url.split('text=')[1]) }
}

test.describe('today queue on the front desk', () => {
  test('orders by booking time, flags who to tell, and moves on when one is done', async ({ page }) => {
    const s = await seedBusiness()
    const names = ['الأول', 'التاني', 'التالت', 'الرابع', 'الخامس']
    const appts = []
    for (const [i, name] of names.entries()) {
      // Seeded out of order on purpose: the queue goes by booking time.
      appts.push(await seedAppointment(s, { client_name: name, appointment_date: isoDate(0), appointment_time: `${String(9 + ((i * 3) % 5)).padStart(2, '0')}:00` }))
    }
    await seedAppointment(s, { client_name: 'بكرا', appointment_date: isoDate(1) })
    await seedAppointment(s, { client_name: 'خلص بدري', appointment_date: isoDate(0), appointment_time: '08:00', status: 'completed' })
    await page.addInitScript(captureWhatsApp)
    await login(page, s)
    await page.goto('/clinic')

    const desk = page.getByTestId('front-desk')
    const order = names.map((n, i) => ({ n, h: 9 + ((i * 3) % 5) })).sort((x, y) => x.h - y.h).map(x => x.n)
    await expect(desk.getByTestId('waiting-row')).toHaveCount(5)
    for (const [i, n] of order.entries()) await expect(desk.getByTestId('waiting-row').nth(i)).toContainText(n)

    // With the default of 3, calling the first also tells the fourth to come.
    const fourth = appts[names.indexOf(order[3])]
    await expect(desk.getByTestId('call-tells')).toContainText(order[3])
    await desk.getByTestId('call-next').click()
    await expect(desk.getByTestId('inside')).toContainText(order[0])
    const sent = await lastMessage(page)
    expect(sent.text).toContain('باقي قدامك 3 مرضى')
    expect(sent.text).toContain('الوقت المتوقع حوالي')
    expect(sent.url).toContain(`wa.me/${fourth.client_phone}`)
    await expect.poll(async () => (await one<{ t: string | null }>('SELECT queue_notified_at t FROM appointments WHERE id=$1', [fourth.id])).t).not.toBeNull()

    // The next call finishes the first and tells the fifth, who now has 3 ahead.
    const fifth = appts[names.indexOf(order[4])]
    await expect(desk.getByTestId('call-tells')).toContainText(order[4])
    await desk.getByTestId('call-next').click()
    await expect(desk.getByTestId('inside')).toContainText(order[1])
    expect((await lastMessage(page)).url).toContain(`wa.me/${fifth.client_phone}`)
    await expect(desk.getByTestId('waiting-row')).toHaveCount(3)
    const first = appts[names.indexOf(order[0])]
    expect((await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [first.id])).s).toBe('completed')
    // Everyone within 3 was told, so the button has nobody more to tell.
    await expect(desk.getByTestId('call-tells')).toHaveCount(0)
    await desk.getByTestId('inside').getByRole('button', { name: 'خلص' }).click()
    await expectToast(page, `${order[1]} خلص`)
    await expect(desk.getByTestId('waiting-row')).toHaveCount(3)

    // Any patient can be told their place; the one in front hears it's their turn.
    await desk.getByTestId('waiting-row').first().getByTitle('ابعتله دوره').click()
    expect((await lastMessage(page)).text).toContain('دورك دلوقتي')

    await desk.getByTestId('waiting-row').first().getByRole('button', { name: 'ما جاش' }).click()
    await expect(desk.getByTestId('waiting-row')).toHaveCount(2)

    // A name opens that appointment, like the calendar does.
    await desk.getByTestId('waiting-row').first().getByRole('button', { name: order[3] }).click()
    await expect(page.getByText('تعديل الموعد')).toBeVisible()
  })

  test('the clinic chooses how many ahead triggers the message', async ({ page }) => {
    const s = await seedBusiness()
    for (const [i, name] of ['أ', 'ب', 'ج'].entries()) {
      await seedAppointment(s, { client_name: `مريض ${name}`, appointment_date: isoDate(0), appointment_time: `1${i}:00` })
    }
    await login(page, s)
    await page.goto('/settings?tab=reminders')
    await page.getByLabel('ابعت للمريض لما يبقى قدامه').fill('20')
    await page.getByRole('button', { name: 'حفظ العدد' }).click()
    await expect(page.getByText('اكتب رقم من 1 لـ 10')).toBeVisible()
    await page.getByLabel('ابعت للمريض لما يبقى قدامه').fill('2')
    await page.getByRole('button', { name: 'حفظ العدد' }).click()
    await expect.poll(async () => (await one<{ n: number }>('SELECT queue_notify_ahead n FROM businesses WHERE id=$1', [s.businessId])).n).toBe(2)

    await page.goto('/clinic')
    await expect(page.getByTestId('call-tells')).toContainText('مريض ج')
  })
})

test.describe('dashboard', () => {
  test('keeps only the tomorrow reminders card above the calendar, as before', async ({ page }) => {
    const s = await seedBusiness()
    for (const i of [0, 1, 2]) await seedAppointment(s, { client_name: `دور ${i}`, appointment_date: isoDate(0), appointment_time: `2${i}:00` })
    await seedAppointment(s, { client_name: 'مريض بكرا', appointment_date: isoDate(1) })
    await login(page, s)
    await page.goto('/dashboard')

    const card = page.getByTestId('tomorrow-reminders')
    await expect(card).toContainText('تذكيرات بكرا')
    await expect(card).toContainText('مريض بكرا')
    await expect(page.getByTestId('today-queue')).toHaveCount(0)
    await expect(page.getByTestId('today-tasks')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: /الدور/ })).toHaveCount(0)

    // The header folds the list away.
    await card.getByText('تذكيرات بكرا').click()
    await expect(card).not.toContainText('مريض بكرا')
  })
})
