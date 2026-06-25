import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// One plan per client per business (the simple case the UI supports —
// "إضافة خطة" is hidden once a plan already exists).
export function useClientPlan(businessId, clientPhone) {
  return useQuery({
    queryKey: ['client-plan', businessId, clientPhone],
    queryFn: async () => {
      const { data: plan, error } = await supabase
        .from('client_plans')
        .select('*, client_plan_visits(*, appointments(*, services(name)))')
        .eq('business_id', businessId)
        .eq('client_phone', clientPhone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (plan) {
        plan.client_plan_visits = (plan.client_plan_visits || []).sort((a, b) => a.visit_number - b.visit_number)
      }
      return plan
    },
    enabled: !!businessId && !!clientPhone,
  })
}

export function useCreateClientPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ businessId, clientPhone, name, totalVisits, notes }) => {
      const { data: plan, error } = await supabase
        .from('client_plans')
        .insert({ business_id: businessId, client_phone: clientPhone, name, total_visits: totalVisits, notes: notes || null })
        .select()
        .single()
      if (error) throw error

      const visits = Array.from({ length: totalVisits }, (_, i) => ({ plan_id: plan.id, visit_number: i + 1 }))
      const { error: visitsError } = await supabase.from('client_plan_visits').insert(visits)
      if (visitsError) throw visitsError
      return plan
    },
    onSuccess: (_, { businessId, clientPhone }) =>
      qc.invalidateQueries({ queryKey: ['client-plan', businessId, clientPhone] }),
  })
}

export function useUpdatePlanVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }) => {
      const { error } = await supabase.from('client_plan_visits').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-plan'] }),
  })
}

export function useDeleteClientPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (planId) => {
      const { error } = await supabase.from('client_plans').delete().eq('id', planId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-plan'] }),
  })
}
