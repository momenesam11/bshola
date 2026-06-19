import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabaseAdmin } from '../lib/supabaseAdmin'

export function useAdminBusinesses() {
  return useQuery({
    queryKey: ['admin-businesses'],
    queryFn: async () => {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .select('id, name, type, phone, owner_phone, created_at, trial_started_at, trial_ends_at, is_active, subscription_type, activated_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })
}

export function useActivateBusiness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, days }) => {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .update({
          subscription_type: 'paid',
          is_active: true,
          trial_ends_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
          activated_at: new Date().toISOString(),
          activated_by: 'owner',
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-businesses'] }),
  })
}

export function useExtendTrial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, currentTrialEndsAt, days }) => {
      const base = currentTrialEndsAt && new Date(currentTrialEndsAt) > new Date()
        ? new Date(currentTrialEndsAt)
        : new Date()
      const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .update({ trial_ends_at: newEnd.toISOString(), is_active: true })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-businesses'] }),
  })
}

export function useDeactivateBusiness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
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
  const stats = { total: businesses.length, activeTrials: 0, expiredTrials: 0, paid: 0, suspended: 0 }
  for (const b of businesses) {
    const status = getBusinessStatus(b)
    if (status === 'trial') stats.activeTrials++
    else if (status === 'expired') stats.expiredTrials++
    else if (status === 'paid') stats.paid++
    else if (status === 'suspended') stats.suspended++
  }
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
