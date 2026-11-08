import { test, expect, seedBusiness, seedAppointment, login, one, sql, isoDate, expectToast } from './helpers'
import type { Page } from '@playwright/test'

async function openDrawer(page: Page, s) {
  await login(page, s)
  await page.goto('/crm')
  await page.getByRole('button', { name: 'عرض الملف' }).first().click()
}

test.describe('clients page', () => {
  test('search, status tabs and clearing', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { client_name: 'منتظم جدا', appointment_date: isoDate(-5), appointment_time: '10:00', status: 'completed' })
    await seedAppointment(s, { client_name: 'فاتر جدا', appointment_date: isoDate(-45), appointment_time: '10:00', status: 'completed' })
    await seedAppointment(s, { client_name: 'ضايع جدا', appointment_date: isoDate(-90), appointment_time: '10:00', status: 'completed' })
    await login(page, s)
    await page.goto('/crm')
    await expect(page.getByRole('button', { name: 'عرض الملف' })).toHaveCount(3)
    await page.getByRole('button', { name: /فاترين/ }).click()
    await expect(page.getByRole('button', { name: 'عرض الملف' })).toHaveCount(1)
    await expect(page.getByText('فاتر جدا')).toBeVisible()
    await page.getByRole('button', { name: /ضايعين/ }).click()
    await expect(page.getByText('ضايع جدا')).toBeVisible()
    await page.getByRole('button', { name: /الكل/ }).click()
    await page.getByPlaceholder('ابحث باسم العميل أو رقمه...').fill('لا يوجد')
    await expect(page.getByText('لا توجد نتائج')).toBeVisible()
    await page.getByRole('button', { name: 'إلغاء الفلتر' }).click()
    await expect(page.getByRole('button', { name: 'عرض الملف' })).toHaveCount(3)
  })

  test('card and drawer agree on what a client has spent, and cancelled visits are not counted', async ({ page }) => {
    const s = await seedBusiness()
    const tel = '201001112233'
    await seedAppointment(s, { client_phone: tel, appointment_date: isoDate(-3), appointment_time: '10:00', status: 'completed', price: 500 })
    await seedAppointment(s, { client_phone: tel, appointment_date: isoDate(-2), appointment_time: '10:00', status: 'cancelled', price: 900 })
    await login(page, s)
    await page.goto('/crm')
    await expect(page.locator('p', { hasText: /^500$/ })).toBeVisible()
    await page.getByRole('button', { name: 'عرض الملف' }).click()
    await expect(page.locator('p', { hasText: /^500$/ }).last()).toBeVisible()
  })

  test('a client whose only visit is in the future has no "last visit" yet', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { appointment_date: isoDate(10) })
    await login(page, s)
    await page.goto('/crm')
    const stat = page.locator('div.rounded-xl', { hasText: 'آخر زيارة' }).first()
    await expect(stat).toContainText('—')
  })
})

test.describe('client drawer', () => {
  test('notes save and survive a reload', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s)
    await openDrawer(page, s)
    await page.getByPlaceholder('اكتب ملاحظة عن العميل...').fill('بيحب المواعيد الصبح')
    await page.getByRole('button', { name: 'حفظ الملاحظة' }).click()
    await expectToast(page, 'تم حفظ الملاحظة')
    await page.reload()
    await page.getByRole('button', { name: 'عرض الملف' }).first().click()
    await expect(page.getByPlaceholder('اكتب ملاحظة عن العميل...')).toHaveValue('بيحب المواعيد الصبح')
  })

  test('statement: a payment and a charge update the balance', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s)
    await openDrawer(page, s)
    await page.getByRole('button', { name: 'كشف الحساب' }).click()
    await expect(page.getByText('الحساب متزن')).toBeVisible()

    await page.getByRole('button', { name: 'مصروف إضافي' }).click()
    await page.getByLabel('الوصف').fill('خدمة إضافية')
    await page.getByLabel('المبلغ').fill('300')
    await page.getByRole('button', { name: 'إضافة', exact: true }).click()
    await expect(page.getByText('300 ج.م').first()).toBeVisible()
    await expect(page.getByText('إجمالي عليه')).toBeVisible()

    await page.getByRole('button', { name: 'إضافة دفعة' }).click()
    await page.getByLabel('المبلغ').fill('100')
    await page.getByRole('button', { name: 'إضافة الدفعة' }).click()
    await expect(page.getByText('200 ج.م', { exact: true }).first()).toBeVisible()
  })

  test('statement: an empty amount says why nothing happened', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s)
    await openDrawer(page, s)
    await page.getByRole('button', { name: 'كشف الحساب' }).click()
    await page.getByRole('button', { name: 'إضافة دفعة' }).click()
    await page.getByRole('button', { name: 'إضافة الدفعة' }).click()
    await expect(page.getByText('اكتب مبلغ أكبر من صفر')).toBeVisible()
    await page.locator('h2', { hasText: 'إضافة دفعة' }).locator('..').getByRole('button').click()
    await page.getByRole('button', { name: 'مصروف إضافي' }).click()
    await page.getByRole('button', { name: 'إضافة', exact: true }).click()
    await expect(page.getByText('اكتب الوصف والمبلغ')).toBeVisible()
  })

  test('statement: a save failure is shown, not swallowed', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s)
    await page.route('**/rest/v1/client_ledger_entries*', r => r.request().method() === 'POST'
      ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'X', message: 'تعطل السيرفر' }) })
      : r.continue())
    await openDrawer(page, s)
    await page.getByRole('button', { name: 'كشف الحساب' }).click()
    await page.getByRole('button', { name: 'إضافة دفعة' }).click()
    await page.getByLabel('المبلغ').fill('100')
    await page.getByRole('button', { name: 'إضافة الدفعة' }).click()
    await expectToast(page, /تعطل السيرفر/)
  })

  test('the record button opens this client\'s file, retargeting prepares a message', async ({ page }) => {
    const s = await seedBusiness()
    const appt = await seedAppointment(s)
    await page.addInitScript(() => {
      (window as unknown as { __urls: string[] }).__urls = []
      window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
    })
    await openDrawer(page, s)
    await page.getByRole('button', { name: 'إعادة الاستهداف بواتساب' }).click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByRole('button', { name: 'إرسال الآن' }).click()
    await page.getByRole('button', { name: 'تم', exact: true }).click()
    const url = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls[0])
    expect(url).toContain(`wa.me/${appt.client_phone}`)
    const text = decodeURIComponent(url.split('text=')[1])
    expect(text).toContain(s.slug) // a readable booking link, not a raw id
    await page.getByRole('button', { name: 'ملف المريض الطبي' }).click()
    await expect(page).toHaveURL(new RegExp(`/patients/${appt.client_phone}`))
  })

  test('bulk retargeting does not claim success when the browser blocks the WhatsApp tabs', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { appointment_date: isoDate(-90), appointment_time: '10:00' })
    await seedAppointment(s, { appointment_date: isoDate(-91), appointment_time: '10:00' })
    await page.addInitScript(() => { window.open = () => null })
    await login(page, s)
    await page.goto('/crm')
    await page.getByRole('button', { name: 'عرض الملف' }).first().click()
    await page.getByRole('button', { name: 'إعادة الاستهداف بواتساب' }).click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByRole('button', { name: 'إرسال الآن' }).click()
    await expect(page.getByText('فشل')).toBeVisible()
  })
})

test.describe('patient record (clinic)', () => {
  const goto = async (page: Page, s, tel: string) => {
    await login(page, s)
    await page.goto(`/patients/${tel}`)
    await expect(page.getByText('المعلومات الشخصية')).toBeVisible()
  }
  const record = (s, tel: string) => one<Record<string, unknown>>(
    'SELECT * FROM patient_records WHERE business_id=$1 AND client_phone=$2', [s.businessId, tel])

  test('every field saves and is back after a reload', async ({ page }) => {
    const s = await seedBusiness()
    const { client_phone: tel } = await seedAppointment(s)
    await goto(page, s, tel)
    await page.getByRole('button', { name: 'أنثى' }).click()
    await expect.poll(async () => (await record(s, tel))?.gender).toBe('female')
    await page.getByRole('button', { name: 'O+', exact: true }).click()
    await expect.poll(async () => (await record(s, tel))?.blood_type).toBe('O+')
    await page.getByPlaceholder('14 رقم').fill('29001011234567')
    await page.getByPlaceholder('العنوان التفصيلي').click()
    await expect.poll(async () => (await record(s, tel))?.national_id).toBe('29001011234567')
    await page.reload()
    await expect(page.getByPlaceholder('14 رقم')).toHaveValue('29001011234567')
  })

  test('changing two things quickly keeps both', async ({ page }) => {
    const s = await seedBusiness()
    const { client_phone: tel } = await seedAppointment(s)
    await goto(page, s, tel)
    await page.getByRole('button', { name: 'ذكر' }).click()
    await page.getByRole('button', { name: 'A+', exact: true }).click()
    await expect.poll(async () => (await record(s, tel))?.blood_type).toBe('A+')
    await expect.poll(async () => (await record(s, tel))?.gender).toBe('male')
  })

  test('adding several allergies quickly keeps all of them', async ({ page }) => {
    const s = await seedBusiness()
    const { client_phone: tel } = await seedAppointment(s)
    await goto(page, s, tel)
    const input = page.getByPlaceholder('أضف نوع حساسية...')
    for (const a of ['بنسلين', 'أسبرين', 'لاتكس']) {
      await input.fill(a)
      await input.press('Enter')
    }
    await expect(page.getByText('لاتكس')).toBeVisible()
    await expect(page.getByText('بنسلين')).toBeVisible()
    await expect.poll(async () => (await record(s, tel))?.allergies).toEqual(['بنسلين', 'أسبرين', 'لاتكس'])
  })

  test('leaving the page right after a change still saves it', async ({ page }) => {
    const s = await seedBusiness()
    const { client_phone: tel } = await seedAppointment(s)
    await goto(page, s, tel)
    await page.getByRole('button', { name: 'B+', exact: true }).click()
    await page.getByRole('button', { name: 'الزيارات', exact: true }).click()
    await expect.poll(async () => (await record(s, tel))?.blood_type).toBe('B+')
  })

  test('diagnosis: add, edit, and it shows on the visit', async ({ page }) => {
    const s = await seedBusiness()
    const { client_phone: tel } = await seedAppointment(s, { appointment_date: isoDate(-1) })
    await goto(page, s, tel)
    await page.getByRole('button', { name: 'الزيارات', exact: true }).click()
    await page.getByRole('button', { name: /كشف عام/ }).click()
    await page.getByRole('button', { name: 'إضافة تشخيص' }).click()
    await page.getByPlaceholder('التشخيص').fill('التهاب لثة')
    await page.getByPlaceholder('العلاج').fill('مضاد حيوي')
    // The visit card hides overflow and used to cut the calendar in half, which
    // left the days unreachable. A real click fails if that comes back.
    await page.getByRole('button', { name: 'اختر تاريخ' }).click()
    const today = page.locator('body > div.fixed[dir="rtl"]').getByRole('button', { name: 'اليوم', exact: true })
    await expect(today).toBeInViewport({ ratio: 1 })
    await today.click()
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expectToast(page, 'تم الحفظ')
    await expect(page.getByText('التهاب لثة')).toBeVisible()
    await page.getByRole('button', { name: 'تعديل التشخيص' }).click()
    await page.getByPlaceholder('التشخيص').fill('التهاب لثة حاد')
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect(page.getByText('التهاب لثة حاد')).toBeVisible()
    expect((await sql('SELECT id FROM diagnoses WHERE business_id=$1', [s.businessId]))).toHaveLength(1)
  })

  test('prescription: rows, save, print', async ({ page }) => {
    const s = await seedBusiness()
    const { client_phone: tel } = await seedAppointment(s)
    await page.addInitScript(() => {
      (window as unknown as { __printed: number }).__printed = 0
      window.print = () => { (window as unknown as { __printed: number }).__printed++ }
    })
    await goto(page, s, tel)
    await page.getByRole('button', { name: 'الروشتات' }).click()
    await page.getByRole('button', { name: 'روشتة جديدة' }).click()
    await expect(page.getByRole('button', { name: 'حفظ الروشتة' })).toBeDisabled()
    await page.getByPlaceholder('اسم الدواء').fill('أموكسيسيلين')
    await page.getByPlaceholder('الجرعة').fill('500 مجم')
    await page.getByRole('button', { name: 'إضافة دواء آخر' }).click()
    await page.getByPlaceholder('اسم الدواء').nth(1).fill('باراسيتامول')
    await page.getByPlaceholder('تعليمات للمريض...').fill('بعد الأكل')
    await page.getByRole('button', { name: 'حفظ الروشتة' }).click()
    await expectToast(page, 'تم حفظ الروشتة')
    await expect(page.getByRole('cell', { name: 'أموكسيسيلين' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'باراسيتامول' })).toBeVisible()
    await page.getByRole('button', { name: 'طباعة' }).click()
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)
  })

  test('attachments: upload, then delete, with the file gone from storage', async ({ page }) => {
    const s = await seedBusiness()
    const { client_phone: tel } = await seedAppointment(s)
    await goto(page, s, tel)
    await page.getByRole('button', { name: 'الملفات' }).click()
    await page.locator('input[type="file"]').setInputFiles({ name: 'xray.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') })
    await page.getByRole('button', { name: 'أشعة' }).click()
    await page.getByRole('button', { name: 'رفع', exact: true }).click()
    await expectToast(page, 'تم الرفع بنجاح')
    const row = await one<{ file_path: string; file_type: string }>('SELECT file_path, file_type FROM medical_attachments WHERE business_id=$1', [s.businessId])
    expect(row.file_type).toBe('xray')
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='medical-files' AND name=$1`, [row.file_path])).n).toBe(1)
    await expect(page.locator('img[alt="xray.png"]')).toHaveCount(1)
    await page.locator('.group button').first().click({ force: true })
    await page.getByRole('button', { name: 'حذف', exact: true }).click()
    await expectToast(page, 'تم الحذف')
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='medical-files'  AND name=$1`, [row.file_path])).n).toBe(0)
  })

  test('another clinic cannot see this patient\'s record', async ({ page }) => {
    const a = await seedBusiness()
    const b = await seedBusiness()
    const { client_phone: tel } = await seedAppointment(a)
    await sql(`INSERT INTO patient_records (business_id, client_phone, client_name, blood_type) VALUES ($1,$2,'سري','AB-')`, [a.businessId, tel])
    await login(page, b)
    await page.goto(`/patients/${tel}`)
    await expect(page.getByText('المعلومات الشخصية')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByText('سري')).toHaveCount(0)
    await expect(page.locator('button.border-red-400')).toHaveCount(0)
  })
})

test.describe('client record (salon)', () => {
  test('shows the simple tabs only and saves notes', async ({ page }) => {
    const s = await seedBusiness({ type: 'salon' })
    const { client_phone: tel } = await seedAppointment(s)
    await login(page, s)
    await page.goto(`/patients/${tel}`)
    await expect(page.getByRole('button', { name: 'الروشتات' })).toHaveCount(0)
    await page.getByPlaceholder('اكتب ملاحظة عن العميل...').fill('زبونة دايمة')
    await page.getByRole('button', { name: 'خطة الزيارات' }).click()
    await expect.poll(async () =>
      (await one<{ notes: string }>('SELECT notes FROM patient_records WHERE business_id=$1', [s.businessId]))?.notes,
    ).toBe('زبونة دايمة')
  })
})
