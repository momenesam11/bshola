import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { supabase } from '../lib/supabase'
import { adminLogout, getToken, hasAdminToken } from './useAdmin'
import { getStoredRef, clearStoredRef } from '../lib/refCapture'

// ── Admin side: everything goes through the `growth` Edge Function, which
// checks the same admin session token as /admin. ─────────────────────────

async function callGrowth(action, payload = {}) {
  const { data, error } = await supabaseAdmin.functions.invoke('growth', {
    body: { action, token: getToken(), ...payload },
  })
  if (error) {
    if (error.context?.status === 401) {
      adminLogout()
      window.location.reload()
    }
    // Edge function errors carry our Arabic message in the JSON body.
    let message = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.error) message = body.error
    } catch {
      // keep the generic message
    }
    throw new Error(message || 'حدث خطأ')
  }
  if (!data?.success) throw new Error(data?.error || 'حدث خطأ')
  return data
}

const KEY = ['growth']

export function useGrowthData() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => callGrowth('list'),
    enabled: hasAdminToken(),
    staleTime: 30_000,
  })
}

export function useLeadActivities(leadId) {
  return useQuery({
    queryKey: [...KEY, 'activities', leadId],
    queryFn: async () => (await callGrowth('activities', { leadId })).activities,
    enabled: !!leadId && hasAdminToken(),
  })
}

export function useActivityStats() {
  return useQuery({
    queryKey: [...KEY, 'activity-stats'],
    queryFn: async () => (await callGrowth('activity_stats')).activities,
    enabled: hasAdminToken(),
  })
}

/** Replaces one lead in the cached list without refetching all of them. */
function patchLead(qc, lead) {
  qc.setQueryData(KEY, (old) => {
    if (!old) return old
    const exists = old.leads.some((l) => l.id === lead.id)
    return { ...old, leads: exists ? old.leads.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...old.leads] }
  })
}

export function useSaveLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, lead }) => (await callGrowth('save_lead', { id, lead })).lead,
    onSuccess: (lead) => patchLead(qc, lead),
  })
}

export function useDeleteLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => callGrowth('delete_lead', { id }),
    onSuccess: (_, id) =>
      qc.setQueryData(KEY, (old) => (old ? { ...old, leads: old.leads.filter((l) => l.id !== id) } : old)),
  })
}

export function useLogActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => (await callGrowth('log', payload)).lead,
    onSuccess: (lead) => {
      patchLead(qc, lead)
      qc.invalidateQueries({ queryKey: [...KEY, 'activities', lead.id] })
      qc.invalidateQueries({ queryKey: [...KEY, 'activity-stats'] })
    },
  })
}

export function useImportLeads() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rows, source }) => (await callGrowth('import', { rows, source })).result,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY, exact: true }),
  })
}

export function useSyncPlatform() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => (await callGrowth('sync')).result,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY, exact: true }),
  })
}

export function useSavePartner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, partner }) => (await callGrowth('save_partner', { id, partner })).partner,
    onSuccess: (partner) =>
      qc.setQueryData(KEY, (old) => {
        if (!old) return old
        const exists = old.partners.some((p) => p.id === partner.id)
        return { ...old, partners: exists ? old.partners.map((p) => (p.id === partner.id ? partner : p)) : [partner, ...old.partners] }
      }),
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings) => (await callGrowth('save_settings', { settings })).settings,
    onSuccess: (settings) => qc.setQueryData(KEY, (old) => (old ? { ...old, settings } : old)),
  })
}

export function usePlacesSearch() {
  return useMutation({
    mutationFn: ({ query, pageToken }) => callGrowth('places_search', { query, pageToken }),
  })
}

// ── Public side: narrow SECURITY DEFINER functions from migration 032. ──

const SUBMIT_ERRORS = {
  invalid_phone: 'رقم التليفون مش صحيح',
  invalid_name: 'اكتب اسمك',
  busy: 'فيه ضغط دلوقتي — جرّب كمان شوية أو كلّمنا على واتساب',
}

/** "Call me" form / loss calculator. Resolves on success, throws an Arabic message otherwise. */
export async function submitLead({ name, phone, businessName, category, source, details }) {
  const { data, error } = await supabase.rpc('growth_submit_lead', {
    p_name: name,
    p_phone: phone,
    p_business_name: businessName || null,
    p_category: category || 'clinic',
    p_source: source,
    p_details: details ?? {},
    p_ref: getStoredRef(),
  })
  if (error) throw new Error('حصلت مشكلة — جرّب تاني أو كلّمنا على واتساب')
  if (!data?.ok) throw new Error(SUBMIT_ERRORS[data?.error] ?? 'حصلت مشكلة — جرّب تاني')
}

export function usePreview(code) {
  return useQuery({
    queryKey: ['growth-preview', code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('growth_get_preview', { p_code: code })
      if (error) throw error
      return data
    },
    enabled: !!code,
    retry: false,
  })
}

/**
 * Called once onboarding finishes: credits the new business to whichever
 * lead/partner/referrer link brought them. Never throws — attribution must
 * not get in the way of a new customer's first screen.
 */
export async function attributeSignup() {
  try {
    const { data, error } = await supabase.rpc('growth_attribute_signup', { p_ref: getStoredRef() })
    if (!error && data?.ok) clearStoredRef()
  } catch {
    // The nightly sync still creates the lead (as an organic signup).
  }
}

// ── Partner commissions & the "real clinic" check (migration 033) ─────────

export function useQualifyStatus(businessId) {
  return useQuery({
    queryKey: [...KEY, 'qualify', businessId],
    queryFn: async () => (await callGrowth('qualify_status', { businessId })).check,
    enabled: !!businessId && hasAdminToken(),
  })
}

export function useQualifyLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ leadId, manual }) => callGrowth('qualify_lead', { leadId, manual }),
    onSuccess: ({ lead }) => {
      patchLead(qc, lead)
      // A qualification can create a commission — refetch the list for it.
      qc.invalidateQueries({ queryKey: KEY, exact: true })
      qc.invalidateQueries({ queryKey: [...KEY, 'activities', lead.id] })
    },
  })
}

export function useSetCommissionStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, note }) => (await callGrowth('set_commission_status', { id, status, note })).commission,
    onSuccess: (commission) =>
      qc.setQueryData(KEY, (old) =>
        old ? { ...old, commissions: old.commissions.map((c) => (c.id === commission.id ? commission : c)) } : old),
  })
}

/** Public: a partner's own dashboard, by the secret token in their link. */
export function usePartnerDashboard(token) {
  return useQuery({
    queryKey: ['partner-dashboard', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('growth_partner_dashboard', { p_token: token })
      if (error) throw error
      return data
    },
    enabled: !!token,
    retry: false,
  })
}

// ── Daily automatic discovery (migration 036) ──────────────────────────────

/**
 * Once a Cairo day, the first time the growth screen opens with discovery
 * on: run the next few Google Places searches, keep open clinics that have a
 * phone, and import the new ones (duplicates are skipped by the database).
 * Each search counts against the daily Places cap like a manual one.
 *
 * @returns {Promise<{ran: boolean, searched?: number, added?: number, skipped?: number}>}
 */
export async function runAutoDiscover(settings) {
  const { discoveryQueries, nextBatch, placeToRow, cairoToday } = await import('../lib/growth/discover')
  const today = cairoToday()
  if (!settings?.auto_discover_enabled || settings.auto_discover_last_run === today) return { ran: false }

  const list = discoveryQueries(settings.auto_discover_categories ?? [], settings.auto_discover_areas ?? [])
  const { batch, cursor } = nextBatch(list, settings.auto_discover_cursor ?? 0, settings.auto_discover_per_day ?? 4)
  // Claim today first, so a second open tab doesn't run the same searches.
  await callGrowth('save_settings', { settings: { auto_discover_last_run: today, auto_discover_cursor: cursor } })

  const rows = []
  let searched = 0
  for (const item of batch) {
    try {
      const res = await callGrowth('places_search', { query: item.query })
      searched += 1
      for (const place of res.places ?? []) {
        const row = placeToRow(place, item)
        if (row) rows.push(row)
      }
    } catch {
      break // out of quota or Places unavailable — keep what we have
    }
  }
  if (!rows.length) return { ran: true, searched, added: 0, skipped: 0 }
  const { result } = await callGrowth('import', { rows: rows.slice(0, 1000), source: 'google_maps_api' })
  return { ran: true, searched, added: result.inserted, skipped: result.skipped }
}
