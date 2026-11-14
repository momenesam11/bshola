import { test as base, expect, type Page, type Route } from '@playwright/test'

// Set by playwright.local.config.ts for the slot being run (QA_SLOT).
export const API = `http://127.0.0.1:${process.env.QA_API_PORT || 54399}`
export const ADMIN_PASSWORD = 'local-admin-password'
const PASSWORD = 'TestPass123'

// ── direct database access (the throwaway local one) ────────────────────────
export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const res = await fetch(`${API}/__test/sql`, { method: 'POST', body: JSON.stringify({ sql: query, params }) })
  const body = await res.json()
  if (!res.ok) throw new Error(`SQL failed: ${JSON.stringify(body)}\n${query}`)
  return body
}
export const one = async <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
  (await sql<T>(query, params))[0]

export const isoDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d)
}

let counter = 0
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

// Different phone per call so per-number booking limits never collide.
export const phone = () => `2010${String(Date.now() + counter++).slice(-8)}`

const OPEN_ALL_DAY = [{ start: '00:00', end: '23:30' }]
export const FULL_WEEK = Object.fromEntries(
  ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].map(d => [d, OPEN_ALL_DAY]),
)

export interface Seed {
  ownerId: string
  email: string
  password: string
  businessId: string
  slug: string
  name: string
  branchId: string
  serviceId: string
  serviceName: string
}

export async function seedBusiness(opts: {
  type?: string
  fields?: Record<string, unknown>
  capacity?: number
  noService?: boolean
} = {}): Promise<Seed> {
  const id = uniq()
  const email = `owner-${id}@test.local`
  const res = await fetch(`${API}/__test/user`, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const user = await res.json()
  const name = `عيادة تجربة ${id}`
  const fields = {
    owner_id: user.id,
    name,
    type: opts.type || 'clinic',
    phone: '01000000000',
    booking_slug: `t-${id}`,
    slot_duration: 30,
    is_active: true,
    trial_ends_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    ...opts.fields,
  }
  const keys = Object.keys(fields)
  const business = await one<{ id: string }>(
    `INSERT INTO businesses (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    Object.values(fields),
  )
  const existing = await one<{ id: string }>('SELECT id FROM branches WHERE business_id = $1 LIMIT 1', [business.id])
  const branch = existing
    ? await one<{ id: string }>(
      `UPDATE branches SET capacity = $2, schedule_blocks = $3::jsonb, is_main = true WHERE id = $1 RETURNING id`,
      [existing.id, opts.capacity ?? 1, JSON.stringify(FULL_WEEK)])
    : await one<{ id: string }>(
      `INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks)
       VALUES ($1, 'الفرع الرئيسي', true, $2, $3::jsonb) RETURNING id`,
      [business.id, opts.capacity ?? 1, JSON.stringify(FULL_WEEK)])
  const serviceName = 'كشف عام'
  const service = opts.noService ? { id: '' } : await one<{ id: string }>(
    `INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1, $2, 30, 200) RETURNING id`,
    [business.id, serviceName])
  return {
    ownerId: user.id, email, password: PASSWORD, businessId: business.id, slug: String(fields.booking_slug),
    name, branchId: branch.id, serviceId: service.id, serviceName,
  }
}

export async function seedAppointment(s: Seed, fields: Record<string, unknown> = {}) {
  const row = {
    business_id: s.businessId,
    branch_id: s.branchId,
    service_id: s.serviceId,
    client_name: 'عميل تجربة',
    client_phone: phone(),
    appointment_date: isoDate(1),
    appointment_time: '10:00',
    status: 'confirmed',
    ...fields,
  }
  const keys = Object.keys(row)
  return one<{ id: string; client_phone: string; client_name: string }>(
    `INSERT INTO appointments (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    Object.values(row),
  )
}

// ── browser helpers ──────────────────────────────────────────────────────────
export async function login(page: Page, s: Pick<Seed, 'ownerId'>) {
  const res = await fetch(`${API}/__test/session`, { method: 'POST', body: JSON.stringify({ id: s.ownerId }) })
  const session = await res.json()
  await page.addInitScript((value) => {
    localStorage.setItem('sb-127-auth-token', value)
  }, JSON.stringify(session))
}

/** Sets the nth time field on the page through the app's own picker. `time` is 'HH:mm'. */
export async function pickTime(page: Page, index: number, time: string) {
  const [h, m] = time.split(':').map(Number)
  await page.locator('button[aria-haspopup="dialog"]').nth(index).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('group', { name: 'الساعة' }).getByRole('button', { name: String(h % 12 || 12), exact: true }).click()
  await dialog.getByRole('group', { name: 'الدقيقة' }).getByRole('button', { name: String(m).padStart(2, '0'), exact: true }).click()
  await dialog.getByRole('button', { name: h < 12 ? 'صباحًا' : 'مساءً' }).click()
  await dialog.getByRole('button', { name: 'تم', exact: true }).click()
}

export async function apiLog(clear = false) {
  const res = await fetch(`${API}/__test/log${clear ? '?clear=1' : ''}`)
  return res.json() as Promise<Array<{ method: string; path: string; status: number; error?: unknown }>>
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('[role="status"]').filter({ hasText: text }).first()).toBeVisible()
}

export type Problem = { kind: string; detail: string }

// Known noise that isn't the app failing: no Realtime server locally, and the
// analytics/font scripts that are blocked on purpose.
const IGNORED = [
  /realtime/i, /websocket/i, /_vercel\/insights/, /net::ERR_FAILED/, /net::ERR_BLOCKED/,
  /fonts\.g/, /Failed to load resource: the server responded with a status of (4|5)\d\d/,
  /Download the React DevTools/, /\[vite\]/, /ERR_ABORTED/, /Failed to load resource: net::/,
]

// Every test gets: blocked internet (so nothing can reach the live site), and a
// record of crashes, console errors and failed API calls it can assert on.
export const test = base.extend<{ problems: Problem[]; opened: string[] }>({
  opened: async ({ context }, use) => {
    const opened: string[] = []
    context.on('page', (p) => { opened.push(p.url()) })
    await use(opened)
  },
  problems: async ({ page, context }, use) => {
    const problems: Problem[] = []
    await context.route(/.*/, (route: Route) => {
      const url = new URL(route.request().url())
      if (['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol === 'data:' || url.protocol === 'blob:') {
        return route.continue()
      }
      if (/supabase\.co/.test(url.hostname)) problems.push({ kind: 'LEFT THE MACHINE', detail: url.href })
      return route.abort('blockedbyclient')
    })
    page.on('pageerror', (e) => problems.push({ kind: 'crash', detail: e.message }))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const text = m.text()
      if (!IGNORED.some(r => r.test(text))) problems.push({ kind: 'console', detail: text.slice(0, 400) })
    })
    await use(problems)
  },
})

export { expect }

export function failedCalls(log: Awaited<ReturnType<typeof apiLog>>) {
  return log.filter(e => e.status >= 300 && e.status !== 406)
}
