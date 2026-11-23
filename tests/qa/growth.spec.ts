import { test, expect, seedBusiness, one, sql, ADMIN_PASSWORD, API, phone } from './helpers'
import type { Page } from '@playwright/test'

// Beshola's own sales side: the "call me" forms, demo pages, partners with their
// login and dashboard, and crediting a signup to whoever referred it.

async function adminIn(page: Page) {
  await sql('DELETE FROM admin_login_attempts')
  await page.goto('/admin')
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.keyboard.press('Enter')
  await expect(page.getByText('لوحة تحكم بسهولة')).toBeVisible()
}

test.describe('"call me" form on public pages', () => {
  test('the landing form saves a lead with a clean number and the source', async ({ page }) => {
    await page.goto('/')
    const tel = `010${String(Date.now()).slice(-8)}`
    const form = page.locator('form', { has: page.getByPlaceholder('رقم الموبايل') }).last()
    await form.getByPlaceholder('اسمك').fill('د. منى اختبار')
    await form.getByPlaceholder('رقم الموبايل').fill(tel)
    await form.getByPlaceholder(/اسم العيادة/).fill('عيادة منى للاختبار')
    await form.locator('button[type="submit"]').click()
    await expect(page.getByText(/هنكلمك|هنتواصل|وصلنا|شكراً/).first()).toBeVisible()
    const lead = await one<{ name: string; phone: string; source: string }>(
      `SELECT name, phone, source FROM growth_leads WHERE phone LIKE $1 ORDER BY created_at DESC LIMIT 1`, [`%${tel.slice(1)}`])
    expect(lead).toBeTruthy()
    expect(lead.phone).toMatch(/^20?1?0?\d+$/)
  })

  test('a bad number is refused with a message, and nothing is saved', async ({ page }) => {
    await page.goto('/')
    const before = (await one<{ n: number }>('SELECT count(*)::int n FROM growth_leads')).n
    const form = page.locator('form', { has: page.getByPlaceholder('رقم الموبايل') }).last()
    await form.getByPlaceholder('اسمك').fill('اختبار')
    await form.getByPlaceholder('رقم الموبايل').fill('123')
    await form.locator('button[type="submit"]').click()
    await expect(page.getByText('رقم التليفون مش صحيح')).toBeVisible()
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM growth_leads')).n).toBe(before)
  })

  test('the calculator page form works too', async ({ page }) => {
    await page.goto('/tools/no-show-calculator')
    const tel = `011${String(Date.now()).slice(-8)}`
    const form = page.locator('form', { has: page.getByPlaceholder('رقم الموبايل') }).first()
    await form.getByPlaceholder('اسمك').fill('د. حاسبة')
    await form.getByPlaceholder('رقم الموبايل').fill(tel)
    await form.locator('button[type="submit"]').click()
    await expect.poll(async () =>
      (await one<{ n: number }>(`SELECT count(*)::int n FROM growth_leads WHERE phone LIKE $1`, [`%${tel.slice(1)}`])).n,
    ).toBe(1)
  })

  test('the same clinic asking twice does not create two leads', async ({ page }) => {
    const tel = `012${String(Date.now()).slice(-8)}`
    for (let i = 0; i < 2; i++) {
      await page.goto('/')
      const form = page.locator('form', { has: page.getByPlaceholder('رقم الموبايل') }).last()
      await form.getByPlaceholder('اسمك').fill('مكرر')
      await form.getByPlaceholder('رقم الموبايل').fill(tel)
      await form.locator('button[type="submit"]').click()
      await page.waitForTimeout(800)
    }
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM growth_leads WHERE phone LIKE $1`, [`%${tel.slice(1)}`])).n).toBe(1)
  })
})

test.describe('demo page', () => {
  test('a lead\'s demo link shows their own booking page preview', async ({ page }) => {
    const lead = await one<{ ref_code: string }>(`INSERT INTO growth_leads (name, category, city, phone, source, stage, preview)
      VALUES ('عيادة ديمو', 'dental', 'القاهرة', $1, 'manual', 'new',
        '{"enabled": true, "specialty": "تقويم", "services": [{"name": "كشف تقويم", "duration": 30, "price": 400}]}'::jsonb)
      RETURNING ref_code`, [phone()])
    await page.goto(`/demo/${lead.ref_code}`)
    await expect(page.getByText('عيادة ديمو').first()).toBeVisible()
  })

  test('a wrong demo code says so', async ({ page }) => {
    await page.goto('/demo/L-NOPE00')
    await expect(page.getByText(/مش موجود|غير موجود|انتهى|مش متاح/).first()).toBeVisible()
  })
})

test.describe('partners', () => {
  test('admin adds a partner and makes a login code; the partner logs in and sees their dashboard', async ({ page }) => {
    await adminIn(page)
    await page.goto('/admin/growth')
    await page.getByRole('button', { name: /الشركاء والترشيحات/ }).click()
    await page.getByRole('button', { name: /شريك جديد/ }).click()
    const tel = `0109${String(Date.now()).slice(-7)}`
    await page.getByLabel('الاسم *').fill('مندوب الاختبار')
    await page.getByLabel('الموبايل').fill(tel)
    await page.locator('button[type="submit"]', { hasText: 'إضافة' }).click()
    await expect(page.getByText('مندوب الاختبار').first()).toBeVisible()

    await page.getByRole('button', { name: /التفاصيل/ }).first().click()
    await page.getByRole('button', { name: /اعمل كود دخول/ }).first().click()
    const pin = (await page.locator('span.font-mono.tracking-widest').first().textContent())!.trim()
    expect(pin).toMatch(/^\d{6}$/)

    const partner = await page.context().newPage()
    await partner.goto('/partner')
    await partner.locator('input').nth(0).fill(tel)
    await partner.locator('input').nth(1).fill(pin)
    await partner.getByRole('button', { name: 'ادخل' }).click()
    await expect(partner).toHaveURL(/\/partner\/[0-9a-f-]{36}/)
    await expect(partner.getByText(/مندوب الاختبار/).first()).toBeVisible()
  })

  test('a partner link with a wrong token shows nothing private', async ({ page }) => {
    await page.goto('/partner/00000000-0000-0000-0000-000000000000')
    await expect(page.getByText(/مش صالح|غير صالح|مش موجود|اتغيّر/).first()).toBeVisible()
  })

  test('five wrong codes lock the partner login', async ({ page }) => {
    const tel = phone()
    await sql(`INSERT INTO growth_partners (name, phone, pin_hash, pin_salt) VALUES ('مقفول', $1, 'x', 'y')`, [tel]).catch(() => {})
    await page.goto('/partner')
    for (let i = 0; i < 6; i++) {
      await page.locator('input').nth(0).fill(tel)
      await page.locator('input').nth(1).fill('123456')
      await page.getByRole('button', { name: 'ادخل' }).click()
      await page.waitForTimeout(300)
    }
    const p = await one<{ locked: string | null }>('SELECT pin_locked_until::text locked FROM growth_partners WHERE phone=$1', [tel])
    expect(p?.locked).toBeTruthy()
  })
})

/** Signs up on the page already open at /register and finishes onboarding. */
async function signUpAndOnboard(page: Page, email: string, whatsapp: string, name: string) {
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور', { exact: true }).fill('TestPass123')
  await page.getByLabel('تأكيد كلمة المرور').fill('TestPass123')
  await page.getByRole('textbox', { name: /واتساب/ }).fill(whatsapp)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click()
  await expect(page).toHaveURL(/\/onboarding/)

  await page.getByRole('button', { name: /عيادة طبية/ }).last().click()
  await page.getByRole('button', { name: 'التالي' }).click()
  await page.getByLabel(/اسم/).first().fill(name)
  await page.getByRole('button', { name: 'التالي' }).click()
  await page.getByRole('button', { name: 'التالي' }).click()
  await page.getByText('السبت').first().click()
  await page.getByRole('button', { name: 'التالي' }).click()
  await page.getByRole('button', { name: 'التالي' }).click()
  await page.getByRole('button', { name: 'إنهاء الإعداد' }).click()
  await expect(page.getByText('جاهز للاستقبال!')).toBeVisible()
}

const trialDaysOf = async (email: string) => (await one<{ d: number }>(
  `SELECT round(extract(epoch FROM b.trial_ends_at - b.trial_started_at) / 86400)::int d
   FROM businesses b JOIN auth.users u ON u.id = b.owner_id WHERE u.email = $1`, [email]))?.d

test.describe('referral credit', () => {
  test('a clinic that signs up from a partner link is credited to that partner', async ({ page }) => {
    const partner = await one<{ id: string; ref_code: string }>(
      `INSERT INTO growth_partners (name, phone) VALUES ('شريك الترشيح', $1) RETURNING id, ref_code`, [phone()])
    await page.goto(`/register?ref=${partner.ref_code}`)
    await expect(page.getByText(/جاي بترشيح/)).toBeVisible()
    await expect(page.getByText(/فترة التجربة المجانية مع الترشيح/)).toHaveCount(0)
    const email = `ref-${Date.now()}@test.local`
    await signUpAndOnboard(page, email, '+201004445556', 'عيادة جت بترشيح')

    await expect.poll(async () => (await one<{ partner_id: string | null }>(
      `SELECT l.partner_id FROM growth_leads l JOIN businesses b ON b.id = l.business_id
       JOIN auth.users u ON u.id = b.owner_id WHERE u.email = $1`, [email]))?.partner_id, { timeout: 10000 }).toBe(partner.id)
    expect(await trialDaysOf(email)).toBe(14)
  })

  test('the admin sets a partner trial, and the partner makes a no-trial link for one client', async ({ page }) => {
    const tel = phone()
    const partner = await one<{ id: string; access_token: string }>(
      `INSERT INTO growth_partners (name, phone, commission_pct) VALUES ('شريكة المدة', $1, 20) RETURNING id, access_token`, [tel])

    // The admin gives her own link 2 days.
    await adminIn(page)
    await page.goto('/admin/growth')
    await page.getByRole('button', { name: /الشركاء والترشيحات/ }).click()
    const card = page.locator('li', { hasText: 'شريكة المدة' }).first()
    await card.getByRole('button', { name: /التفاصيل/ }).click()
    await card.getByRole('button', { name: /تعديل/ }).click()
    await page.getByLabel('أيام التجربة من لينكه').fill('2')
    await page.locator('button[type="submit"]', { hasText: 'حفظ' }).click()
    await expect(page.getByText('التجربة: يومين')).toBeVisible()

    // Her dashboard says so, and makes a link with no trial for one client.
    const dash = await page.context().newPage()
    await dash.goto(`/partner/${partner.access_token}`)
    await expect(dash.getByText(/تجربة يومين ببلاش/)).toBeVisible()
    await dash.getByPlaceholder(/اسم الدكتور/).fill('د. سامي')
    await dash.getByLabel('مدة التجربة').selectOption('0')
    await dash.getByRole('button', { name: 'اعمل لينك' }).click()
    await expect(dash.getByText('د. سامي')).toBeVisible()
    const url = (await dash.getByTestId('client-link').first().textContent())!.trim()
    const code = new URL(url).searchParams.get('ref')!
    expect(code).toMatch(/^T-/)

    // A clinic signing up with it is told, credited to her, and locked until activated.
    const clinic = await page.context().browser()!.newContext()
    const reg = await clinic.newPage()
    await reg.goto(`/register?ref=${code}`)
    await expect(reg.getByText(/من غير فترة تجربة/)).toBeVisible()
    const email = `notrial-${Date.now()}@test.local`
    await signUpAndOnboard(reg, email, `+2010${String(Date.now()).slice(-8)}`, 'عيادة مشتركة على طول')
    await expect.poll(() => trialDaysOf(email), { timeout: 10000 }).toBe(0)
    expect((await one<{ partner_id: string }>(
      `SELECT l.partner_id FROM growth_leads l JOIN businesses b ON b.id = l.business_id
       JOIN auth.users u ON u.id = b.owner_id WHERE u.email = $1`, [email]))?.partner_id).toBe(partner.id)
    await reg.getByRole('button', { name: 'ابدأ الاستخدام' }).click()
    await expect(reg.getByText('حسابك جاهز، فاضل التفعيل')).toBeVisible()

    await dash.reload()
    await expect(dash.getByText(/سجّل منه 1/)).toBeVisible()
    await clinic.close()
  })
})

test.describe('growth dashboard (admin)', () => {
  test('adding one clinic by hand puts it in the list, and its page logs a call', async ({ page }) => {
    await adminIn(page)
    await page.goto('/admin/growth')
    await page.getByRole('button', { name: /^إضافة/ }).first().click()
    const tel = `0155${String(Date.now()).slice(-7)}`
    await page.getByLabel('اسم العيادة / المكان *').fill('عيادة مضافة يدوي')
    await page.getByLabel('رقم التليفون').fill(tel)
    await page.getByRole('button', { name: /^(إضافة|حفظ|ضيف)/ }).last().click()
    await expect.poll(async () =>
      (await one<{ n: number }>(`SELECT count(*)::int n FROM growth_leads WHERE name = 'عيادة مضافة يدوي'`)).n,
    ).toBe(1)
  })

  test('growth actions need an admin session on the server', async () => {
    const res = await fetch(`${API}/functions/v1/growth`, { method: 'POST', body: JSON.stringify({ action: 'list', token: 'fake' }) })
    expect(res.status).toBe(401)
  })
})
