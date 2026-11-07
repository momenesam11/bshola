import { writeFileSync, mkdirSync } from 'node:fs'
import { test, expect, seedBusiness, seedAppointment, login, one, sql, apiLog, failedCalls, ADMIN_PASSWORD, API, type Problem } from './helpers'
import type { Page } from '@playwright/test'

// Presses every button on every screen, and every button that press revealed.
// For each press it records whether anything happened at all (a "dead" button),
// and any crash, console error or failed API call it caused. The scenarios in the
// other spec files check that buttons do the *right* thing; this one guarantees
// no screen or button was forgotten.

const MAX_PER_SCREEN = 120

type Press = {
  screen: string
  path: string[]
  label: string
  outcome: 'ok' | 'dead' | 'broken'
  detail?: string
}
const results: Press[] = []

const BUTTONS = 'button:visible, [role="button"]:visible, a[href*="wa.me"]:visible'

async function listButtons(page: Page) {
  return page.locator(BUTTONS).evaluateAll((els) => {
    const seen: Record<string, number> = {}
    return els.map((el) => {
      const h = el as HTMLElement
      const text = (h.innerText || h.getAttribute('aria-label') || h.title || '').trim().replace(/\s+/g, ' ').slice(0, 40)
      const key = text || `icon:${(h.querySelector('path')?.getAttribute('d') || h.className).slice(0, 24)}`
      seen[key] = (seen[key] || 0) + 1
      return { key: `${key}#${seen[key]}`, label: text || '(أيقونة)', disabled: (h as HTMLButtonElement).disabled }
    })
  })
}

// Lazy pages fetch after load; give them a moment rather than networkidle, which
// the Realtime reconnect loop can hold open.
const settle = (page: Page) => page.waitForTimeout(450)

async function clickByKey(page: Page, key: string) {
  const list = await listButtons(page)
  const index = list.findIndex(b => b.key === key)
  if (index < 0) return false
  await page.locator(BUTTONS).nth(index).click({ timeout: 4000, force: false })
  return true
}

async function fingerprint(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __actions?: string[] }
    // A hash of the whole page, not its length: picking a colour or opening an
    // accordion changes classes without changing how long the HTML is.
    const html = document.body.innerHTML
    let h = 0
    for (let i = 0; i < html.length; i++) h = (h * 31 + html.charCodeAt(i)) | 0
    return `${location.href}|${h}|${(w.__actions || []).length}`
  })
}

async function prepare(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __actions: string[] }
    w.__actions = []
    window.open = ((url?: string) => { w.__actions.push(`open:${url}`); return window }) as typeof window.open
    window.print = () => { w.__actions.push('print') }
    const anchorClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download) { w.__actions.push(`download:${this.download}`); return }
      anchorClick.call(this)
    }
    const input = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      if (this.type === 'file') { w.__actions.push('filepicker'); return }
      input.call(this)
    }
    HTMLInputElement.prototype.showPicker = function () { w.__actions.push('showPicker') }
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (t: string) => { w.__actions.push(`copy:${t}`) } },
    })
    Object.defineProperty(navigator, 'share', { value: undefined })
    // WhatsApp links are plain <a href> as often as window.open; record them too.
    document.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href*="wa.me"]') as HTMLAnchorElement | null
      if (a) { e.preventDefault(); w.__actions.push(`open:${a.href}`) }
    }, true)
  })
}

async function crawl(page: Page, screen: string, problems: Problem[], open: () => Promise<void>) {
  const queue: string[][] = [[]]
  const visited = new Set<string>()
  let pressed = 0

  while (queue.length && pressed < MAX_PER_SCREEN) {
    const path = queue.shift()!
    await open()
    await settle(page)
    let replayed = true
    for (const key of path) {
      if (!(await clickByKey(page, key).catch(() => false))) { replayed = false; break }
      await page.waitForTimeout(120)
    }
    if (!replayed) continue

    const buttons = await listButtons(page)
    for (const b of buttons) {
      if (visited.has(b.key) || b.disabled) continue
      visited.add(b.key)
      if (pressed++ >= MAX_PER_SCREEN) break

      await open()
      await settle(page)
      let ok = true
      for (const key of path) {
        if (!(await clickByKey(page, key).catch(() => false))) { ok = false; break }
        await page.waitForTimeout(120)
      }
      if (!ok) continue
      await apiLog(true)
      problems.length = 0
      const before = await fingerprint(page)
      let clicked = false
      let clickError = ''
      try { clicked = await clickByKey(page, b.key) } catch (e) { clickError = String(e).split('\n')[0] }
      if (!clicked) {
        if (clickError) results.push({ screen, path, label: b.label, outcome: 'broken', detail: `could not click: ${clickError}` })
        continue
      }
      await page.waitForTimeout(350)
      const after = await fingerprint(page).catch(() => 'navigated')
      const failed = failedCalls(await apiLog()).filter(e => !e.path.includes('/realtime/'))
      // Every WhatsApp link a press opened: a real number and a real message.
      const opened = await page.evaluate(() => ((window as unknown as { __actions?: string[] }).__actions || [])
        .filter(a => a.startsWith('open:'))).catch(() => [] as string[])
      const badWhatsApp = opened.map(a => a.slice(5)).filter(u => u.includes('wa.me')).filter(u => {
        const m = u.match(/wa\.me\/(\d*)(?:\?text=(.*))?$/)
        const text = m?.[2] ? decodeURIComponent(m[2]) : ''
        // No number is a share link (WhatsApp lets the user pick the chat);
        // then the message is all there is, so it must be there.
        if (!m) return true
        if (m[1] === '') return !text.trim() || /undefined|null|NaN|Invalid Date/.test(text)
        return !/^\d{10,15}$/.test(m[1]) || /undefined|null|NaN|Invalid Date/.test(text)
      })
      const issues = [
        ...badWhatsApp.map(u => `bad WhatsApp link: ${decodeURIComponent(u).slice(0, 200)}`),
        ...problems.map(p => `${p.kind}: ${p.detail}`),
        ...failed.map(f => `API ${f.status} ${f.method} ${f.path.slice(0, 100)}: ${JSON.stringify(f.error)?.slice(0, 200)}`),
      ]
      const blank = await page.evaluate(() => document.body.innerText.trim().length < 5).catch(() => false)
      if (blank) issues.push('blank screen')
      if (issues.length) {
        results.push({ screen, path, label: b.label, outcome: 'broken', detail: issues.join(' | ') })
      } else if (after === before) {
        results.push({ screen, path, label: b.label, outcome: 'dead' })
      } else {
        results.push({ screen, path, label: b.label, outcome: 'ok' })
        // The press changed the screen: whatever it revealed gets pressed too.
        if (path.length < 2 && !path.includes(b.key)) queue.push([...path, b.key])
      }
    }
  }
}

test.setTimeout(600_000)

async function richClinic(type = 'clinic') {
  const s = await seedBusiness({ type })
  const appt = await seedAppointment(s, { price: 200, appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })
  await seedAppointment(s, { client_name: 'عميلة اليوم', appointment_date: new Date().toISOString().slice(0, 10), appointment_time: '11:00' })
  await sql(`INSERT INTO notifications (business_id, appointment_id, type, client_name, client_phone, appointment_date, appointment_time)
             VALUES ($1, $2, 'new_booking', 'عميل تجربة', $3, now()::date, '10:00')`, [s.businessId, appt.id, appt.client_phone]).catch(() => {})
  await sql(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1, 'فرع المعادي', false, 1)`, [s.businessId])
  return { s, appt }
}

test.describe('every button on every screen', () => {
  test.beforeEach(async ({ page }) => { await prepare(page) })

  const ownerScreens: Array<[string, (phone: string) => string, string?]> = [
    ['dashboard', () => '/dashboard'],
    ['appointments', () => '/appointments'],
    ['clients', () => '/crm'],
    ['patient record (clinic)', p => `/patients/${p}`],
    ['patient record (salon)', p => `/patients/${p}`, 'salon'],
    ['reports', () => '/reports'],
    ['settings', () => '/settings'],
    ['branches', () => '/settings/branches'],
  ]
  for (const [name, path, type] of ownerScreens) {
    test(name, async ({ page, problems }) => {
      const { s, appt } = await richClinic(type)
      await login(page, s)
      await crawl(page, name, problems, () => page.goto(path(appt.client_phone)).then(() => {}))
    })
  }

  test('onboarding', async ({ page, problems }) => {
    const res = await fetch(`${API}/__test/user`, { method: 'POST', body: JSON.stringify({ email: `new-${Date.now()}@test.local`, password: 'TestPass123' }) })
    const user = await res.json()
    await login(page, { ownerId: user.id })
    await crawl(page, 'onboarding', problems, () => page.goto('/onboarding').then(() => {}))
  })

  test('booking page', async ({ page, problems }) => {
    const { s } = await richClinic()
    await crawl(page, 'booking page', problems, () => page.goto(`/book/${s.slug}`).then(() => {}))
  })

  for (const [name, path] of [
    ['landing', '/'], ['product', '/product'], ['faq', '/faq'], ['guides', '/guides'],
    ['calculator', '/tools/no-show-calculator'], ['login', '/login'], ['register', '/register'],
    ['forgot password', '/forgot-password'], ['partner login', '/partner'], ['admin gate', '/admin'],
  ] as const) {
    test(`public: ${name}`, async ({ page, problems }) => {
      await crawl(page, name, problems, () => page.goto(path).then(() => {}))
    })
  }

  async function adminLogin(page: Page) {
    await page.goto('/admin')
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
    await page.keyboard.press('Enter')
    await expect(page.getByText('لوحة تحكم بسهولة')).toBeVisible()
  }

  test('admin dashboard', async ({ page, problems }) => {
    await seedBusiness()
    await adminLogin(page)
    await crawl(page, 'admin', problems, () => page.goto('/admin').then(() => {}))
  })

  test('growth dashboard', async ({ page, problems }) => {
    await adminLogin(page)
    await one(`INSERT INTO growth_leads (name, category, city, phone, source, stage) VALUES ('عيادة محتملة', 'clinic', 'القاهرة', '201000000001', 'manual', 'new') RETURNING id`).catch(() => {})
    await crawl(page, 'growth', problems, () => page.goto('/admin/growth').then(() => {}))
  })
})

test.afterAll(() => {
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/crawl-report.json', JSON.stringify(results, null, 1))
  const by = (o: string) => results.filter(r => r.outcome === o).length
  console.log(`\nCRAWL pressed ${results.length} | ok ${by('ok')} | dead ${by('dead')} | broken ${by('broken')}`)
})
