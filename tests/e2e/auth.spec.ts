import { test, expect } from '@playwright/test'
import { createConfirmedUser, deleteUserByEmail } from './helpers/fixtures'

function uniqueEmail() {
  return `e2e-auth-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@beshola-test.local`
}

test.describe('Auth', () => {
  test('register with valid data → proceeds past the form (onboarding or email-confirmation screen)', async ({ page }) => {
    // Whether this lands on /onboarding or the "confirm your email" screen
    // depends on the project's Auth → Confirm Email setting, which this
    // test doesn't control. Either outcome means signUp succeeded; what it
    // must NOT do is show a server error or stay stuck on the form.
    const email = uniqueEmail()
    await page.goto('/register')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill('TestPass123')
    await page.locator('input[name="confirmPassword"]').fill('TestPass123')
    await page.locator('input[name="ownerPhone"]').fill('201012345678')
    await page.getByRole('button', { name: 'إنشاء حساب' }).click()

    await expect(async () => {
      const onOnboarding = page.url().includes('/onboarding')
      const sawConfirmScreen = await page.getByText('تحقق من بريدك').isVisible().catch(() => false)
      expect(onOnboarding || sawConfirmScreen).toBe(true)
    }).toPass({ timeout: 15_000 })

    await deleteUserByEmail(email)
  })

  test('register with duplicate email → shows Arabic "already registered" error', async ({ page }) => {
    const email = uniqueEmail()
    await createConfirmedUser(email, 'ExistingPass123')

    try {
      await page.goto('/register')
      await page.locator('input[name="email"]').fill(email)
      await page.locator('input[name="password"]').fill('TestPass123')
      await page.locator('input[name="confirmPassword"]').fill('TestPass123')
      await page.locator('input[name="ownerPhone"]').fill('201012345678')
      await page.getByRole('button', { name: 'إنشاء حساب' }).click()

      await expect(page.getByText('هذا البريد الإلكتروني مسجل بالفعل')).toBeVisible({ timeout: 15_000 })
    } finally {
      await deleteUserByEmail(email)
    }
  })

  test('weak password → rejected before submission (no signup call happens)', async ({ page }) => {
    await page.goto('/register')
    await page.locator('input[name="email"]').fill(uniqueEmail())
    // 7 chars, no digit — fails both the length and digit zod rules.
    await page.locator('input[name="password"]').fill('abcdefg')
    await page.locator('input[name="confirmPassword"]').fill('abcdefg')
    await page.locator('input[name="ownerPhone"]').fill('201012345678')
    await page.getByRole('button', { name: 'إنشاء حساب' }).click()

    await expect(page.getByText('كلمة المرور يجب أن تكون 8 أحرف على الأقل')).toBeVisible()
    // Client-side validation blocked submission — still on /register.
    await expect(page).toHaveURL(/\/register/)
  })

  test('login with wrong password → shows Arabic error message', async ({ page }) => {
    const email = uniqueEmail()
    await createConfirmedUser(email, 'CorrectPass123')

    try {
      await page.goto('/login')
      await page.locator('input[name="email"]').fill(email)
      await page.locator('input[name="password"]').fill('TotallyWrongPass999')
      await page.getByRole('button', { name: 'تسجيل الدخول' }).click()

      await expect(page.getByText('البريد الإلكتروني أو كلمة المرور غير صحيحة')).toBeVisible({ timeout: 15_000 })
      await expect(page).toHaveURL(/\/login/)
    } finally {
      await deleteUserByEmail(email)
    }
  })
})
