import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// The clinic's side of account deletion (migration 049). Asking only records a
// request; the Beshola team approves and deletes from /admin.

const key = (businessId) => ['account-deletion', businessId]

export function useDeletionRequest(businessId) {
  return useQuery({
    queryKey: key(businessId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_account_deletion_request', { p_business_id: businessId })
      if (error) throw error
      return data?.[0] ?? null
    },
    enabled: !!businessId,
  })
}

export function useRequestDeletion(businessId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reason) => {
      const { data, error } = await supabase.rpc('request_account_deletion', { p_business_id: businessId, p_reason: reason || null })
      if (error) throw error
      return data?.[0] ?? null
    },
    onSuccess: (row) => qc.setQueryData(key(businessId), row),
  })
}

export function useCancelDeletion(businessId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_account_deletion', { p_business_id: businessId })
      if (error) throw error
    },
    onSuccess: () => qc.setQueryData(key(businessId), null),
  })
}
