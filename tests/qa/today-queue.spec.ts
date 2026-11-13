import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, expectToast } from './helpers'

// "How many are ahead of you": the dashboard's today queue (migration 053).

const captureWhatsApp = () => {
  (window as unknown as { __urls: string[] }).__urls = []
  window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
}
const lastMessage = async (page: import('@playwright/test').Page) => {
  const urls = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls)
  const url = urls[urls.length - 1]
  return { url, text: decodeURIComponent(url.split('text=')[1]) }
}

test.describe('today queue', () => {
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
    await page.goto('/dashboard')

    const queue = page.getByTestId('today-queue')
    const order = names.map((n, i) => ({ n, h: 9 + ((i * 3) % 5) })).sort((x, y) => x.h - y.h).map(x => x.n)
    await expect(queue.getByTestId('queue-row')).toHaveCount(5)
    for (const [i, n] of order.entries()) await expect(queue.getByTestId('queue-row').nth(i)).toContainText(n)

    // With the default of 3, the fourth in line is due.
    const due = queue.getByTestId('queue-due')
    await expect(due).toContainText(`${order[3]} بقى قدامه 3`)
    await due.getByRole('button', { name: 'ابعتله' }).click()
    const sent = await lastMessage(page)
    expect(sent.text).toContain('باقي قدامك 3 مرضى')
    const fourth = appts[names.indexOf(order[3])]
    expect(sent.url).toContain(`wa.me/${fourth.client_phone}`)
    await expect(due).toHaveCount(0)
    await expect.poll(async () => (await one<{ t: string | null }>('SELECT queue_notified_at t FROM appointments WHERE id=$1', [fourth.id])).t).not.toBeNull()

    // The first one is done: they leave the queue and the fifth is now due.
    await queue.getByTestId('queue-row').first().getByRole('button', { name: 'خلص' }).click()
    await expectToast(page, `${order[0]} خلص`)
    await expect(queue.getByTestId('queue-row')).toHaveCount(4)
    await expect(queue.getByTestId('queue-due')).toContainText(`${order[4]} بقى قدامه 3`)
    const first = appts[names.indexOf(order[0])]
    expect((await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [first.id])).s).toBe('completed')

    // Any patient can be told their place; the one in front hears it's their turn.
    await queue.getByTestId('queue-row').first().getByTitle('ابعتله دوره').click()
    expect((await lastMessage(page)).text).toContain('دورك دلوقتي')

    await queue.getByTestId('queue-row').first().getByRole('button', { name: 'ما جاش' }).click()
    await expect(queue.getByTestId('queue-row')).toHaveCount(3)
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

    await page.goto('/dashboard')
    await expect(page.getByTestId('queue-due')).toContainText('مريض ج بقى قدامه 2')
  })

  test('no queue panel on a day without waiting patients', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { appointment_date: isoDate(1) })
    await login(page, s)
    await page.goto('/dashboard')
    await expect(page.getByText('تذكيرات بكرا')).toBeVisible()
    await expect(page.getByTestId('today-queue')).toHaveCount(0)
  })
})
