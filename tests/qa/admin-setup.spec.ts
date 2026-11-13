import { test, expect, seedBusiness, one, sql, API, ADMIN_PASSWORD, expectToast } from './helpers'
import type { Page } from '@playwright/test'

// /admin/setup/:id: the owner fills in a clinic's settings for it.

const adminIn = async (page: Page) => {
  await page.goto('/admin')
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.keyboard.press('Enter')
  await expect(page.getByText('لوحة تحكم بسهولة')).toBeVisible()
}
const call = (payload: Record<string, unknown>) =>
  fetch(`${API}/functions/v1/admin`, { method: 'POST', body: JSON.stringify(payload) })
const tokenOf = (page: Page) => page.evaluate(() => sessionStorage.getItem('beshola_admin_token'))

test.describe('admin clinic setup', () => {
  test('opens from the table and saves the profile, services, hours and logo', async ({ page }) => {
    const s = await seedBusiness()
    await adminIn(page)
    await page.getByPlaceholder('بحث بالاسم أو رقم التليفون...').fill(s.name)
    await page.locator('tr', { hasText: s.name }).getByTitle('تجهيز الحساب').click()
    await expect(page.getByRole('heading', { name: `تجهيز حساب ${s.name}` })).toBeVisible()

    await page.getByLabel('التخصص').fill('باطنة')
    await page.getByLabel('سنين الخبرة').fill('12')
    await page.getByLabel('نبذة (200 حرف)').fill('استشاري باطنة')
    await page.getByRole('button', { name: 'حفظ البيانات' }).click()
    await expectToast(page, 'اتحفظ بيانات العيادة')
    const b = await one<{ specialty: string; years_experience: number; bio: string }>('SELECT specialty, years_experience, bio FROM businesses WHERE id=$1', [s.businessId])
    expect(b).toEqual({ specialty: 'باطنة', years_experience: 12, bio: 'استشاري باطنة' })

    await page.getByLabel('سعر الخدمة 1').fill('350')
    await page.getByRole('button', { name: 'إضافة خدمة' }).click()
    await page.getByLabel('اسم الخدمة 2').fill('متابعة')
    await page.getByLabel('مدة الخدمة 2').fill('15')
    await page.getByLabel('سعر الخدمة 2').fill('150')
    await page.getByRole('button', { name: 'حفظ الخدمات' }).click()
    await expectToast(page, 'اتحفظ الخدمات')
    const services = await sql<{ name: string; duration_minutes: number; price: string }>('SELECT name, duration_minutes, price FROM services WHERE business_id=$1 ORDER BY name', [s.businessId])
    expect(services.map(x => [x.name, x.duration_minutes, Number(x.price)])).toEqual([[s.serviceName, 30, 350], ['متابعة', 15, 150]])

    // Saving again after the add must not create the new service twice. The
    // toast from the save before may still be up, so the request is awaited.
    const serviceCount = async () => (await one<{ n: number }>('SELECT count(*)::int n FROM services WHERE business_id=$1', [s.businessId])).n
    const saveServices = () => Promise.all([
      page.waitForResponse(r => r.url().includes('/functions/v1/admin') && r.request().postData()?.includes('setup_services')),
      page.getByRole('button', { name: 'حفظ الخدمات' }).click(),
    ])
    await saveServices()
    expect(await serviceCount()).toBe(2)

    await page.getByTestId('setup-service').filter({ has: page.locator('input[value="متابعة"]') }).getByTitle('حذف الخدمة').click()
    await saveServices()
    await expect.poll(serviceCount).toBe(1)

    await page.getByLabel('العنوان', { exact: true }).fill('شارع التحرير، الدقي')
    await page.getByRole('button', { name: 'حفظ المواعيد' }).click()
    await expectToast(page, 'اتحفظ مواعيد الشغل')
    expect((await one<{ a: string }>('SELECT address a FROM branches WHERE id=$1', [s.branchId])).a).toBe('شارع التحرير، الدقي')

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    await page.getByLabel('اللوجو أو الصورة الشخصية').last().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
    await expectToast(page, 'اتحفظ اللوجو أو الصورة الشخصية')
    const logo = (await one<{ u: string }>('SELECT logo_url u FROM businesses WHERE id=$1', [s.businessId])).u
    expect(logo).toContain(`/business-assets/${s.businessId}/logo.png?v=`)
  })

  test('the server checks what it saves and touches only that clinic', async ({ page }) => {
    const s = await seedBusiness()
    const other = await seedBusiness()
    expect((await call({ action: 'setup_get', id: s.businessId, token: 'fake' })).status).toBe(401)
    await adminIn(page)
    const token = await tokenOf(page)

    // Settings only: nothing about appointments or patients comes back.
    const got = await (await call({ action: 'setup_get', id: s.businessId, token })).json()
    expect(Object.keys(got).sort()).toEqual(['branches', 'business', 'services', 'success'])
    expect(got.business).not.toHaveProperty('owner_phone')

    const bad = [
      { action: 'setup_business', id: s.businessId, fields: { name: 'ع' } },
      { action: 'setup_business', id: s.businessId, fields: { name: 'عيادة', booking_slug: 'مش انجليزي' } },
      { action: 'setup_services', id: s.businessId, services: [{ name: 'كشف', duration_minutes: 0 }] },
      { action: 'setup_services', id: s.businessId, services: [{ name: 'كشف', duration_minutes: 30, price: -5 }] },
      { action: 'setup_branch', id: s.businessId, branchId: s.branchId, name: 'ف', capacity: 1, schedule_blocks: { saturday: [{ start: '18:00', end: '10:00' }] } },
      { action: 'setup_image', id: s.businessId, kind: 'logo', base64: 'AAAA', contentType: 'application/pdf' },
    ]
    for (const p of bad) expect((await call({ ...p, token })).status, JSON.stringify(p)).toBe(400)

    const taken = await call({ action: 'setup_business', id: s.businessId, fields: { name: 'عيادة', booking_slug: other.slug }, token })
    expect(taken.status).toBe(409)

    // Another clinic's service and branch are out of reach through this one's id.
    await call({ action: 'setup_services', id: s.businessId, services: [{ id: other.serviceId, name: 'مسروقة', duration_minutes: 30 }], remove: [], token })
    await call({ action: 'setup_services', id: s.businessId, services: [], remove: [other.serviceId], token })
    expect((await one<{ name: string }>('SELECT name FROM services WHERE id=$1', [other.serviceId])).name).toBe(other.serviceName)
    const branch = await call({ action: 'setup_branch', id: s.businessId, branchId: other.branchId, name: 'مسروق', capacity: 1, schedule_blocks: {}, token })
    expect(branch.status).toBe(404)
  })
})
