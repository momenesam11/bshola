import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, sql } from './helpers'

// /m/<code>: the patient's own appointments, place in today's queue, and
// cancelling with the last 3 digits of their number (migrations 054, 056).

const codeOf = async (id: string) => (await one<{ c: string }>('SELECT manage_code c FROM appointments WHERE id=$1', [id])).c

async function cancelWith(page: import('@playwright/test').Page, tail: string) {
  await page.getByLabel('للتأكيد، اكتب آخر 3 أرقام من موبايلك').fill(tail)
  await page.getByRole('button', { name: 'أيوه، الغيه' }).click()
}

test.describe('patient appointments page', () => {
  test('lists this patient\'s appointments only, and cancels after the phone check', async ({ page, problems }) => {
    const s = await seedBusiness({ fields: { cancellation_policy: 'الإلغاء مجاني قبل 24 ساعة', public_phone: '01000000123' } })
    const soon = await seedAppointment(s, { client_name: 'منى', appointment_date: isoDate(0), appointment_time: '23:30', notes: 'ملاحظة سرية' })
    const later = await seedAppointment(s, { client_name: 'منى', client_phone: soon.client_phone, appointment_date: isoDate(5) })
    await seedAppointment(s, { client_name: 'منى', client_phone: soon.client_phone, appointment_date: isoDate(-7), status: 'completed' })
    await seedAppointment(s, { client_name: 'حد تاني', appointment_date: isoDate(5), appointment_time: '12:00' })
    await seedAppointment(s, { client_name: 'منتظر', appointment_date: isoDate(5), appointment_time: '00:00', status: 'waitlist' })

    const code = await codeOf(soon.id)
    expect(code).toMatch(/^[A-Za-z2-9]{12}$/)
    await page.goto(`/m/${code}`)
    await expect(page.getByRole('heading', { name: s.name })).toBeVisible()
    const upcoming = page.getByTestId('upcoming')
    await expect(upcoming).toHaveCount(2)
    await expect(page.getByTestId('past')).toHaveCount(1)
    await expect(page.getByText('حد تاني')).toHaveCount(0)
    await expect(page.getByText('ملاحظة سرية')).toHaveCount(0)

    // Today, within 24 hours: the policy says call the clinic.
    await expect(upcoming.first()).toContainText('سياسة الإلغاء: الإلغاء مجاني قبل 24 ساعة')
    await expect(upcoming.first().getByRole('button', { name: 'إلغاء الميعاد' })).toHaveCount(0)

    await upcoming.nth(1).getByRole('button', { name: 'إلغاء الميعاد' }).click()
    await cancelWith(page, '000')
    await expect(page.getByTestId('cancel-error')).toContainText('مش آخر 3 أرقام')
    expect((await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [later.id])).s).toBe('confirmed')

    await cancelWith(page, soon.client_phone.slice(-3))
    await expect(page.getByTestId('cancelled-note')).toContainText('اتلغى الميعاد')
    await expect(page.getByRole('link', { name: 'عايز ميعاد تاني؟ احجز من هنا' })).toHaveAttribute('href', `/book/${s.slug}`)
    await expect(page.getByTestId('upcoming')).toHaveCount(1)
    expect((await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [later.id])).s).toBe('cancelled')
    const note = await one<{ body: string }>(`SELECT body FROM notifications WHERE related_appointment_id=$1 AND type='cancellation'`, [later.id])
    expect(note.body).toContain('لغى ميعاده بنفسه من لينك المواعيد، وفي 1 في قايمة الانتظار')
    expect(problems).toEqual([])
  })

  test('a patient booked today sees how many are ahead', async ({ page }) => {
    const s = await seedBusiness()
    await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '01:00' })
    await seedAppointment(s, { appointment_date: isoDate(0), appointment_time: '01:30' })
    const mine = await seedAppointment(s, { client_name: 'سامي', appointment_date: isoDate(0), appointment_time: '23:45' })
    await page.goto(`/m/${await codeOf(mine.id)}`)
    await expect(page.getByTestId('ahead')).toContainText('قدامك اتنين')
  })

  test('a wrong or expired link says so', async ({ page }) => {
    const s = await seedBusiness()
    const old = await seedAppointment(s, { appointment_date: isoDate(-9), status: 'completed' })
    await page.goto(`/m/${await codeOf(old.id)}`)
    await expect(page.getByText('اللينك ده انتهى')).toBeVisible()
    await page.goto('/m/nothingHere1')
    await expect(page.getByText('اللينك ده مش شغال')).toBeVisible()
  })

  test('the reminder carries the short link, and the clinic can hand the freed slot to the waitlist', async ({ page }) => {
    const s = await seedBusiness()
    const appt = await seedAppointment(s, { client_name: 'سامي', appointment_date: isoDate(1), appointment_time: '15:00' })
    const waiting = await seedAppointment(s, { client_name: 'المنتظر', appointment_date: isoDate(1), appointment_time: '00:00', status: 'waitlist' })
    await page.addInitScript(() => {
      (window as unknown as { __urls: string[] }).__urls = []
      window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
    })
    await login(page, s)
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'تذكير', exact: true }).click()
    const url = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls[0])
    const code = await codeOf(appt.id)
    expect(decodeURIComponent(url.split('text=')[1])).toContain(`/m/${code}`)

    const patient = await page.context().newPage()
    await patient.goto(`/m/${code}`)
    await patient.getByRole('button', { name: 'إلغاء الميعاد' }).click()
    await cancelWith(patient, appt.client_phone.slice(-3))
    await expect(patient.getByTestId('cancelled-note')).toBeVisible()
    await patient.close()

    await page.reload()
    await page.getByRole('button', { name: /الإشعارات|إشعارات/ }).first().click()
    await page.getByText('لغى ميعاده بنفسه').first().click()
    await page.getByRole('button', { name: /أبلّغ المنتظر/ }).click()
    await expect.poll(async () => (await one<{ s: string; t: string }>('SELECT status s, appointment_time::text t FROM appointments WHERE id=$1', [waiting.id])))
      .toEqual({ s: 'confirmed', t: '15:00:00' })
  })

  test('codes are unique and survive edits by the clinic', async ({ page }) => {
    const s = await seedBusiness()
    const a = await seedAppointment(s, { appointment_date: isoDate(3) })
    const before = await codeOf(a.id)
    await login(page, s)
    await page.goto('/appointments')
    await page.getByRole('button', { name: 'تعديل' }).first().click()
    await page.locator('form').getByRole('button', { name: 'مكتمل' }).click()
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect.poll(async () => (await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [a.id])).s).toBe('completed')
    expect(await codeOf(a.id)).toBe(before)
    expect(await sql('SELECT manage_code FROM appointments GROUP BY manage_code HAVING count(*) > 1')).toEqual([])
  })
})

test.describe('sending the patient their link', () => {
  test('from the appointment and from today\'s queue, for a patient who booked by phone', async ({ page }) => {
    const s = await seedBusiness()
    const a = await seedAppointment(s, { client_name: 'حجز بالتليفون', appointment_date: isoDate(0), appointment_time: '23:15' })
    await page.addInitScript(() => {
      (window as unknown as { __urls: string[] }).__urls = []
      window.open = (u?: string | URL) => { (window as unknown as { __urls: string[] }).__urls.push(String(u)); return window }
    })
    await login(page, s)
    await page.goto('/dashboard')
    const code = await codeOf(a.id)
    const last = async () => {
      const urls = await page.evaluate(() => (window as unknown as { __urls: string[] }).__urls)
      return decodeURIComponent(urls[urls.length - 1].split('text=')[1])
    }

    await page.getByTestId('today-queue').getByRole('button', { name: 'ابعتله لينك مواعيده' }).click()
    expect(await last()).toContain(`/m/${code}`)

    await page.getByTestId('today-queue').getByRole('button', { name: 'حجز بالتليفون' }).click()
    await page.locator('form').getByRole('button', { name: 'ابعتله لينك مواعيده' }).click()
    const text = await last()
    expect(text).toContain('أهلاً يا حجز بالتليفون')
    expect(text).toContain(`/m/${code}`)
  })
})
