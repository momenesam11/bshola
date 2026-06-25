import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabaseAdmin } from '../lib/supabaseAdmin'

const TOKEN_KEY = 'beshola_admin_token'

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function hasAdminToken() {
  return !!getToken()
}

export function adminLogout() {
  sessionStorage.removeItem(TOKEN_KEY)
}

// All admin reads/writes are proxied through the `admin` Edge Function —
// the password and session token are checked there, server-side, against
// the service-role key. Nothing here trusts the client.
async function callAdmin(action, payload = {}) {
  const { data, error } = await supabaseAdmin.functions.invoke('admin', {
    body: { action, token: getToken(), ...payload },
  })
  if (error) {
    if (error.context?.status === 401) {
      adminLogout()
      window.location.reload()
    }
    throw new Error(error.message || 'حدث خطأ')
  }
  if (!data?.success) throw new Error(data?.error || 'حدث خطأ')
  return data
}

export async function adminLogin(password) {
  const { data, error } = await supabaseAdmin.functions.invoke('admin', {
    body: { action: 'login', password },
  })
  if (error || !data?.success) return null
  sessionStorage.setItem(TOKEN_KEY, data.token)
  return data.token
}

export function useAdminBusinesses() {
  return useQuery({
    queryKey: ['admin-businesses'],
    queryFn: async () => (await callAdmin('list')).businesses,
    enabled: hasAdminToken(),
  })
}

export function useActivateBusiness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, days }) => callAdmin('activate', { id, days }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-businesses'] }),
  })
}

export function useExtendTrial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, currentTrialEndsAt, days }) => callAdmin('extend', { id, currentTrialEndsAt, days }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-businesses'] }),
  })
}

export function useDeactivateBusiness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => callAdmin('deactivate', { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-businesses'] }),
  })
}

export function getBusinessStatus(business) {
  if (!business.is_active) return 'suspended'
  if (business.subscription_type === 'paid') return 'paid'
  if (business.trial_ends_at && new Date(business.trial_ends_at) < new Date()) return 'expired'
  return 'trial'
}

export function getAdminStats(businesses) {
  const stats = { total: businesses.length, activeTrials: 0, expiredTrials: 0, paid: 0, suspended: 0, signupsThisWeek: 0, expiringSoon: [] }
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  for (const b of businesses) {
    const status = getBusinessStatus(b)
    if (status === 'trial') stats.activeTrials++
    else if (status === 'expired') stats.expiredTrials++
    else if (status === 'paid') stats.paid++
    else if (status === 'suspended') stats.suspended++

    if (b.created_at && new Date(b.created_at) >= weekAgo) stats.signupsThisWeek++

    if (status === 'trial' && b.trial_ends_at) {
      const daysLeft = Math.ceil((new Date(b.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 3) stats.expiringSoon.push({ ...b, daysLeft })
    }
  }
  const decided = stats.paid + stats.expiredTrials
  stats.conversionRate = decided > 0 ? Math.round((stats.paid / decided) * 100) : 0
  stats.expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft)
  return stats
}

export function searchBusinesses(businesses, query) {
  const q = query.trim().toLowerCase()
  if (!q) return businesses
  return businesses.filter(b =>
    b.name?.toLowerCase().includes(q) ||
    b.owner_phone?.includes(q) ||
    b.phone?.includes(q)
  )
}
