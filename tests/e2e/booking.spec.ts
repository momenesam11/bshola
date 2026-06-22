import { test, expect } from '@playwright/test'
import { seedBusiness, teardownBusiness, type TestFixture } from './helpers/fixtures'
import { supabaseAnon } from './helpers/apiClient'

// capacity: 5 so the three sequential bookings in the "max active bookings"
// test never collide with the slot-capacity check (C4) — this file is
// testing the separate "max 2 active bookings per phone" business rule.
let fixture: TestFixture

test.describe('Public booking page', () => {
  test.beforeAll(async () => {
    fixture = await seedBusiness({ capacity: 5 })
  })

  test.afterAll(async () => {
    await teardownBusiness(fixture)
  })

  test('valid slug → shows the business name', async ({ page }) => {
    await page.goto(`/book/${fixture.bookingSlug}`)
    await expect(page.getByText(/E2E Test Business/)).toBeVisible({ timeout: 15_000 })
  })

  test('invalid slug → shows not-found state', async ({ page }) => {
    await page.goto('/book/this-slug-does-not-exist-e2e')
    await expect(page.getByText('صفحة الحجز غير موجودة')).toBeVisible({ timeout: 15_000 })
  })

  test('complete full booking flow → confirmation receipt shown', async ({ page }) => {
    await page.goto(`/book/${fixture.bookingSlug}`)
    await page.getByText('خدمة تجريبية').click()

    // Pick the first available (non-disabled) date pill, then the first
    // available time slot.
    await page.locator('button:not([disabled])', { hasText: /\d/ }).first().click()
    await page.locator('button:not([disabled])').filter({ hasText: ':' }).first().click()

    await page.locator('input[name="client_name"]').fill('عميل تجريبي')
    await page.locator('input[name="client_phone"]').fill('201111111111')
    await page.getByRole('button', { name: /تأكيد/ }).click()

    await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible({ timeout: 15_000 })
  })

  test('same phone booking a 3rd active appointment → rejected with max-bookings message', async ({ page }) => {
    const phone = '201222222222'

    async function bookOnce() {
      await page.goto(`/book/${fixture.bookingSlug}`)
      await page.getByText('خدمة تجريبية').click()
      await page.locator('button:not([disabled])', { hasText: /\d/ }).first().click()
      // A fresh page load re-renders the slot grid; counts may shift between
      // bookings, so always just take the first still-available slot.
      await page.locator('button:not([disabled])').filter({ hasText: ':' }).first().click()
      await page.locator('input[name="client_name"]').fill('عميل تكرار')
      await page.locator('input[name="client_phone"]').fill(phone)
      await page.getByRole('button', { name: /تأكيد/ }).click()
    }

    await bookOnce()
    await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible({ timeout: 15_000 })

    await bookOnce()
    await expect(page.getByText('تم تأكيد موعدك!')).toBeVisible({ timeout: 15_000 })

    // 3rd attempt: the client-side guard in BookingPage.onSubmitClient
    // blocks before ever calling insert.
    await page.goto(`/book/${fixture.bookingSlug}`)
    await page.getByText('خدمة تجريبية').click()
    await page.locator('button:not([disabled])', { hasText: /\d/ }).first().click()
    await page.locator('button:not([disabled])').filter({ hasText: ':' }).first().click()
    await page.locator('input[name="client_name"]').fill('عميل تكرار')
    await page.locator('input[name="client_phone"]').fill(phone)
    await page.getByRole('button', { name: /تأكيد/ }).click()

    await expect(page.getByText(/أقصى عدد حجوزات مسموح/)).toBeVisible({ timeout: 15_000 })
  })

  test('direct API insert with a past date → rejected by RLS (C5/C2 policy)', async ({}) => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data, error } = await supabaseAnon.from('appointments').insert({
      business_id: fixture.businessId,
      branch_id: fixture.branchId,
      service_id: fixture.serviceId,
      client_name: 'محاولة تاريخ ماضي',
      client_phone: '201233334444',
      appointment_date: yesterday,
      appointment_time: '10:00',
      status: 'confirmed',
    })

    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})
