import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Backs the /admin dashboard. Previously the
// password check lived entirely in the React component (a string literal
// shipped in the JS bundle) and the actual writes went straight to Postgres
// as the "anon" role, which only worked because anon was separately granted
// UPDATE on the trial/subscription columns (migration 012). That meant
// ANYONE with the public anon key — which every visitor's browser has,
// password screen or not — could activate/deactivate any business directly
// via the REST API. This function is now the only way to perform those
// writes: the password is checked here against a secret that never reaches
// the client, and all reads/writes use the service-role key (anon's grant
// on businesses was revoked in migration 020).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const SESSION_TTL_HOURS = 8
const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15

async function clientIpHash(req: Request) {
  const ip = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function requireSession(supabase: ReturnType<typeof createClient>, token: string | undefined) {
  if (!token) return false
  const { data } = await supabase
    .from('admin_sessions')
    .select('token')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return !!data
}

// 100 years, the "for life" plan (src/lib/lifetime.js).
const MAX_ACTIVATION_DAYS = 36500

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ success: false, error: 'Invalid request body' }, 400)
  }

  const { action, token } = body as { action?: string; token?: string }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (action === 'login') {
    const password = (body as { password?: string }).password
    const ipHash = await clientIpHash(req)
    const since = new Date(Date.now() - LOCK_MINUTES * 60 * 1000).toISOString()
    const { count, error: countError } = await supabase
      .from('admin_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gt('created_at', since)
    if (countError) return json({ success: false, error: countError.message }, 500)
    if ((count ?? 0) >= MAX_FAILED_LOGINS) {
      return json({ success: false, error: `محاولات كتير. جرّب تاني بعد ${LOCK_MINUTES} دقيقة` }, 429)
    }
    if (!password || password !== Deno.env.get('ADMIN_DASHBOARD_PASSWORD')) {
      await supabase.from('admin_login_attempts').insert({ ip_hash: ipHash })
      return json({ success: false, error: 'كلمة السر غلط' }, 401)
    }
    await supabase.from('admin_login_attempts').delete().lt('created_at', since)
    await supabase.from('admin_login_attempts').delete().eq('ip_hash', ipHash)
    const { data, error } = await supabase
      .from('admin_sessions')
      .insert({ expires_at: new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString() })
      .select('token')
      .single()
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, token: data.token })
  }

  if (!(await requireSession(supabase, token))) {
    return json({ success: false, error: 'الجلسة غير صالحة أو منتهية' }, 401)
  }

  if (action === 'list') {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, type, phone, owner_phone, created_at, trial_started_at, trial_ends_at, is_active, subscription_type, activated_at, currency')
      .order('created_at', { ascending: false })
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, businesses: data ?? [] })
  }

  // Per-clinic usage counts for the "sleeping clinics" alert (migration 050).
  // Counts and dates only, never patient rows.
  if (action === 'activity') {
    const { data, error } = await supabase.rpc('admin_business_activity')
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, activity: data ?? [] })
  }

  // One clinic's last 30 days in numbers, for the renewal summary (migration 052).
  if (action === 'summary') {
    const { id } = body as { id?: string }
    if (!id) return json({ success: false, error: 'بيانات ناقصة' }, 400)
    const { data, error } = await supabase.rpc('admin_business_summary', { p_business_id: id, p_days: 30 })
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, summary: (data ?? [])[0] ?? null })
  }

  if (action === 'activate') {
    const { id, days, amount, method } = body as { id?: string; days?: number; amount?: number | null; method?: string }
    if (!id || !Number.isInteger(days) || days! < 1 || days! > MAX_ACTIVATION_DAYS) {
      return json({ success: false, error: 'مدة الاشتراك مش صحيحة' }, 400)
    }
    const paid = amount === null || amount === undefined ? null : Number(amount)
    if (paid !== null && (!Number.isFinite(paid) || paid < 0)) {
      return json({ success: false, error: 'المبلغ مش صحيح' }, 400)
    }
    const paidBy = typeof method === 'string' ? method.trim().slice(0, 100) || null : null
    const { data, error } = await supabase
      .from('businesses')
      .update({
        subscription_type: 'paid',
        is_active: true,
        trial_ends_at: new Date(Date.now() + days! * 24 * 60 * 60 * 1000).toISOString(),
        activated_at: new Date().toISOString(),
        activated_by: 'owner',
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return json({ success: false, error: error.message }, 500)
    // The subscription is already on at this point, so a failure here is
    // reported on its own instead of failing the activation.
    let paymentSaved = true
    if (paid !== null || paidBy) {
      const { error: paymentError } = await supabase.from('subscription_payments').insert({
        business_id: id, days, amount: paid, method: paidBy, currency: data.currency ?? 'EGP',
      })
      paymentSaved = !paymentError
    }
    return json({ success: true, business: data, paymentSaved })
  }

  if (action === 'payments') {
    const { id } = body as { id?: string }
    if (!id) return json({ success: false, error: 'بيانات ناقصة' }, 400)
    const { data, error } = await supabase
      .from('subscription_payments')
      .select('id, days, amount, currency, method, created_at')
      .eq('business_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, payments: data ?? [] })
  }

  if (action === 'extend') {
    const { id, currentTrialEndsAt, days } = body as { id?: string; currentTrialEndsAt?: string; days?: number }
    if (!id || !days) return json({ success: false, error: 'بيانات ناقصة' }, 400)
    const base = currentTrialEndsAt && new Date(currentTrialEndsAt) > new Date()
      ? new Date(currentTrialEndsAt)
      : new Date()
    const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
    const { data, error } = await supabase
      .from('businesses')
      .update({ trial_ends_at: newEnd.toISOString(), is_active: true })
      .eq('id', id)
      .select()
      .single()
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, business: data })
  }

  if (action === 'deactivate') {
    const { id } = body as { id?: string }
    if (!id) return json({ success: false, error: 'بيانات ناقصة' }, 400)
    const { data, error } = await supabase
      .from('businesses')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single()
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, business: data })
  }

  if (action === 'deletion_requests') {
    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('id, business_id, business_name, reason, requested_at, businesses(phone, owner_phone)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, requests: data ?? [] })
  }

  if (action === 'reject_deletion') {
    const { id } = body as { id?: string }
    if (!id) return json({ success: false, error: 'بيانات ناقصة' }, 400)
    const { data, error } = await supabase
      .from('account_deletion_requests')
      .update({ status: 'rejected', decided_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
    if (error) return json({ success: false, error: error.message }, 500)
    if (!data?.length) return json({ success: false, error: 'الطلب مش موجود أو اتقفل' }, 404)
    return json({ success: true })
  }

  // Permanent. The name has to be typed back, so a wrong id or a stray call
  // can't delete a clinic. Order: list the files while the account still
  // exists, delete the account in one database call (everything under it goes
  // with it), then remove the files and, when it was the owner's only account,
  // the login itself.
  if (action === 'delete_business') {
    const { id, confirmName } = body as { id?: string; confirmName?: string }
    if (!id || typeof confirmName !== 'string') return json({ success: false, error: 'بيانات ناقصة' }, 400)
    const { data: business, error: findError } = await supabase
      .from('businesses').select('id, name').eq('id', id).maybeSingle()
    if (findError) return json({ success: false, error: findError.message }, 500)
    if (!business) return json({ success: false, error: 'الحساب مش موجود' }, 404)
    if (confirmName.trim() !== business.name.trim()) {
      return json({ success: false, error: 'الاسم اللي اتكتب مش مطابق لاسم الحساب' }, 400)
    }

    const { data: files, error: filesError } = await supabase.rpc('admin_business_files', { p_business_id: id })
    if (filesError) return json({ success: false, error: filesError.message }, 500)

    const { data: deleted, error: deleteError } = await supabase.rpc('admin_delete_business', { p_business_id: id })
    if (deleteError) return json({ success: false, error: deleteError.message }, 500)
    const { owner_id: ownerId, other_businesses: others } = (deleted as { owner_id: string; other_businesses: number }[])[0]

    // The account is gone at this point. Anything below that fails is
    // reported so it can be cleaned up by hand, without undoing the deletion.
    const leftovers: string[] = []
    const byBucket = new Map<string, string[]>()
    for (const f of (files ?? []) as { bucket_id: string; name: string }[]) {
      byBucket.set(f.bucket_id, [...(byBucket.get(f.bucket_id) ?? []), f.name])
    }
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += 100) {
        const { error } = await supabase.storage.from(bucket).remove(names.slice(i, i + 100))
        if (error) leftovers.push(`ملفات ${bucket}`)
      }
    }
    if (others === 0) {
      const { error } = await supabase.auth.admin.deleteUser(ownerId)
      if (error) leftovers.push('حساب الدخول (الإيميل)')
    }
    return json({ success: true, filesRemoved: files?.length ?? 0, loginRemoved: others === 0 && !leftovers.includes('حساب الدخول (الإيميل)'), leftovers })
  }

  // ── Clinic setup: the owner fills in a clinic's settings from /admin at the
  // clinic's request. Settings only: nothing here reads appointments,
  // patients or files. Every write is scoped to the business id it was given.

  if (action === 'setup_get') {
    const { id } = body as { id?: string }
    if (!id) return json({ success: false, error: 'بيانات ناقصة' }, 400)
    const { data: business, error } = await supabase
      .from('businesses')
      .select(`id, name, type, phone, country, currency, booking_slug, specialty, bio, years_experience,
        brand_color, logo_url, cover_url, instagram_url, facebook_url, google_reviews_url,
        welcome_message, cancellation_policy`)
      .eq('id', id)
      .maybeSingle()
    if (error) return json({ success: false, error: error.message }, 500)
    if (!business) return json({ success: false, error: 'الحساب مش موجود' }, 404)
    const [services, branches] = await Promise.all([
      supabase.from('services').select('id, name, duration_minutes, price').eq('business_id', id).order('name'),
      supabase.from('branches').select('id, name, address, is_main, capacity, schedule_blocks').eq('business_id', id).order('is_main', { ascending: false }).order('created_at'),
    ])
    if (services.error || branches.error) return json({ success: false, error: (services.error ?? branches.error)!.message }, 500)
    return json({ success: true, business, services: services.data ?? [], branches: branches.data ?? [] })
  }

  if (action === 'setup_business') {
    const { id, fields } = body as { id?: string; fields?: Record<string, unknown> }
    if (!id || !fields || typeof fields !== 'object') return json({ success: false, error: 'بيانات ناقصة' }, 400)
    const text = (v: unknown, max: number) => {
      const s = typeof v === 'string' ? v.trim() : ''
      return s ? s.slice(0, max) : null
    }
    const name = text(fields.name, 100)
    if (!name || name.length < 2) return json({ success: false, error: 'اسم النشاط لازم يكون حرفين على الأقل' }, 400)
    const slug = text(fields.booking_slug, 30)
    if (slug && !/^[a-z0-9-]+$/.test(slug)) return json({ success: false, error: 'رابط الحجز يبقى حروف إنجليزي صغيرة وأرقام وشرطة بس' }, 400)
    const color = text(fields.brand_color, 7)
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return json({ success: false, error: 'اللون مش صحيح' }, 400)
    const years = fields.years_experience === '' || fields.years_experience == null ? null : Number(fields.years_experience)
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 80)) return json({ success: false, error: 'سنين الخبرة مش صحيحة' }, 400)
    const phone = typeof fields.phone === 'string' ? fields.phone.replace(/[^0-9]/g, '').slice(0, 15) || null : null
    const { data, error } = await supabase
      .from('businesses')
      .update({
        name,
        phone,
        booking_slug: slug,
        brand_color: color ?? undefined,
        specialty: text(fields.specialty, 100),
        bio: text(fields.bio, 200),
        years_experience: years,
        instagram_url: text(fields.instagram_url, 300),
        facebook_url: text(fields.facebook_url, 300),
        google_reviews_url: text(fields.google_reviews_url, 300),
        welcome_message: text(fields.welcome_message, 150),
        cancellation_policy: text(fields.cancellation_policy, 100),
      })
      .eq('id', id)
      .select('id')
    if (error) {
      const taken = error.code === '23505' || /booking_slug/.test(error.message)
      return json({ success: false, error: taken ? 'رابط الحجز ده مأخوذ من حساب تاني' : error.message }, taken ? 409 : 500)
    }
    if (!data?.length) return json({ success: false, error: 'الحساب مش موجود' }, 404)
    return json({ success: true })
  }

  if (action === 'setup_services') {
    const { id, services, remove } = body as {
      id?: string
      services?: { id?: string; name?: string; duration_minutes?: number; price?: number | null }[]
      remove?: string[]
    }
    if (!id || !Array.isArray(services) || (remove !== undefined && !Array.isArray(remove))) {
      return json({ success: false, error: 'بيانات ناقصة' }, 400)
    }
    const rows = []
    for (const s of services) {
      const name = typeof s.name === 'string' ? s.name.trim().slice(0, 100) : ''
      const duration = Number(s.duration_minutes)
      const price = s.price === null || s.price === undefined || (s.price as unknown) === '' ? null : Number(s.price)
      if (!name) return json({ success: false, error: 'اسم الخدمة مايبقاش فاضي' }, 400)
      if (!Number.isInteger(duration) || duration < 5 || duration > 480) return json({ success: false, error: `مدة "${name}" مش صحيحة` }, 400)
      if (price !== null && (!Number.isFinite(price) || price < 0)) return json({ success: false, error: `سعر "${name}" مش صحيح` }, 400)
      rows.push({ id: s.id, name, duration_minutes: duration, price })
    }
    if (remove?.length) {
      const { error } = await supabase.from('services').delete().eq('business_id', id).in('id', remove)
      if (error) return json({ success: false, error: error.message }, 500)
    }
    for (const r of rows) {
      const { id: serviceId, ...values } = r
      const { error } = serviceId
        ? await supabase.from('services').update(values).eq('id', serviceId).eq('business_id', id)
        : await supabase.from('services').insert({ ...values, business_id: id })
      if (error) return json({ success: false, error: error.message }, 500)
    }
    return json({ success: true })
  }

  if (action === 'setup_branch') {
    const { id, branchId, name, address, capacity, schedule_blocks: blocks } = body as {
      id?: string; branchId?: string; name?: string; address?: string; capacity?: number; schedule_blocks?: unknown
    }
    if (!id || !branchId || !blocks || typeof blocks !== 'object' || Array.isArray(blocks)) {
      return json({ success: false, error: 'بيانات ناقصة' }, 400)
    }
    const branchName = typeof name === 'string' ? name.trim().slice(0, 100) : ''
    if (!branchName) return json({ success: false, error: 'اسم الفرع مايبقاش فاضي' }, 400)
    const seats = Number(capacity)
    if (!Number.isInteger(seats) || seats < 1 || seats > 50) return json({ success: false, error: 'عدد الكراسي مش صحيح' }, 400)
    const time = /^([01]\d|2[0-3]):[0-5]\d$/
    for (const day of Object.values(blocks as Record<string, unknown>)) {
      if (!Array.isArray(day) || !day.every((b) => b && time.test(b.start) && time.test(b.end) && b.start < b.end)) {
        return json({ success: false, error: 'مواعيد الشغل مش صحيحة' }, 400)
      }
    }
    const { data, error } = await supabase
      .from('branches')
      .update({ name: branchName, address: typeof address === 'string' ? address.trim().slice(0, 300) || null : null, capacity: seats, schedule_blocks: blocks })
      .eq('id', branchId)
      .eq('business_id', id)
      .select('id')
    if (error) return json({ success: false, error: error.message }, 500)
    if (!data?.length) return json({ success: false, error: 'الفرع مش موجود' }, 404)
    return json({ success: true })
  }

  if (action === 'setup_image') {
    const { id, kind, base64, contentType } = body as { id?: string; kind?: string; base64?: string; contentType?: string }
    const types: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    if (!id || (kind !== 'logo' && kind !== 'cover') || typeof base64 !== 'string' || !types[contentType ?? '']) {
      return json({ success: false, error: 'الصورة لازم تكون JPG أو PNG أو WEBP' }, 400)
    }
    let bytes: Uint8Array
    try {
      bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    } catch {
      return json({ success: false, error: 'الصورة مش سليمة' }, 400)
    }
    if (bytes.length > 3 * 1024 * 1024) return json({ success: false, error: 'الصورة أكبر من 3 ميجا' }, 400)
    const { data: exists } = await supabase.from('businesses').select('id').eq('id', id).maybeSingle()
    if (!exists) return json({ success: false, error: 'الحساب مش موجود' }, 404)
    const path = `${id}/${kind}.${types[contentType!]}`
    const { error: uploadError } = await supabase.storage.from('business-assets').upload(path, bytes, { contentType, upsert: true })
    if (uploadError) return json({ success: false, error: uploadError.message }, 500)
    // The version stops browsers and the CDN from showing the old picture.
    const url = `${supabase.storage.from('business-assets').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
    const { error } = await supabase.from('businesses').update({ [`${kind}_url`]: url }).eq('id', id)
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, url })
  }

  return json({ success: false, error: 'Unknown action' }, 400)
})
