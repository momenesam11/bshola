import { test, expect } from '@playwright/test'
import { loadEnv } from './helpers/env'
import { seedBusiness, teardownBusiness, supabaseAdmin, type TestFixture } from './helpers/fixtures'

loadEnv()

const ADMIN_PASSWORD = process.env.ADMIN_DASHBOARD_PASSWORD
test.skip(!ADMIN_PASSWORD, 'ADMIN_DASHBOARD_PASSWORD is not set in .env.test.local — see .env.test.example')

test.describe('Admin dashboard (/admin)', () => {
  test('wrong password → rejected, dashboard never loads', async ({ page }) => {
    await page.goto('/admin')
    await page.getByPlaceholder('كلمة السر').fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'دخول' }).click()

    await expect(page.getByText('كلمة السر غلط')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('لوحة تحكم بسهولة')).not.toBeVisible()
  })

  test('correct password → dashboard loads', async ({ page }) => {
    await page.goto('/admin')
    await page.getByPlaceholder('كلمة السر').fill(ADMIN_PASSWORD!)
    await page.getByRole('button', { name: 'دخول' }).click()

    await expect(page.getByText('لوحة تحكم بسهولة')).toBeVisible({ timeout: 10_000 })
  })

  test('activating a business sets subscription_type to paid in the database', async ({ page }) => {
    const fixture: TestFixture = await seedBusiness()
    try {
      await page.goto('/admin')
      await page.getByPlaceholder('كلمة السر').fill(ADMIN_PASSWORD!)
      await page.getByRole('button', { name: 'دخول' }).click()
      await expect(page.getByText('لوحة تحكم بسهولة')).toBeVisible({ timeout: 10_000 })

      // Narrow the table to just our fixture via the search box, then open
      // its activate modal (the row icon and the modal's submit button both
      // have the accessible name "تفعيل", so the click is scoped to the
      // modal overlay to avoid hitting the row icon a second time).
      await page.getByPlaceholder('بحث بالاسم أو رقم التليفون...').fill(fixture.businessName)
      const row = page.locator('tr', { hasText: fixture.businessName })
      await expect(row).toBeVisible({ timeout: 10_000 })
      await row.getByTitle('تفعيل').click()

      const modal = page.locator('.fixed.inset-0.z-50', { hasText: fixture.businessName })
      await expect(modal).toBeVisible({ timeout: 10_000 })
      await modal.getByRole('button', { name: 'تفعيل' }).click()

      await expect(async () => {
        const { data, error } = await supabaseAdmin
          .from('businesses')
          .select('subscription_type, is_active')
          .eq('id', fixture.businessId)
          .single()
        expect(error).toBeNull()
        expect(data?.subscription_type).toBe('paid')
        expect(data?.is_active).toBe(true)
      }).toPass({ timeout: 10_000 })
    } finally {
      await teardownBusiness(fixture)
    }
  })
})
