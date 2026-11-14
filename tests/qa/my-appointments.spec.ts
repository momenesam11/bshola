import { test, expect, seedBusiness, seedAppointment, isoDate, login, one, sql } from './helpers'

// /my/<token>: the patient's own appointments and cancelling (migration 054).

const tokenOf = async (id: string) => (await one<{ t: string }>('SELECT manage_token t FROM appointments WHERE id=$1', [id])).t

test.describe('patient appointments page', () => {
  test('lists this patient\'s appointments only and cancels one, telling the clinic', async ({ page, problems }) => {
    const s = await seedBusiness({ fields: { cancellation_policy: 'الإلغاء مجاني قبل 24 ساعة', public_phone: '01000000123' } })
    const soon = await seedAppointment(s, { client_name: 'منى', appointment_date: isoDate(0), appointment_time: '23:30', notes: 'ملاحظة سرية' })
    const later = await seedAppointment(s, { client_name: 'منى', client_phone: soon.client_phone, appointment_date: isoDate(5) })
    await seedAppointment(s, { client_name: 'منى', client_phone: soon.client_phone, appointment_date: isoDate(-7), status: 'completed' })
    await seedAppointment(s, { client_name: 'حد تاني', appointment_date: isoDate(5), appointment_time: '12:00' })
    await seedAppointment(s, { client_name: 'منتظر', appointment_date: isoDate(5), appointment_time: '00:00', status: 'waitlist' })

    await page.goto(`/my/${await tokenOf(soon.id)}`)
    await expect(page.getByRole('heading', { name: s.name })).toBeVisible()
    await expect(page.getByText('أهلاً يا منى')).toBeVisible()
    const upcoming = page.getByTestId('upcoming')
    await expect(upcoming).toHaveCount(2)
    await expect(page.getByTestId('past')).toHaveCount(1)
    await expect(page.getByText('حد تاني')).toHaveCount(0)
    await expect(page.getByText('ملاحظة سرية')).toHaveCount(0)

    // Today, within 24 hours: the policy says call the clinic.
    await expect(upcoming.first()).toContainText('سياسة الإلغاء: الإلغاء مجاني قبل 24 ساعة')
    await expect(upcoming.first().getByRole('button', { name: 'إلغاء الميعاد' })).toHaveCount(0)

    await upcoming.nth(1).getByRole('button', { name: 'إلغاء الميعاد' }).click()
    await page.getByRole('button', { name: 'أيوه، الغيه' }).click()
    await expect(page.getByTestId('cancelled-note')).toContainText('اتلغى الميعاد')
    await expect(page.getByRole('link', { name: 'عايز ميعاد تاني؟ احجز من هنا' })).toHaveAttribute('href', `/book/${s.slug}`)
    await expect(page.getByTestId('upcoming')).toHaveCount(1)
    expect((await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [later.id])).s).toBe('cancelled')
    const note = await one<{ body: string }>(`SELECT body FROM notifications WHERE related_appointment_id=$1 AND type='cancellation'`, [later.id])
    expect(note.body).toContain('لغى ميعاده بنفسه من لينك المواعيد، وفي 1 في قايمة الانتظار')
    expect(problems).toEqual([])
  })

  test('a wrong link says so', async ({ page }) => {
    await page.goto('/my/00000000-0000-4000-8000-000000000000')
    await expect(page.getByText('اللينك ده مش شغال')).toBeVisible()
    await page.goto('/my/not-a-token')
    await expect(page.getByText('اللينك ده مش شغال')).toBeVisible()
  })

  test('the reminder carries the link, and the clinic can hand the freed slot to the waitlist', async ({ page }) => {
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
    const text = decodeURIComponent(url.split('text=')[1])
    const token = await tokenOf(appt.id)
    expect(text).toContain(`/my/${token}`)

    // The patient cancels from the link.
    const patient = await page.context().newPage()
    await patient.goto(`/my/${token}`)
    await patient.getByRole('button', { name: 'إلغاء الميعاد' }).click()
    await patient.getByRole('button', { name: 'أيوه، الغيه' }).click()
    await expect(patient.getByTestId('cancelled-note')).toBeVisible()
    await patient.close()

    // The clinic opens the notification and gives the slot to the first waiting.
    await page.reload()
    await page.getByRole('button', { name: /الإشعارات|إشعارات/ }).first().click()
    await page.getByText('لغى ميعاده بنفسه').first().click()
    await page.getByRole('button', { name: /أبلّغ المنتظر/ }).click()
    await expect.poll(async () => (await one<{ s: string; t: string }>('SELECT status s, appointment_time::text t FROM appointments WHERE id=$1', [waiting.id])))
      .toEqual({ s: 'confirmed', t: '15:00:00' })
  })

  test('tokens are unique and survive edits by the clinic', async ({ page }) => {
    const s = await seedBusiness()
    const a = await seedAppointment(s, { appointment_date: isoDate(3) })
    const before = await tokenOf(a.id)
    await login(page, s)
    await page.goto('/appointments')
    await page.getByRole('button', { name: 'تعديل' }).first().click()
    await page.locator('form').getByRole('button', { name: 'مكتمل' }).click()
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect.poll(async () => (await one<{ s: string }>('SELECT status s FROM appointments WHERE id=$1', [a.id])).s).toBe('completed')
    expect(await tokenOf(a.id)).toBe(before)
    const dupes = await sql<{ n: number }>('SELECT count(*)::int n FROM appointments GROUP BY manage_token HAVING count(*) > 1')
    expect(dupes).toEqual([])
  })
})
