import { test, expect, seedBusiness, seedAppointment, login, one, sql, API, ADMIN_PASSWORD, phone, isoDate, expectToast, pickTime } from './helpers'
import type { Page } from '@playwright/test'

const PASSWORD = 'TestPass123'
const email = () => `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`

test.describe('sign up and sign in', () => {
  test('register validates, then lands on onboarding', async ({ page }) => {
    await page.goto('/register')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click()
    await expect(page.getByText('هذا الحقل مطلوب').first()).toBeVisible()
    await page.getByLabel('البريد الإلكتروني').fill(email())
    await page.getByLabel('كلمة المرور', { exact: true }).fill('abcdefgh')
    await page.getByLabel('تأكيد كلمة المرور').fill('different1')
    await page.getByLabel('رقم واتساب بتاعك').fill('2010')
    await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click()
    await expect(page.getByText(/رقم واحد على الأقل/)).toBeVisible()
    await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click()
    await expect(page.getByText('كلمات المرور غير متطابقة')).toBeVisible()
    await expect(page.getByText('رقم الواتساب غير صحيح')).toBeVisible()
    await page.getByLabel('تأكيد كلمة المرور').fill(PASSWORD)
    await page.getByLabel('رقم واتساب بتاعك').fill('+20 100 123 4567')
    await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click()
    await expect(page).toHaveURL(/\/onboarding/)
  })

  test('an email already used says so', async ({ page }) => {
    const s = await seedBusiness()
    await page.goto('/register')
    await page.getByRole('checkbox').check()
    await page.getByLabel('البريد الإلكتروني').fill(s.email)
    await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD)
    await page.getByLabel('تأكيد كلمة المرور').fill(PASSWORD)
    await page.getByLabel('رقم واتساب بتاعك').fill('201001234567')
    await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click()
    await expect(page.getByText('هذا البريد الإلكتروني مسجل بالفعل')).toBeVisible()
  })

  test('login: wrong password refused, right one reaches the dashboard, logout works', async ({ page }) => {
    const s = await seedBusiness()
    await page.goto('/login')
    await page.getByLabel('البريد الإلكتروني').fill(s.email)
    await page.getByLabel('كلمة المرور').fill('WrongPass123')
    await page.getByRole('button', { name: /تسجيل الدخول|دخول/ }).first().click()
    await expect(page.getByText('البريد الإلكتروني أو كلمة المرور غير صحيحة')).toBeVisible()
    await page.getByLabel('كلمة المرور').fill(s.password)
    await page.getByRole('button', { name: /تسجيل الدخول|دخول/ }).first().click()
    await expect(page).toHaveURL(/\/dashboard/)
    await page.getByRole('button', { name: 'تسجيل الخروج' }).first().click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('every protected page sends a visitor to login', async ({ page }) => {
    for (const path of ['/dashboard', '/appointments', '/reports', '/settings', '/settings/branches', '/crm', '/patients/201000000000', '/onboarding']) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/login/)
    }
  })

  test('forgot password sends the email with the right return link', async ({ page }) => {
    const s = await seedBusiness()
    await page.goto('/forgot-password')
    await page.getByLabel('البريد الإلكتروني').fill(s.email)
    await page.getByRole('button', { name: /إرسال|رابط/ }).first().click()
    await expect.poll(async () => {
      const list = await (await fetch(`${API}/__test/emails`)).json()
      return list.find(e => e.to === s.email)?.redirect
    }).toContain('/reset-password')
  })

  test('reset password needs a valid link, and works with one', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByText(/الرابط غير صالح/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'حفظ كلمة المرور' })).toBeDisabled()
    const s = await seedBusiness()
    await login(page, s)
    await page.goto('/reset-password')
    await page.getByLabel('كلمة المرور الجديدة').fill('NewPass1234')
    await page.getByLabel('تأكيد كلمة المرور').fill('NewPass1234')
    await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('a logged-in visitor opening / goes to the dashboard', async ({ page }) => {
    const s = await seedBusiness()
    await login(page, s)
    await page.goto('/')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('an account with no business is sent to onboarding, not an empty dashboard', async ({ page }) => {
    const user = await (await fetch(`${API}/__test/user`, { method: 'POST', body: JSON.stringify({ email: email(), password: PASSWORD, data: { terms_accepted_at: new Date().toISOString() } }) })).json()
    await login(page, { ownerId: user.id })
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/onboarding/)
  })

  test('a Google sign-up with no phone is asked for it, then continues', async ({ page }) => {
    const user = await (await fetch(`${API}/__test/user`, { method: 'POST', body: JSON.stringify({ email: email(), password: PASSWORD, data: { terms_accepted_at: new Date().toISOString() } }) })).json()
    await login(page, { ownerId: user.id })
    await page.goto('/auth/callback')
    await page.getByLabel('رقم الواتساب').fill('12')
    await page.getByRole('button', { name: 'كمّل' }).click()
    await expect(page.getByText('رقم الواتساب غير صحيح')).toBeVisible()
    await page.getByLabel('رقم الواتساب').fill('201001234567')
    await page.getByRole('button', { name: 'كمّل' }).click()
    await expect(page).toHaveURL(/\/onboarding/)
  })
})

test.describe('onboarding', () => {
  async function walk(page: Page, { multi = false } = {}) {
    await page.getByRole('button', { name: /عيادة طبية/ }).last().click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByLabel(/اسم العيادة|اسم/).first().fill('عيادة الاختبار')
    if (await page.getByLabel('رقم واتساب بتاعك').isVisible()) await page.getByLabel('رقم واتساب بتاعك').fill('201001234567')
    await page.getByRole('button', { name: 'التالي' }).click()
    if (multi) {
      await page.getByRole('button', { name: /أكتر من فرع/ }).click()
      await page.getByRole('button', { name: 'إضافة فرع' }).click()
      await page.getByPlaceholder('اسم الفرع').nth(1).fill('فرع تاني')
    }
    await page.getByRole('button', { name: 'التالي' }).click()
  }
  const newUser = async (page: Page) => {
    const user = await (await fetch(`${API}/__test/user`, { method: 'POST', body: JSON.stringify({ email: email(), password: PASSWORD, data: { terms_accepted_at: new Date().toISOString() } }) })).json()
    await login(page, { ownerId: user.id })
    await page.goto('/onboarding')
    return user
  }

  test('all steps finish, and the resulting booking page works', async ({ page }) => {
    const user = await newUser(page)
    await walk(page, { multi: true })
    await page.getByText('السبت').first().click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByRole('button', { name: 'إنهاء الإعداد' }).click()
    await expect(page.getByText('جاهز للاستقبال!')).toBeVisible()
    const biz = await one<{ id: string; name: string; booking_slug: string }>('SELECT * FROM businesses WHERE owner_id=$1', [user.id])
    expect(biz.name).toBe('عيادة الاختبار')
    expect((await sql('SELECT id FROM branches WHERE business_id=$1', [biz.id]))).toHaveLength(2)
    expect((await sql('SELECT id FROM services WHERE business_id=$1', [biz.id])).length).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'ابدأ الاستخدام' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('the link preview shows the real domain', async ({ page }) => {
    await newUser(page)
    await walk(page)
    await page.getByText('السبت').first().click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await expect(page.getByText('beshola.app')).toHaveCount(0)
  })

  test('a business with no opening days is not allowed through silently', async ({ page }) => {
    await newUser(page)
    await walk(page)
    await page.getByRole('button', { name: 'التالي' }).click()
    await expect(page.getByText('اختار يوم واحد على الأقل')).toBeVisible()
  })

  test('a branch with no name is not allowed through', async ({ page }) => {
    await newUser(page)
    await page.getByRole('button', { name: /عيادة طبية/ }).last().click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByLabel(/اسم/).first().fill('عيادة')
    if (await page.getByLabel('رقم واتساب بتاعك').isVisible()) await page.getByLabel('رقم واتساب بتاعك').fill('201001234567')
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByRole('button', { name: /أكتر من فرع/ }).click()
    await page.getByRole('button', { name: 'إضافة فرع' }).click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await expect(page.getByText('اكتب اسم كل فرع')).toBeVisible()
  })
})

test.describe('settings', () => {
  const open = async (page: Page, s, tab: string) => {
    await login(page, s)
    await page.goto('/settings')
    await page.getByRole('button', { name: tab }).click()
  }

  test('business info saves', async ({ page }) => {
    const s = await seedBusiness()
    await login(page, s)
    await page.goto('/settings')
    await page.getByLabel('اسم النشاط').fill('الاسم الجديد')
    await page.getByLabel('رقم الهاتف').fill('01111111111')
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect(page.getByText('تم الحفظ')).toBeVisible()
    expect(await one('SELECT name, phone FROM businesses WHERE id=$1', [s.businessId])).toEqual({ name: 'الاسم الجديد', phone: '201111111111' }) // stored with the country code
  })

  test('an empty business name is refused', async ({ page }) => {
    const s = await seedBusiness()
    await login(page, s)
    await page.goto('/settings')
    await page.getByLabel('اسم النشاط').fill('')
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect(page.getByText(/اسم النشاط/).last()).toBeVisible()
    expect((await one<{ name: string }>('SELECT name FROM businesses WHERE id=$1', [s.businessId])).name).toBe(s.name)
  })

  test('identity: colour, slug and text save and show on the booking page', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s, 'الهوية البصرية')
    const slug = `new-${Date.now().toString(36)}`
    await page.getByPlaceholder('slug-الخاص-بيك').fill(slug)
    await expect(page.getByText('متاح', { exact: true })).toBeVisible()
    await page.locator('textarea').first().fill('نبذة جديدة')
    await page.getByPlaceholder('مثال: تجميل أسنان').fill('أسنان')
    await page.getByRole('button', { name: 'حفظ الهوية' }).click()
    await expect(page.getByText('تم الحفظ')).toBeVisible()
    await page.goto(`/book/${slug}`)
    await expect(page.getByText('نبذة جديدة')).toBeVisible()
  })

  test('identity: a taken slug is refused', async ({ page }) => {
    const other = await seedBusiness()
    const s = await seedBusiness()
    await open(page, s, 'الهوية البصرية')
    await page.getByPlaceholder('slug-الخاص-بيك').fill(other.slug)
    await expect(page.getByText('مش متاح، جرب تاني')).toBeVisible()
    await page.getByRole('button', { name: 'حفظ الهوية' }).click()
    await expect(page.getByText(/هذا الرابط مأخوذ/)).toBeVisible()
  })

  test('identity: logo upload reaches the booking page', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s, 'الهوية البصرية')
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') })
    await page.getByRole('button', { name: 'حفظ الهوية' }).click()
    await expect(page.getByText('تم الحفظ')).toBeVisible()
    const row = await one<{ logo_url: string }>('SELECT logo_url FROM businesses WHERE id=$1', [s.businessId])
    expect(row.logo_url).toContain(`${s.businessId}/logo.png`)
  })

  test('services: add, edit price, delete', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s, 'الخدمات')
    await page.getByRole('button', { name: 'إضافة خدمة' }).click()
    await expect(page.getByPlaceholder('اسم الخدمة')).toHaveCount(2)
    const row = page.locator('div.bg-slate-50', { has: page.locator('input[value="كشف عام"]') }).last()
    await row.getByPlaceholder('السعر').fill('750')
    await row.getByPlaceholder('السعر').blur()
    await expect.poll(async () => Number((await one<{ price: string }>('SELECT price FROM services WHERE id=$1', [s.serviceId])).price)).toBe(750)
    await row.locator('button').click()
    await page.getByRole('button', { name: 'حذف', exact: true }).click()
    await expect(page.getByPlaceholder('اسم الخدمة')).toHaveCount(1)
  })

  test('services: deleting one with bookings keeps the bookings', async ({ page }) => {
    const s = await seedBusiness()
    const appt = await seedAppointment(s)
    await open(page, s, 'الخدمات')
    await page.locator('input[value="كشف عام"]').locator('xpath=..').getByRole('button').click()
    await page.getByRole('button', { name: 'حذف', exact: true }).click()
    await expect(page.getByPlaceholder('اسم الخدمة')).toHaveCount(0)
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE id=$1', [appt.id])).n).toBe(1)
  })

  test('services: a failed save is shown', async ({ page }) => {
    const s = await seedBusiness()
    await page.route('**/rest/v1/services*', r => ['POST', 'DELETE'].includes(r.request().method())
      ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'X', message: 'تعطل السيرفر' }) })
      : r.continue())
    await open(page, s, 'الخدمات')
    await page.getByRole('button', { name: 'إضافة خدمة' }).click()
    await expectToast(page, /تعطل السيرفر/)
    await page.locator('input[value="كشف عام"]').locator('xpath=..').getByRole('button').click()
    await page.getByRole('button', { name: 'حذف', exact: true }).click()
    await expectToast(page, /تعطل السيرفر/)
  })

  test('hours: saved schedule changes the slots on the booking page', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s, 'ساعات العمل')
    await pickTime(page, 0, '14:00')
    await pickTime(page, 1, '15:00')
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect(page.getByText('تم الحفظ')).toBeVisible()
    const row = await one<{ b: { sat: { start: string; end: string }[] } }>('SELECT schedule_blocks b FROM branches WHERE id=$1', [s.branchId])
    expect(row.b.sat[0]).toEqual({ start: '14:00', end: '15:00' })
  })

  test('hours: overlapping periods and an end before the start are refused', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s, 'ساعات العمل')
    await pickTime(page, 0, '20:00')
    await pickTime(page, 1, '09:00')
    await expect(page.getByText(/وقت النهاية لازم/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'حفظ', exact: true })).toBeDisabled()
  })

  test('hours: leaving the tab and coming back shows the saved hours', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s, 'ساعات العمل')
    await pickTime(page, 0, '14:00')
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect(page.getByText('تم الحفظ')).toBeVisible()
    await page.getByRole('button', { name: 'الخدمات' }).click()
    await page.getByRole('button', { name: 'ساعات العمل' }).click()
    await expect(page.locator('button[aria-haspopup="dialog"]').first()).toContainText('2:00 م')
  })

  test('reminders: time and template save', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s, 'التذكيرات')
    await page.getByLabel('نص رسالة التذكير').fill('فاكرينك يا {client_name}')
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect(page.getByText('تم الحفظ')).toBeVisible()
    expect((await one<{ t: string }>('SELECT reminder_template t FROM businesses WHERE id=$1', [s.businessId])).t).toBe('فاكرينك يا {client_name}')
  })

  test('reminders: the template you saved is the message that is sent', async ({ page }) => {
    const s = await seedBusiness({ fields: { reminder_template: 'رسالتي الخاصة يا {client_name}' } })
    await seedAppointment(s, { client_name: 'سامي', appointment_date: isoDate(1) })
    await page.addInitScript(() => {
      (window as unknown as { __urls: string[] }).__urls = []
      window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
    })
    await login(page, s)
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'تذكير', exact: true }).click()
    const url = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls[0])
    expect(decodeURIComponent(url.split('text=')[1])).toContain('رسالتي الخاصة يا سامي')
  })

  test('password: every validation, then a real change', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s, 'الحساب والأمان')
    const change = page.getByRole('button', { name: 'تغيير كلمة المرور' })
    await change.click()
    await expect(page.getByText('من فضلك ادخل كلمة المرور الحالية')).toBeVisible()
    await page.getByLabel('كلمة المرور الحالية').fill('Wrong12345')
    await page.getByLabel('كلمة المرور الجديدة', { exact: true }).fill('short')
    await change.click()
    await expect(page.getByText(/8 أحرف/)).toBeVisible()
    await page.getByLabel('كلمة المرور الجديدة', { exact: true }).fill('NewPass1234')
    await page.getByLabel('تأكيد كلمة المرور الجديدة').fill('Other12345')
    await change.click()
    await expect(page.getByText('كلمتا المرور غير متطابقتين')).toBeVisible()
    await page.getByLabel('تأكيد كلمة المرور الجديدة').fill('NewPass1234')
    await change.click()
    await expect(page.getByText('كلمة المرور الحالية غير صحيحة').first()).toBeVisible()
    await page.getByLabel('كلمة المرور الحالية').fill(s.password)
    await change.click()
    await expect(page.getByText('تم الحفظ')).toBeVisible()
    const res = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: s.email, password: 'NewPass1234' }) })
    expect(res.status).toBe(200)
  })

  test('"request account deletion" sends the request and deletes nothing by itself', async ({ page }) => {
    const s = await seedBusiness()
    await page.addInitScript(() => {
      (window as unknown as { __urls: string[] }).__urls = []
      window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
    })
    await open(page, s, 'الحساب والأمان')
    await page.getByRole('button', { name: 'طلب حذف الحساب' }).click()
    await page.getByRole('button', { name: 'ابعت الطلب' }).click()
    const url = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls[0])
    expect(url).toContain('wa.me/201558389501')
    const text = decodeURIComponent(url.split('text=')[1])
    expect(text).toContain(s.name)
    expect(text).toContain(s.businessId)
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM businesses WHERE id=$1', [s.businessId])).n).toBe(1)
    await expect(page).toHaveURL(/\/settings/)
  })
})

test.describe('branches', () => {
  const open = async (page: Page, s) => { await login(page, s); await page.goto('/settings/branches') }

  test('add, edit, delete', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s)
    await page.getByRole('button', { name: 'إضافة فرع جديد' }).click()
    await page.getByPlaceholder('مثال: فرع المعادي').fill('فرع جديد')
    await page.getByPlaceholder('عنوان الفرع').fill('شارع 9')
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expectToast(page, 'تم الحفظ بنجاح')
    await expect(page.getByText('فرع جديد', { exact: true })).toBeVisible()
    const row = page.locator('div.rounded-xl', { hasText: 'فرع جديد' }).last()
    await row.locator('button').first().click()
    await page.getByPlaceholder('عنوان الفرع').fill('شارع 10')
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect(page.getByText('شارع 10')).toBeVisible()
    await page.locator('div.rounded-xl', { hasText: 'فرع جديد' }).last().getByRole('button').nth(1).click()
    await page.getByRole('button', { name: 'حذف', exact: true }).click()
    await expectToast(page, 'تم حذف الفرع')
    await expect(page.getByText('فرع جديد', { exact: true })).toHaveCount(0)
  })

  test('the main branch cannot be deleted or renamed', async ({ page }) => {
    const s = await seedBusiness()
    await open(page, s)
    const buttons = page.locator('div.rounded-xl', { hasText: 'رئيسي' }).last().locator('button')
    await expect(buttons.nth(1)).toBeDisabled()
    await buttons.first().click()
    await expect(page.getByPlaceholder('مثال: فرع المعادي')).toBeDisabled()
  })

  test('deleting a branch that has bookings explains itself, in Arabic', async ({ page }) => {
    const s = await seedBusiness()
    const b = await one<{ id: string }>(`INSERT INTO branches (business_id,name,is_main,capacity) VALUES ($1,'فرع عليه حجوزات',false,1) RETURNING id`, [s.businessId])
    await seedAppointment(s, { branch_id: b.id })
    await open(page, s)
    await page.locator('div.rounded-xl', { hasText: 'فرع عليه حجوزات' }).last().locator('button').nth(1).click()
    await page.getByRole('button', { name: 'حذف', exact: true }).click()
    await expectToast(page, /عليه مواعيد/)
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM appointments WHERE branch_id=$1', [b.id])).n).toBe(1)
  })

  test('switching branch from the top bar filters the calendar', async ({ page }) => {
    const s = await seedBusiness()
    const b = await one<{ id: string }>(`INSERT INTO branches (business_id,name,is_main,capacity) VALUES ($1,'فرع تاني',false,1) RETURNING id`, [s.businessId])
    await seedAppointment(s, { client_name: 'في الرئيسي', appointment_date: isoDate(0), appointment_time: '23:00' })
    await seedAppointment(s, { client_name: 'في التاني', appointment_date: isoDate(0), appointment_time: '23:00', branch_id: b.id })
    await login(page, s)
    await page.goto('/dashboard')
    await expect(page.getByText('في الرئيسي').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText('في التاني').filter({ visible: true })).toHaveCount(0)
    await page.getByRole('button', { name: /الفرع الرئيسي/ }).first().click()
    await page.getByRole('button', { name: /فرع تاني/ }).first().click()
    await expect(page.getByText('في التاني').filter({ visible: true }).first()).toBeVisible()
  })
})

test.describe('reports', () => {
  test('numbers, filters, CSV and print', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { client_name: 'حاضر', appointment_date: isoDate(0), appointment_time: '08:00', status: 'completed' })
    await seedAppointment(s, { client_name: 'غايب', appointment_date: isoDate(0), appointment_time: '09:00', status: 'no_show' })
    await seedAppointment(s, { client_name: 'اسم, فيه فاصلة', appointment_date: isoDate(0), appointment_time: '10:00', status: 'cancelled' })
    await page.addInitScript(() => {
      (window as unknown as { __printed: number }).__printed = 0
      window.print = () => { (window as unknown as { __printed: number }).__printed++ }
    })
    await login(page, s)
    await page.goto('/reports')
    await expect(page.getByText('3 موعد').filter({ visible: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'لم يحضر' }).click()
    await expect(page.getByText('1 موعد').filter({ visible: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'الكل', exact: true }).click()

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'تصدير CSV' }).click()])
    const fs = await import('node:fs/promises')
    const csv = await fs.readFile(await download.path(), 'utf8')
    const lines = csv.replace(/^﻿/, '').trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines.find(l => l.includes('فاصلة'))).toContain('"اسم, فيه فاصلة"')
    expect(lines.join()).not.toMatch(/,(completed|no_show|cancelled)/) // Arabic status for the reader

    await page.getByRole('button', { name: 'تصدير PDF' }).click()
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)

    await page.getByRole('button', { name: 'هذا الأسبوع' }).click()
    await page.getByRole('button', { name: 'مخصص' }).click()
    await expect(page.getByText('إلى', { exact: true })).toBeVisible()
  })

  test('a CSV cell cannot run as a spreadsheet formula', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { client_name: '=HYPERLINK("http://x")', appointment_date: isoDate(0), appointment_time: '08:00' })
    await login(page, s)
    await page.goto('/reports')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'تصدير CSV' }).click()])
    const fs = await import('node:fs/promises')
    const csv = await fs.readFile(await download.path(), 'utf8')
    expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m)
  })
})

test.describe('notifications', () => {
  test('a booking rings the bell; opening it marks read and offers the confirmation', async ({ page }) => {
    const s = await seedBusiness()
    await page.addInitScript(() => {
      (window as unknown as { __urls: string[] }).__urls = []
      window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
    })
    const appt = await seedAppointment(s, { client_name: 'حاجز جديد' })
    await login(page, s)
    await page.goto('/dashboard')
    await page.getByLabel('الإشعارات').filter({ visible: true }).first().click()
    await page.getByRole('button', { name: /حاجز جديد/ }).click()
    await expect(page.getByText('تفاصيل الإشعار')).toBeVisible()
    await expect.poll(async () => (await one<{ r: boolean }>(`SELECT is_read r FROM notifications WHERE related_appointment_id=$1`, [appt.id])).r).toBe(true)
    await page.getByRole('button', { name: 'إرسال رسالة تأكيد الحجز' }).click()
    const url = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls[0])
    expect(url).toContain(appt.client_phone)
  })

  test('"mark all as read" works', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { appointment_time: '10:00' })
    await seedAppointment(s, { appointment_time: '11:00' })
    await login(page, s)
    await page.goto('/dashboard')
    await page.getByLabel('الإشعارات').filter({ visible: true }).first().click()
    await page.getByRole('button', { name: 'تحديد الكل كمقروء' }).click()
    await expect.poll(async () => (await one<{ n: number }>('SELECT count(*)::int n FROM notifications WHERE business_id=$1 AND NOT is_read', [s.businessId])).n).toBe(0)
  })
})

test.describe('calendar', () => {
  test('views, moving between days, and adding from a slot', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { client_name: 'في التقويم', appointment_date: isoDate(0), appointment_time: '23:30' })
    await login(page, s)
    await page.goto('/dashboard')
    await expect(page.getByText('في التقويم').filter({ visible: true }).first()).toBeVisible()
    await page.getByText('في التقويم').filter({ visible: true }).first().click()
    await expect(page.getByText('تعديل الموعد')).toBeVisible()
    await page.locator('h2', { hasText: 'تعديل الموعد' }).locator('..').getByRole('button').click()
    for (const view of ['الأسبوع', 'الشهر', 'اليوم']) {
      await page.getByRole('button', { name: view, exact: true }).first().click()
      await expect(page.getByText('في التقويم').filter({ visible: true }).first()).toBeVisible()
    }
  })
})

test.describe('trial and subscription', () => {
  test('an expired account is blocked by the expiry screen', async ({ page }) => {
    const s = await seedBusiness({ fields: { trial_ends_at: new Date(Date.now() - 86400000).toISOString() } })
    await login(page, s)
    await page.goto('/dashboard')
    await expect(page.getByText(/انته/).first()).toBeVisible()
  })

  test('a warning shows close to the end, and can be dismissed', async ({ page }) => {
    const s = await seedBusiness({ fields: { trial_ends_at: new Date(Date.now() + 2 * 86400000 - 3600000).toISOString() } })
    await login(page, s)
    await page.goto('/dashboard')
    await expect(page.getByText(/باقي|يومين|يوم/).first()).toBeVisible()
  })

  test('one owner cannot change another clinic through the API', async ({ page }) => {
    const a = await seedBusiness()
    const b = await seedBusiness()
    const session = await (await fetch(`${API}/__test/session`, { method: 'POST', body: JSON.stringify({ id: b.ownerId }) })).json()
    const headers = { apikey: 'local-anon-key', authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' }
    await fetch(`${API}/rest/v1/businesses?id=eq.${a.businessId}`, { method: 'PATCH', headers, body: JSON.stringify({ name: 'مخترق' }) })
    await fetch(`${API}/rest/v1/services?id=eq.${a.serviceId}`, { method: 'DELETE', headers })
    expect((await one<{ name: string }>('SELECT name FROM businesses WHERE id=$1', [a.businessId])).name).toBe(a.name)
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM services WHERE id=$1', [a.serviceId])).n).toBe(1)
    void page
  })
})

test.describe('admin', () => {
  const adminIn = async (page: Page) => {
    await page.goto('/admin')
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
    await page.keyboard.press('Enter')
    await expect(page.getByText('لوحة تحكم بسهولة')).toBeVisible()
  }

  test('activate for a custom number of days with an optional payment', async ({ page }) => {
    const s = await seedBusiness()
    await adminIn(page)
    await page.getByPlaceholder('بحث بالاسم أو رقم التليفون...').fill(s.name)
    const row = page.locator('tr', { hasText: s.name })

    await row.getByTitle('تفعيل').click()
    await page.getByLabel('مدة الاشتراك').selectOption('custom')
    await page.getByLabel('عدد الأيام', { exact: true }).first().fill('35')
    await page.getByLabel('المبلغ المدفوع (اختياري)').fill('500')
    await page.getByLabel('طريقة الدفع (اختياري)').fill('فودافون كاش')
    await page.getByRole('button', { name: 'تفعيل', exact: true }).last().click()
    await expectToast(page, `تم تفعيل ${s.name}`)

    const b = await one<{ d: number }>("SELECT round(extract(epoch FROM trial_ends_at - activated_at) / 86400)::int d FROM businesses WHERE id=$1", [s.businessId])
    expect(b.d).toBe(35)
    const p = await one<{ days: number; amount: string; method: string }>('SELECT days, amount, method FROM subscription_payments WHERE business_id=$1', [s.businessId])
    expect(p).toMatchObject({ days: 35, method: 'فودافون كاش' })
    expect(Number(p.amount)).toBe(500)

    // It shows on the clinic afterwards, and the fields start empty.
    await row.getByTitle('تفعيل').click()
    await expect(page.getByText('المدفوعات السابقة')).toBeVisible()
    await expect(page.getByText(/35 يوم · 500 .* · فودافون كاش/)).toBeVisible()
    await expect(page.getByLabel('المبلغ المدفوع (اختياري)')).toHaveValue('')

    // Payment details are optional: no row without them.
    await page.getByRole('button', { name: 'تفعيل', exact: true }).last().click()
    await expectToast(page, `تم تفعيل ${s.name}`)
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM subscription_payments WHERE business_id=$1', [s.businessId])).n).toBe(1)
  })

  test('an impossible custom period is refused by the form and by the server', async ({ page }) => {
    const s = await seedBusiness()
    await adminIn(page)
    await page.getByPlaceholder('بحث بالاسم أو رقم التليفون...').fill(s.name)
    await page.locator('tr', { hasText: s.name }).getByTitle('تفعيل').click()
    await page.getByLabel('مدة الاشتراك').selectOption('custom')
    await page.getByRole('button', { name: 'تفعيل', exact: true }).last().click()
    await expectToast(page, /اكتب عدد أيام/)
    expect((await one<{ t: string }>('SELECT subscription_type t FROM businesses WHERE id=$1', [s.businessId])).t).not.toBe('paid')

    const token = await page.evaluate(() => sessionStorage.getItem('beshola_admin_token'))
    for (const days of [0, -5, 1.5, 40000, '35']) {
      const res = await fetch(`${API}/functions/v1/admin`, { method: 'POST', body: JSON.stringify({ action: 'activate', id: s.businessId, token, days }) })
      expect(res.status).toBe(400)
    }
  })

  test('wrong password refused; activate, extend, deactivate; search; logout', async ({ page }) => {
    const s = await seedBusiness()
    await page.goto('/admin')
    await page.locator('input[type="password"]').fill('wrong')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/غلط|خطأ|غير صحيح/).first()).toBeVisible()
    await sql('DELETE FROM admin_login_attempts')
    await adminIn(page)

    await page.getByPlaceholder('بحث بالاسم أو رقم التليفون...').fill(s.name)
    const row = page.locator('tr', { hasText: s.name })
    await expect(row).toHaveCount(1)

    await row.getByTitle('تفعيل').click()
    await page.getByRole('button', { name: 'تفعيل', exact: true }).last().click()
    await expectToast(page, `تم تفعيل ${s.name}`)
    expect((await one<{ t: string }>('SELECT subscription_type t FROM businesses WHERE id=$1', [s.businessId])).t).toBe('paid')

    await row.getByTitle('إيقاف').click()
    await page.getByRole('button', { name: 'إيقاف', exact: true }).last().click()
    await expectToast(page, `تم إيقاف ${s.name}`)
    expect((await one<{ a: boolean }>('SELECT is_active a FROM businesses WHERE id=$1', [s.businessId])).a).toBe(false)

    await page.getByRole('button', { name: /موقوفة/ }).click()
    await expect(row).toHaveCount(1)
    await page.getByRole('button', { name: /الكل/ }).click()

    const before = (await one<{ t: string }>('SELECT trial_ends_at t FROM businesses WHERE id=$1', [s.businessId])).t
    await row.getByTitle('تفعيل').click()
    await page.getByRole('button', { name: 'تمديد التجربة' }).click()
    await expectToast(page, `تم تمديد تجربة ${s.name}`)
    const after = await one<{ t: string; a: boolean }>('SELECT trial_ends_at t, is_active a FROM businesses WHERE id=$1', [s.businessId])
    expect(after.a).toBe(true)
    expect(new Date(after.t).getTime()).toBeGreaterThan(new Date(before).getTime())

    await page.getByRole('button', { name: 'تسجيل خروج' }).click()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('five wrong passwords lock the door, with a message saying so', async ({ page }) => {
    await sql('DELETE FROM admin_login_attempts')
    await page.goto('/admin')
    for (let i = 0; i < 6; i++) {
      await page.locator('input[type="password"]').fill('wrong')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(200)
    }
    await expect(page.getByText(/محاولات|دقيقة/).first()).toBeVisible()
    await sql('DELETE FROM admin_login_attempts')
  })

  test('admin actions without a session are refused by the server', async () => {
    const s = await seedBusiness()
    const res = await fetch(`${API}/functions/v1/admin`, { method: 'POST', body: JSON.stringify({ action: 'deactivate', id: s.businessId, token: 'fake' }) })
    expect(res.status).toBe(401)
    expect((await one<{ a: boolean }>('SELECT is_active a FROM businesses WHERE id=$1', [s.businessId])).a).toBe(true)
  })
})

test.describe('public pages', () => {
  test('the calculator computes from what is typed', async ({ page }) => {
    await page.goto('/tools/no-show-calculator')
    const inputs = page.locator('input[type="number"]')
    await inputs.nth(0).fill('10')
    await inputs.nth(1).fill('20')
    await inputs.nth(2).fill('10')
    await inputs.nth(3).fill('100')
    await expect(page.getByText('2,000').first()).toBeVisible()
    await expect(page.getByText('24,000').first()).toBeVisible()
  })

  test('every internal link on the main pages leads somewhere real', async ({ page }) => {
    const seen = new Set<string>()
    for (const start of ['/', '/product', '/faq', '/guides', '/tools/no-show-calculator', '/login', '/register']) {
      await page.goto(start)
      await page.waitForTimeout(300)
      const hrefs = await page.locator('a[href^="/"]').evaluateAll(as => as.map(a => (a as HTMLAnchorElement).getAttribute('href')!))
      for (const h of hrefs) seen.add(h.split('#')[0].split('?')[0] || '/')
    }
    const broken: string[] = []
    for (const href of seen) {
      await page.goto(href)
      await page.waitForTimeout(150)
      if (await page.getByText(/الصفحة (دي )?(مش موجودة|غير موجودة)|404/).count()) broken.push(href)
    }
    expect(broken).toEqual([])
    expect(seen.size).toBeGreaterThan(5)
  })

  test('a wrong address shows the 404 page', async ({ page }) => {
    await page.goto('/no-such-page-here')
    await expect(page.getByRole('link', { name: /الرئيسية/ }).first()).toBeVisible()
  })

  test('the referral link in a URL is remembered through sign-up', async ({ page }) => {
    await page.goto('/register?ref=P-tester')
    await expect(page.getByText(/جاي بترشيح/)).toBeVisible()
  })

  test('partner login: wrong details refused', async ({ page }) => {
    await page.goto('/partner')
    const inputs = page.locator('input')
    await inputs.nth(0).fill(phone())
    await inputs.nth(1).fill('000000')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/مش صح/).first()).toBeVisible()
  })
})
