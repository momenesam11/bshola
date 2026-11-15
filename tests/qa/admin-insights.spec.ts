import { test, expect, seedBusiness, seedAppointment, isoDate, sql, API, ADMIN_PASSWORD } from './helpers'
import type { Page } from '@playwright/test'

// /admin: numbers for every clinic together and each clinic's feature use
// (migration 059). Counts only.

const adminIn = async (page: Page) => {
  await page.goto('/admin')
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.keyboard.press('Enter')
  await expect(page.getByText('لوحة تحكم بسهولة')).toBeVisible()
}

test.describe('admin insights', () => {
  test('shows platform numbers with weekly charts, and each clinic\'s feature use and missing setup', async ({ page, problems }, info) => {
    const s = await seedBusiness({ fields: { booking_mode: 'queue' } })
    const a = await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '10:00' })
    await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '10:00' })
    await sql('UPDATE appointments SET called_at = now(), arrived_at = now(), queue_notified_at = now() WHERE id = $1', [a.id])
    await sql(`UPDATE branches SET map_url = 'https://maps.app.goo.gl/x' WHERE id = $1`, [s.branchId])

    await page.setViewportSize({ width: 1440, height: 900 })
    await adminIn(page)
    const top = page.getByTestId('platform-insights')
    await expect(top).toBeVisible()
    await expect(top).toContainText('حجوزات النهارده')
    await expect(page.getByTestId('weekly-bookings').getByRole('button')).toHaveCount(12)
    await expect(page.getByTestId('weekly-signups').getByRole('button')).toHaveCount(12)

    // Hover a week: its number shows.
    await page.getByTestId('weekly-bookings').getByRole('button').last().hover()
    await expect(page.getByTestId('weekly-bookings').getByRole('status')).toContainText('أسبوع')
    await page.getByRole('button', { name: 'اعرض الأرقام كجدول' }).click()
    await expect(page.getByTestId('weekly-table').locator('tbody tr')).toHaveCount(12)
    await page.screenshot({ path: info.outputPath('admin-insights.png') })

    // This clinic's row: by turn, one call, one arrival, one heads-up; no logo yet.
    await page.getByPlaceholder(/بحث بالاسم/).fill(s.name)
    const cell = page.getByTestId('feature-cell').first()
    await expect(cell).toContainText('بالدور')
    await expect(cell).toContainText('نداء 1 · وصل 1 · اتحرك 1')
    await expect(cell.getByTestId('setup-status')).toHaveText('ناقص: لوجو')
    expect(problems).toEqual([])
  })

  test('the numbers are behind the admin password', async () => {
    const res = await fetch(`${API}/functions/v1/admin`, { method: 'POST', body: JSON.stringify({ action: 'insights', token: 'fake' }) })
    expect(res.status).toBe(401)
  })
})
