import { test, expect, seedBusiness, seedAppointment, login, sql, ADMIN_PASSWORD } from './helpers'

// Buttons the crawl found leaving a blank screen or doing something they shouldn't.

test('a patient record opened straight from a link goes back to the clients list', async ({ page }) => {
  const s = await seedBusiness()
  const { client_phone: tel } = await seedAppointment(s)
  await login(page, s)
  await page.goto(`/patients/${tel}`)
  await page.getByRole('button', { name: 'رجوع' }).click()
  await expect(page).toHaveURL(/\/crm$/)
})

test('back from a patient record opened inside the app returns where they were', async ({ page }) => {
  const s = await seedBusiness()
  const { client_phone: tel } = await seedAppointment(s)
  await login(page, s)
  await page.goto('/crm?q=x')
  await page.goto('/crm')
  await page.getByRole('button', { name: 'عرض الملف' }).first().click()
  await page.getByRole('button', { name: /ملف المريض الطبي/ }).first().click()
  await expect(page).toHaveURL(new RegExp(`/patients/${tel}`))
  await page.getByRole('button', { name: 'رجوع' }).click()
  // Browser history, not a fixed page: the drawer's page it came from.
  await expect(page).toHaveURL(/\/crm$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/crm\?q=x$/)
})

test('cancelling Google sign-in comes back to the login page with a reason', async ({ page }) => {
  await page.goto('/auth/callback#error=access_denied&error_description=cancelled')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText(/الدخول بحساب Google ماكملش/)).toBeVisible()
})

test('the sign-in callback says something while it works', async ({ page }) => {
  await login(page, await seedBusiness())
  await page.route('**/auth/v1/user', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue() })
  await page.goto('/auth/callback')
  await expect(page.getByRole('status')).toHaveText(/لحظة/)
})

test('an empty admin password is not sent, so it never counts towards the lock-out', async ({ page }) => {
  await sql('DELETE FROM admin_login_attempts')
  await page.goto('/admin')
  await page.getByRole('button', { name: 'دخول' }).click()
  await expect(page.getByText('اكتب كلمة السر الأول')).toBeVisible()
  expect((await sql<{ n: number }>('SELECT count(*)::int n FROM admin_login_attempts'))[0].n).toBe(0)
})

test('admin log-out shows the password screen right away, without a blank reload', async ({ page }) => {
  await sql('DELETE FROM admin_login_attempts')
  await page.goto('/admin')
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.keyboard.press('Enter')
  await expect(page.getByText('لوحة تحكم بسهولة')).toBeVisible()
  await page.getByRole('button', { name: 'تسجيل خروج' }).click()
  await expect(page.getByText('لوحة تحكم المالك')).toBeVisible({ timeout: 1000 })
  await page.reload()
  await expect(page.getByText('لوحة تحكم المالك')).toBeVisible()
})
