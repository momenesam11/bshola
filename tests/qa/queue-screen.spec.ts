import { test, expect, seedBusiness, seedAppointment, isoDate, login, sql, one } from './helpers'

// /q/<clinic>: the waiting-room screen (058). Numbers only, live, readable on a
// TV, and on a phone "what's my number?" gives the place in line.

async function queueClinicWithLine() {
  const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
  const names = ['اسم سري أ', 'اسم سري ب', 'اسم سري ج', 'اسم سري د', 'اسم سري ه']
  const rows = []
  for (const name of names) rows.push(await seedAppointment(s, { client_name: name, appointment_date: isoDate(0), appointment_time: '10:00' }))
  // Number 1 is done, 2 is inside, 3, 4, 5 wait.
  await sql(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [rows[0].id])
  await sql(`UPDATE appointments SET called_at = now() WHERE id = $1`, [rows[1].id])
  return { s, rows }
}

test.describe('waiting-room screen', () => {
  test('on a TV: inside, next and after, a code to scan, and never a name', async ({ page, problems }, info) => {
    const { s, rows } = await queueClinicWithLine()
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(`/q/${s.slug}`)
    const screen = page.getByTestId('queue-screen')
    await expect(screen).toContainText(s.name)
    await expect(page.getByTestId('screen-inside')).toHaveText('2')
    await expect(page.getByTestId('screen-next')).toHaveText('3')
    await expect(page.getByTestId('screen-after')).toContainText('4')
    await expect(page.getByTestId('screen-after')).toContainText('5')
    await expect(page.getByTestId('qr-code')).toBeVisible()
    // A real QR image of this page's link, drawn on the device.
    await expect(page.getByTestId('qr-code')).toHaveAttribute('src', /^data:image\/png;base64,/)
    await expect(page.getByTestId('qr-code')).toHaveAttribute('alt', new RegExp(`/q/${s.slug}`))
    await expect(page.getByText('امسح الكود وتابع دورك من موبايلك')).toBeVisible()
    await expect(screen).not.toContainText('اسم سري')
    await expect(page.getByLabel('رقمك كام؟')).toBeHidden()
    await page.screenshot({ path: info.outputPath('screen-tv.png') })

    // It follows the front desk on its own: 3 goes in.
    await sql(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [rows[1].id])
    await sql(`UPDATE appointments SET called_at = now() WHERE id = $1`, [rows[2].id])
    await expect(page.getByTestId('screen-inside')).toHaveText('3', { timeout: 15_000 })
    await expect(page.getByTestId('screen-next')).toHaveText('4')
    expect(problems).toEqual([])
  })

  test('on a phone: type my number and see how many are ahead', async ({ page }, info) => {
    const { s } = await queueClinicWithLine()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/q/${s.slug}`)
    await expect(page.getByTestId('qr-code')).toBeHidden()
    const mine = page.getByLabel('رقمك كام؟')
    await mine.fill('5')
    // Inside (2), then 3 and 4: three ahead.
    await expect(page.getByTestId('my-place')).toContainText('قدامك 3')
    await expect(page.getByTestId('my-place')).toContainText('هتدخل بعد حوالي')
    await page.screenshot({ path: info.outputPath('screen-phone.png'), fullPage: true })
    await mine.fill('2')
    await expect(page.getByTestId('my-place')).toContainText('دورك جوه دلوقتي')
    await mine.fill('1')
    await expect(page.getByTestId('my-place')).toContainText('مش في دور النهارده')
    // The number is remembered on this phone.
    await mine.fill('4')
    await page.reload()
    await expect(page.getByLabel('رقمك كام؟')).toHaveValue('4')
    await expect(page.getByTestId('my-place')).toContainText('قدامك اتنين')
  })

  test('the clinic opens it from the front desk; an unknown clinic shows nothing', async ({ page }) => {
    const { s } = await queueClinicWithLine()
    await login(page, s)
    await page.goto('/clinic')
    await expect(page.getByRole('link', { name: 'شاشة الدور' })).toHaveAttribute('href', `/q/${s.slug}`)
    await page.goto('/q/no-such-clinic-here')
    await expect(page.getByText('الشاشة دي مش شغالة')).toBeVisible()
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE business_id=$1', [s.businessId])).n).toBe(5)
  })

  test('a call shows within seconds, and the number counts up to the new one', async ({ page }) => {
    const { s, rows } = await queueClinicWithLine()
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(`/q/${s.slug}`)
    await expect(page.getByTestId('screen-inside')).toHaveText('2')
    // Record every number the "inside" counter shows.
    await page.evaluate(() => {
      const w = window as unknown as { __seen: string[] }
      w.__seen = []
      const el = document.querySelector('[data-testid="screen-inside"]')!.parentElement!
      new MutationObserver(() => w.__seen.push(el.textContent || '')).observe(el, { subtree: true, childList: true, characterData: true })
    })
    // 2 is done; 5 goes in (3 and 4 sent back): the counter rolls 2 → 5.
    await sql(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [rows[1].id])
    await sql(`UPDATE appointments SET called_at = now() WHERE id = $1`, [rows[4].id])
    await expect(page.getByTestId('screen-inside')).toHaveText('5', { timeout: 6_000 })
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)
    expect(seen.some(t => t === '3' || t === '4')).toBe(true)
  })
})
