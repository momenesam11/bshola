import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Backs /admin/growth — Beshola's own sales pipeline (migration 032).
//
// Same security model as the `admin` function: every action needs a valid
// admin_sessions token (issued by `admin` on password login), and all reads
// and writes use the service-role key, because the growth_* tables have RLS
// on with no policies — nothing reaches them from the browser directly.
//
// Separate from `admin` on purpose: a bug or outage here (Google Places, a
// bad import) can't take down activating/extending customer subscriptions.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in), and optionally
// GOOGLE_PLACES_API_KEY — without it everything works except Maps search.

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

const fail = (error: string, status = 400) => json({ success: false, error }, status)

type Supabase = ReturnType<typeof createClient>

async function requireSession(supabase: Supabase, token: string | undefined) {
  if (!token) return false
  const { data } = await supabase
    .from('admin_sessions')
    .select('token')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return !!data
}

// Columns the dashboard may write on a lead. Everything else (ref_code,
// created_at, business links set by attribution, …) is server-owned.
const LEAD_FIELDS = [
  'name', 'category', 'specialty', 'contact_person', 'city', 'area', 'address',
  'phone', 'phone_raw', 'email', 'website', 'instagram', 'facebook', 'google_maps_url',
  'google_place_id', 'google_rating', 'google_reviews_count', 'has_online_booking',
  'source', 'source_detail', 'partner_id', 'stage', 'lost_reason', 'sales_angle',
  'next_follow_up_at', 'signals', 'notes', 'preview', 'is_test',
]
const PARTNER_FIELDS = ['name', 'phone', 'kind', 'signup_bonus_egp', 'commission_pct', 'notes', 'active']
const COMMISSION_STATUSES = ['pending', 'approved', 'paid', 'rejected']

function pick(obj: Record<string, unknown> | undefined, fields: string[]) {
  const out: Record<string, unknown> = {}
  for (const f of fields) if (obj && f in obj) out[f] = obj[f] === '' ? null : obj[f]
  return out
}

function dbError(error: { code?: string; message: string }) {
  if (error.code === '23505') {
    if (error.message.includes('phone')) return fail('رقم التليفون ده موجود عند عميل تاني في القايمة', 409)
    if (error.message.includes('google_place_id')) return fail('المكان ده موجود في القايمة', 409)
    return fail('موجود قبل كده', 409)
  }
  if (error.code === '23514') return fail('قيمة مش مسموحة في أحد الحقول', 400)
  console.error(error)
  return fail(error.message, 500)
}

// Google Places (New) Text Search — one request returns up to 20 places with
// their phone, website, rating and up to 5 reviews. FieldMask keeps the
// billing to exactly what the screen uses.
const PLACES_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.internationalPhoneNumber', 'places.websiteUri', 'places.rating', 'places.userRatingCount',
  'places.googleMapsUri', 'places.businessStatus', 'places.primaryTypeDisplayName', 'places.reviews',
  'nextPageToken',
].join(',')

async function placesSearch(query: string, pageToken?: string) {
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!key) return { error: 'places_not_configured' }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PLACES_FIELDS },
    body: JSON.stringify({ textQuery: query, languageCode: 'ar', regionCode: 'EG', pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('places error', data)
    return { error: data?.error?.message ?? `Google Places ${res.status}` }
  }
  // deno-lint-ignore no-explicit-any
  const places = (data.places ?? []).map((p: any) => ({
    google_place_id: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    google_rating: p.rating ?? null,
    google_reviews_count: p.userRatingCount ?? 0,
    google_maps_url: p.googleMapsUri ?? null,
    business_status: p.businessStatus ?? null,
    type_label: p.primaryTypeDisplayName?.text ?? null,
    // Review text is passed through for on-screen signal detection only; the
    // browser keeps just short quotes as evidence on the leads it saves.
    // deno-lint-ignore no-explicit-any
    reviews: (p.reviews ?? []).map((r: any) => ({
      text: r.originalText?.text ?? r.text?.text ?? '',
      rating: r.rating ?? null,
      publishTime: r.publishTime ?? null,
    })),
  }))
  return { places, nextPageToken: data.nextPageToken ?? null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid request body')
  }

  const { action, token } = body as { action?: string; token?: string }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  if (!(await requireSession(supabase, token))) {
    return fail('الجلسة غير صالحة أو منتهية', 401)
  }

  try {
    switch (action) {
      case 'list': {
        const [leads, partners, settings, commissions] = await Promise.all([
          supabase.from('growth_leads').select('*').order('created_at', { ascending: false }).limit(5000),
          supabase.from('growth_partners').select('*').order('created_at', { ascending: false }),
          supabase.from('growth_settings').select('*').eq('id', 1).maybeSingle(),
          supabase.from('growth_commissions').select('*').order('created_at', { ascending: false }),
        ])
        if (leads.error) return dbError(leads.error)
        if (partners.error) return dbError(partners.error)
        if (settings.error) return dbError(settings.error)
        if (commissions.error) return dbError(commissions.error)
        return json({
          success: true,
          leads: leads.data ?? [],
          partners: partners.data ?? [],
          settings: settings.data,
          commissions: commissions.data ?? [],
          placesConfigured: !!Deno.env.get('GOOGLE_PLACES_API_KEY'),
        })
      }

      case 'activities': {
        const { leadId } = body as { leadId?: string }
        if (!leadId) return fail('بيانات ناقصة')
        const { data, error } = await supabase
          .from('growth_activities').select('*').eq('lead_id', leadId)
          .order('created_at', { ascending: false }).limit(200)
        if (error) return dbError(error)
        return json({ success: true, activities: data ?? [] })
      }

      case 'activity_stats': {
        const since = new Date(Date.now() - 30 * 864e5).toISOString()
        const { data, error } = await supabase
          .from('growth_activities').select('kind, outcome, sales_angle, created_at')
          .gte('created_at', since).limit(10000)
        if (error) return dbError(error)
        return json({ success: true, activities: data ?? [] })
      }

      case 'save_lead': {
        const { id, lead } = body as { id?: string; lead?: Record<string, unknown> }
        const fields = pick(lead, LEAD_FIELDS)
        if (!id && !fields.name) return fail('الاسم مطلوب')
        const q = id
          ? supabase.from('growth_leads').update(fields).eq('id', id).select().single()
          : supabase.from('growth_leads').insert({ source: 'manual', ...fields }).select().single()
        const { data, error } = await q
        if (error) return dbError(error)
        return json({ success: true, lead: data })
      }

      case 'delete_lead': {
        const { id } = body as { id?: string }
        if (!id) return fail('بيانات ناقصة')
        const { error } = await supabase.from('growth_leads').delete().eq('id', id)
        if (error) return dbError(error)
        return json({ success: true })
      }

      case 'import': {
        const { rows, source } = body as { rows?: unknown[]; source?: string }
        if (!Array.isArray(rows) || rows.length === 0) return fail('مفيش صفوف')
        if (rows.length > 1000) return fail('الحد الأقصى 1000 صف في المرة')
        const { data, error } = await supabase.rpc('growth_import_leads', { p_rows: rows, p_source: source ?? 'import' })
        if (error) return dbError(error)
        return json({ success: true, result: data })
      }

      case 'log': {
        const { leadId, kind, outcome, note, salesAngle, nextFollowUpAt, stage } = body as Record<string, string | undefined>
        if (!leadId || !kind) return fail('بيانات ناقصة')
        const { data, error } = await supabase.rpc('growth_log_activity', {
          p_lead_id: leadId,
          p_kind: kind,
          p_outcome: outcome ?? null,
          p_body: note ?? null,
          p_sales_angle: salesAngle ?? null,
          p_next_follow_up_at: nextFollowUpAt ?? null,
          p_stage: stage ?? null,
        })
        if (error) return dbError(error)
        return json({ success: true, lead: data })
      }

      case 'sync': {
        const { data, error } = await supabase.rpc('growth_sync_platform')
        if (error) return dbError(error)
        return json({ success: true, result: data })
      }

      case 'save_partner': {
        const { id, partner } = body as { id?: string; partner?: Record<string, unknown> }
        const fields = pick(partner, PARTNER_FIELDS)
        if (!id && !fields.name) return fail('الاسم مطلوب')
        const q = id
          ? supabase.from('growth_partners').update(fields).eq('id', id).select().single()
          : supabase.from('growth_partners').insert(fields).select().single()
        const { data, error } = await q
        if (error) return dbError(error)
        return json({ success: true, partner: data })
      }

      case 'save_settings': {
        const { settings } = body as { settings?: Record<string, unknown> }
        const fields = pick(settings, [
          'weights', 'target_areas', 'places_daily_cap', 'qualify_min_appointments', 'qualify_min_clients',
          'auto_discover_enabled', 'auto_discover_categories', 'auto_discover_areas', 'auto_discover_per_day',
          'auto_discover_cursor', 'auto_discover_last_run',
        ])
        const { data, error } = await supabase.from('growth_settings').update(fields).eq('id', 1).select().single()
        if (error) return dbError(error)
        return json({ success: true, settings: data })
      }

      case 'qualify_lead': {
        const { leadId, manual } = body as { leadId?: string; manual?: boolean }
        if (!leadId) return fail('بيانات ناقصة')
        const { data: check, error } = await supabase.rpc('growth_qualify_lead', { p_lead_id: leadId, p_manual: !!manual })
        if (error) return dbError(error)
        const { data: lead, error: e2 } = await supabase.from('growth_leads').select('*').eq('id', leadId).single()
        if (e2) return dbError(e2)
        return json({ success: true, check, lead })
      }

      case 'qualify_status': {
        const { businessId } = body as { businessId?: string }
        if (!businessId) return fail('بيانات ناقصة')
        const { data, error } = await supabase.rpc('growth_qualify_check', { p_business_id: businessId })
        if (error) return dbError(error)
        return json({ success: true, check: data })
      }

      case 'set_commission_status': {
        const { id, status, note } = body as { id?: string; status?: string; note?: string }
        if (!id || !status || !COMMISSION_STATUSES.includes(status)) return fail('بيانات ناقصة')
        const { data, error } = await supabase.rpc('growth_set_commission_status', { p_id: id, p_status: status, p_note: note ?? null })
        if (error) return dbError(error)
        return json({ success: true, commission: data })
      }

      case 'places_search': {
        const { query, pageToken } = body as { query?: string; pageToken?: string }
        const q = String(query ?? '').trim()
        if (q.length < 3 || q.length > 200) return fail('اكتب كلمة بحث (3 حروف على الأقل)')
        if (!Deno.env.get('GOOGLE_PLACES_API_KEY')) return fail('places_not_configured', 503)
        const { data: allowed, error } = await supabase.rpc('growth_take_places_quota')
        if (error) return dbError(error)
        if (!allowed) return fail('وصلت للحد اليومي لبحث خرائط جوجل — تقدر تغيّره من الإعدادات', 429)
        const result = await placesSearch(q, pageToken)
        if ('error' in result) return fail(String(result.error), 502)
        return json({ success: true, ...result })
      }

      default:
        return fail('Unknown action')
    }
  } catch (e) {
    console.error(e)
    return fail(e instanceof Error ? e.message : 'حدث خطأ', 500)
  }
})
