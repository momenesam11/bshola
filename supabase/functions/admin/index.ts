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

  return json({ success: false, error: 'Unknown action' }, 400)
})
