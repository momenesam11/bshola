// Fake but realistic data for trying the app locally: a clinic with two branches,
// a salon with several chairs, and an account whose trial ran out. Dates are
// relative to today, so there is always a "today", a "tomorrow" and a history.
// Every name and number here is invented.

export const SEED_PASSWORD = 'Local12345'
export const SEED_ACCOUNTS = [
  { email: 'clinic@local.test', label: 'عيادة أسنان بفرعين' },
  { email: 'salon@local.test', label: 'صالون بـ3 كراسي' },
  { email: 'expired@local.test', label: 'حساب تجربته خلصت' },
]

const NAMES = ['محمد سامي', 'منى عادل', 'أحمد فتحي', 'سارة حسن', 'يوسف نبيل', 'هبة مجدي', 'كريم طارق', 'نورا إبراهيم',
  'عمر خالد', 'دينا رأفت', 'مصطفى جمال', 'ريم وليد', 'حسام علي', 'ياسمين شريف', 'طارق منصور', 'إيمان سعيد']
const phoneOf = (i) => `2010000${String(1000 + i).padStart(5, '0')}`

const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d)
}
const week = (blocks, closed = []) =>
  Object.fromEntries(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].map(d => [d, closed.includes(d) ? [] : blocks]))

async function insert(db, table, row) {
  const keys = Object.keys(row)
  // text[] columns take a plain list; jsonb columns (schedules, prescriptions) take JSON.
  const isTextList = (v) => Array.isArray(v) && v.every(x => typeof x === 'string')
  const values = Object.values(row).map(v => (v && typeof v === 'object' && !isTextList(v) ? JSON.stringify(v) : v))
  const { rows } = await db.query(
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, values)
  return rows[0]
}

async function business(db, createUser, { email, fields, branches, services }) {
  const user = await createUser({ email, password: SEED_PASSWORD, data: { owner_phone: '201000000999' } })
  const biz = await insert(db, 'businesses', {
    owner_id: user.id, phone: '01000000999', owner_phone: '201000000999', slot_duration: 30, is_active: true,
    trial_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(), ...fields,
  })
  // Onboarding may already have made a main branch through a trigger.
  await db.query('DELETE FROM branches WHERE business_id = $1', [biz.id])
  const branchRows = []
  for (const b of branches) branchRows.push(await insert(db, 'branches', { business_id: biz.id, ...b }))
  const serviceRows = []
  for (const s of services) serviceRows.push(await insert(db, 'services', { business_id: biz.id, ...s }))
  return { user, biz, branches: branchRows, services: serviceRows }
}

// Spreads visits from 60 days ago to two weeks ahead, one per slot, so the
// double-booking guard is never tripped by the seed itself.
async function appointments(db, { biz, branches, services }, count, startHour) {
  const rows = []
  for (let i = 0; i < count; i++) {
    const offset = Math.round(-60 + (i * 74) / count)
    const client = i % NAMES.length
    const status = offset < 0 ? ['completed', 'completed', 'completed', 'no_show', 'cancelled'][i % 5] : 'confirmed'
    const service = services[i % services.length]
    const hour = startHour + (i % 8)
    rows.push(await insert(db, 'appointments', {
      business_id: biz.id, branch_id: branches[i % branches.length].id, service_id: service.id,
      client_name: NAMES[client], client_phone: phoneOf(client),
      appointment_date: day(offset), appointment_time: `${String(hour).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      status, price: service.price, payment_status: status === 'completed' ? (i % 3 ? 'paid' : 'partial') : 'unpaid',
      amount_paid: status === 'completed' && i % 3 === 0 ? Math.round(service.price / 2) : 0,
      reminder_sent: offset < 0,
    }))
  }
  // Today and tomorrow always have something, whatever the date.
  for (const [offset, time, client] of [[0, '18:00', 1], [0, '19:00', 2], [1, '17:00', 3], [1, '18:30', 4]]) {
    rows.push(await insert(db, 'appointments', {
      business_id: biz.id, branch_id: branches[0].id, service_id: services[0].id,
      client_name: NAMES[client], client_phone: phoneOf(client), appointment_date: day(offset),
      appointment_time: time, status: 'confirmed', price: services[0].price,
    }))
  }
  return rows
}

export async function seedDemoData(db, createUser) {
  const clinic = await business(db, createUser, {
    email: 'clinic@local.test',
    fields: {
      name: 'عيادة د. سارة لطب الأسنان (تجريبية)', type: 'clinic', booking_slug: 'demo-clinic',
      specialty: 'تجميل وزراعة أسنان', bio: 'بيانات وهمية للتجربة المحلية فقط.', years_experience: 12,
      public_phone: '01000000999', reminder_template: null, brand_color: '#0F9D82',
      google_review_url: 'https://g.page/r/demo-clinic-review',
    },
    branches: [
      { name: 'فرع المعادي', is_main: true, capacity: 1, address: 'شارع 9، المعادي', schedule_blocks: week([{ start: '10:00', end: '14:00' }, { start: '16:00', end: '22:00' }], ['fri']) },
      { name: 'فرع مدينة نصر', is_main: false, capacity: 1, address: 'عباس العقاد', schedule_blocks: week([{ start: '12:00', end: '20:00' }], ['fri', 'sat']) },
    ],
    services: [
      { name: 'كشف', duration_minutes: 30, price: 300 },
      { name: 'تنظيف أسنان', duration_minutes: 45, price: 600 },
      { name: 'حشو عصب', duration_minutes: 60, price: 1500 },
      { name: 'متابعة', duration_minutes: 15, price: 0 },
    ],
  })
  const clinicAppts = await appointments(db, clinic, 60, 10)

  // A treatment plan half way through, a patient file, a statement.
  const planPhone = phoneOf(0)
  const plan = await insert(db, 'client_plans', { business_id: clinic.biz.id, client_phone: planPhone, name: 'كورس علاج عصب', total_visits: 4 })
  for (let v = 1; v <= 4; v++) await insert(db, 'client_plan_visits', { plan_id: plan.id, visit_number: v, suggested_date: day(v * 7) })
  await insert(db, 'patient_records', {
    business_id: clinic.biz.id, client_phone: planPhone, client_name: NAMES[0], gender: 'male', blood_type: 'O+',
    allergies: ['بنسلين'], chronic_conditions: ['سكر'], current_medications: ['ميتفورمين'], date_of_birth: '1988-04-12',
  })
  const past = clinicAppts.find(a => a.client_phone === planPhone && a.status === 'completed')
  if (past) {
    await insert(db, 'diagnoses', { business_id: clinic.biz.id, client_phone: planPhone, appointment_id: past.id, diagnosis: 'تسوس في الضرس الأول', treatment: 'حشو عصب على 4 جلسات', follow_up_date: day(7) })
    await insert(db, 'prescriptions', { business_id: clinic.biz.id, client_phone: planPhone, appointment_id: past.id, medications: [{ drug: 'أموكسيسيلين', dose: '500 مجم', freq: '3 مرات يومياً', duration: '5 أيام', notes: '' }], instructions: 'بعد الأكل' })
  }
  await insert(db, 'client_ledger_entries', { business_id: clinic.biz.id, client_phone: planPhone, entry_type: 'charge', amount: 6000, description: 'كورس علاج عصب' })
  await insert(db, 'client_ledger_entries', { business_id: clinic.biz.id, client_phone: planPhone, entry_type: 'payment', amount: 2000, payment_method: 'cash', description: 'دفعة أولى' })
  await insert(db, 'subscription_payments', { business_id: clinic.biz.id, days: 35, amount: 350, method: 'فودافون كاش' })
  // A trigger already made the client row from their bookings.
  await db.query(`INSERT INTO clients (business_id, phone, name, notes) VALUES ($1,$2,$3,$4)
    ON CONFLICT (business_id, phone) DO UPDATE SET notes = EXCLUDED.notes`,
  [clinic.biz.id, planPhone, NAMES[0], 'بيفضل المواعيد المسائية'])
  // A waitlisted visitor for a full day next week.
  await insert(db, 'appointments', {
    business_id: clinic.biz.id, branch_id: clinic.branches[0].id, service_id: clinic.services[0].id,
    client_name: 'منتظر الدور', client_phone: phoneOf(40), appointment_date: day(6), appointment_time: '00:00', status: 'waitlist',
  })

  const salon = await business(db, createUser, {
    email: 'salon@local.test',
    fields: { name: 'صالون لمسة (تجريبي)', type: 'salon', booking_slug: 'demo-salon', specialty: 'شعر ومكياج' },
    branches: [{ name: 'الفرع الرئيسي', is_main: true, capacity: 3, schedule_blocks: week([{ start: '11:00', end: '23:00' }]) }],
    services: [
      { name: 'قص شعر', duration_minutes: 30, price: 150 },
      { name: 'صبغة', duration_minutes: 90, price: 700 },
      { name: 'مكياج عروسة', duration_minutes: 120, price: 2500 },
    ],
  })
  await appointments(db, salon, 40, 11)

  // A clinic that asked from Settings to delete its account, waiting in /admin.
  const leaving = await business(db, createUser, {
    email: 'leaving@local.test',
    fields: { name: 'عيادة طالبة حذف الحساب (تجريبية)', type: 'clinic', booking_slug: 'demo-leaving', owner_phone: '201000000777' },
    branches: [{ name: 'الفرع الرئيسي', is_main: true, capacity: 1, schedule_blocks: week([{ start: '10:00', end: '18:00' }]) }],
    services: [{ name: 'كشف', duration_minutes: 30, price: 200 }],
  })
  await insert(db, 'account_deletion_requests', { business_id: leaving.biz.id, business_name: 'عيادة طالبة حذف الحساب (تجريبية)', reason: 'قفلت العيادة' })

  // A clinic that signed up three weeks ago and stopped booking 12 days ago:
  // /admin lists it under "عيادات نايمة".
  const sleepy = await business(db, createUser, {
    email: 'sleepy@local.test',
    fields: {
      name: 'عيادة بطلت تحجز (تجريبية)', type: 'clinic', booking_slug: 'demo-sleepy', owner_phone: '201000000666',
      created_at: new Date(Date.now() - 21 * 86400000).toISOString(),
    },
    branches: [{ name: 'الفرع الرئيسي', is_main: true, capacity: 1, schedule_blocks: week([{ start: '10:00', end: '18:00' }]) }],
    services: [{ name: 'كشف', duration_minutes: 30, price: 250 }],
  })
  for (const [offset, time] of [[-14, '10:00'], [-12, '11:00']]) {
    await insert(db, 'appointments', {
      business_id: sleepy.biz.id, branch_id: sleepy.branches[0].id, service_id: sleepy.services[0].id,
      client_name: NAMES[5], client_phone: phoneOf(5), appointment_date: day(offset), appointment_time: time,
      status: 'completed', price: 250, reminder_sent: true, created_at: new Date(Date.now() + offset * 86400000).toISOString(),
    })
  }

  await business(db, createUser, {
    email: 'expired@local.test',
    fields: { name: 'عيادة تجربتها خلصت (تجريبية)', type: 'clinic', booking_slug: 'demo-expired', trial_ends_at: new Date(Date.now() - 2 * 86400000).toISOString() },
    branches: [{ name: 'الفرع الرئيسي', is_main: true, capacity: 1, schedule_blocks: week([{ start: '10:00', end: '18:00' }]) }],
    services: [{ name: 'كشف', duration_minutes: 30, price: 250 }],
  })

  await db.query(`INSERT INTO growth_leads (name, category, city, phone, source, stage, is_test)
    VALUES ('عيادة النور (عميل محتمل وهمي)', 'dental', 'القاهرة', '201000000555', 'manual', 'new', true)`).catch(() => {})
}
