import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useBusiness() {
  return useQuery({
    queryKey: ['business'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('غير مسجل الدخول')
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', user.id)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data || null
    },
  })
}

export function useServices(businessId) {
  return useQuery({
    queryKey: ['services', businessId],
    queryFn: async () => {
      if (!businessId) return []
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', businessId)
        .order('name')
      if (error) throw error
      return data
    },
    enabled: !!businessId,
  })
}

export function useUpdateBusiness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }) => {
      const { data, error } = await supabase
        .from('businesses')
        .update(updates)
        .eq('id', id)
        .select()
      if (error) {
        console.error('useUpdateBusiness error:', error)
        throw new Error(error.message || JSON.stringify(error))
      }
      if (!data || data.length === 0) {
        throw new Error('لم يتم تحديث السجل — تأكد من صلاحيات RLS في Supabase')
      }
      return data[0]
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business'] }),
  })
}

export function useCreateBusiness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('businesses')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business'] }),
  })
}

export function useUpsertService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ businessId, services }) => {
      const { error } = await supabase
        .from('services')
        .upsert(services.map(s => ({ ...s, business_id: businessId })))
      if (error) throw error
    },
    onSuccess: (_, { businessId }) =>
      qc.invalidateQueries({ queryKey: ['services', businessId] }),
  })
}

export function useDeleteService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('services').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

// Same "locked" definition TrialGuard uses to block the owner's dashboard:
// explicitly suspended (is_active = false), or trial/paid period elapsed
// with no active subscription. The public booking page must honor this too
// — otherwise customers keep booking real appointments for a business that
// stopped paying or got suspended, and the owner never finds out until
// someone shows up.
export function isBusinessLocked(business) {
  if (!business) return false
  if (business.is_active === false) return true
  if (!business.trial_ends_at) return false
  return new Date(business.trial_ends_at) < new Date()
}

export function usePublicBusiness(slug) {
  return useQuery({
    queryKey: ['public-business', slug],
    queryFn: async () => {
      // Try by booking_slug first, then by id (backward compat)
      let { data, error } = await supabase
        .from('businesses')
        .select('id, name, type, working_hours, slot_duration, logo_url, cover_url, brand_color, bio, specialty, years_experience, welcome_message, cancellation_policy, instagram_url, facebook_url, google_reviews_url, booking_slug, public_phone, is_active, trial_ends_at, subscription_type')
        .eq('booking_slug', slug)
        .maybeSingle()
      if (!data) {
        const res = await supabase
          .from('businesses')
          .select('id, name, type, working_hours, slot_duration, logo_url, cover_url, brand_color, bio, specialty, years_experience, welcome_message, cancellation_policy, instagram_url, facebook_url, google_reviews_url, booking_slug, public_phone, is_active, trial_ends_at, subscription_type')
          .eq('id', slug)
          .maybeSingle()
        data = res.data
        error = res.error
      }
      if (error) throw error
      return data
    },
    enabled: !!slug,
  })
}

export function usePublicServices(businessId) {
  return useQuery({
    queryKey: ['public-services', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', businessId)
        .order('name')
      if (error) throw error
      return data
    },
    enabled: !!businessId,
  })
}

export function useUpdateBusinessIdentity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...identityData }) => {
      const { data, error } = await supabase
        .from('businesses')
        .update(identityData)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business'] }),
  })
}

export async function uploadBusinessAsset(businessId, file, type) {
  const ext = file.name.split('.').pop()
  const path = `${businessId}/${type}.${ext}`
  const { error } = await supabase.storage
    .from('business-assets')
    .upload(path, file, { upsert: true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage
    .from('business-assets')
    .getPublicUrl(path)
  return publicUrl
}

export function useBusinessBySlug(slug) {
  return usePublicBusiness(slug)
}

export function usePublicBranches(businessId) {
  return useQuery({
    queryKey: ['public-branches', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, address, phone, is_main, schedule_blocks, capacity')
        .eq('business_id', businessId)
        .order('is_main', { ascending: false })
        .order('created_at')
      if (error) throw error
      return data || []
    },
    enabled: !!businessId,
  })
}
