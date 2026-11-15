import { test, expect, seedBusiness, login, one, isoDate } from './helpers'

// How far ahead patients may book online (migration 055).

const dateStrip = (page: import('@playwright/test').Page) => page.locator('.overflow-x-auto button')

test.describe('booking window', () => {
  test('the clinic sets "today and tomorrow" and the booking page offers only those days', async ({ page, browser }) => {
    const s = await seedBusiness()
    await login(page, s)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'ساعات العمل' }).first().click()
    await expect(page.getByText('المرضى يحجزوا لقدام لحد إمتى')).toBeVisible()
    await page.getByText('من غير حد (أول 30 يوم شغل)').click()
    await page.getByText('النهارده وبكرا بس').click()
    await page.getByRole('button', { name: 'حفظ المدة' }).click()
    await expect.poll(async () => (await one<{ n: number }>('SELECT booking_window_days n FROM businesses WHERE id=$1', [s.businessId])).n).toBe(1)

    const visitor = await (await browser.newContext()).newPage()
    await visitor.goto(`/book/${s.slug}`)
    await visitor.getByRole('button', { name: /كشف عام/ }).click()
    await expect(dateStrip(visitor)).toHaveCount(2)
  })

  test('without a window the page still offers 30 days', async ({ page }) => {
    const s = await seedBusiness()
    await page.goto(`/book/${s.slug}`)
    await page.getByRole('button', { name: /كشف عام/ }).click()
    await expect(dateStrip(page)).toHaveCount(30)
  })

  test('a week window shows 8 days (today plus 7)', async ({ page }) => {
    const s = await seedBusiness({ fields: { booking_window_days: 7 } })
    await page.goto(`/book/${s.slug}`)
    await page.getByRole('button', { name: /كشف عام/ }).click()
    await expect(dateStrip(page)).toHaveCount(8)
    await expect(page.getByTestId('no-open-days')).toHaveCount(0)
  })

  test('a window with no open day says so instead of an empty strip', async ({ page }) => {
    // Open only on a weekday that is neither today nor tomorrow in Cairo.
    const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const dayOf = (offset: number) => keys[new Date(isoDate(offset) + 'T12:00:00Z').getUTCDay()]
    const open = keys.find(k => k !== dayOf(0) && k !== dayOf(1))!
    const s = await seedBusiness({ fields: { booking_window_days: 1 } })
    const blocks = Object.fromEntries(keys.map(k => [k, k === open ? [{ start: '09:00', end: '17:00' }] : []]))
    await one('UPDATE branches SET schedule_blocks = $2::jsonb WHERE id = $1 RETURNING id', [s.branchId, JSON.stringify(blocks)])
    await page.goto(`/book/${s.slug}`)
    await page.getByRole('button', { name: /كشف عام/ }).click()
    await expect(page.getByTestId('no-open-days')).toContainText('مفيش أيام متاحة للحجز دلوقتي')
  })
})
