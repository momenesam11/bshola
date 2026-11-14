// Data behind the dashboard's "النهارده" card: today's queue (053) and the
// visits waiting for a Google review request (051). The card and its tabs read
// the same queries, so the counts and the lists never disagree.

import { useQuery } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { toISODateString, todayISO } from '../utils/dateHelpers'
import { REVIEW_WINDOW_DAYS, pickReviewCandidates } from '../lib/reviews'

// Today's confirmed appointments (migration 053). Under the 'appointments' key,
// so any change to an appointment refreshes it.
export function useTodayAppointments(businessId) {
  const date = todayISO()
  return useQuery({
    queryKey: ['appointments', businessId, 'queue', date],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, services(name, duration_minutes, price), branches(name)')
        .eq('business_id', businessId)
        .eq('appointment_date', date)
        .eq('status', 'confirmed')
      if (error) throw error
      return data
    },
  })
}

// Finished visits from the last few days whose patient was never asked for a
// Google review by this clinic (migration 051).
export function useReviewCandidates(businessId) {
  return useQuery({
    queryKey: ['review-requests', businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data: visits, error } = await supabase
        .from('appointments')
        .select('id, client_name, client_phone, appointment_date, appointment_time, branch_id, review_requested_at, services(name)')
        .eq('business_id', businessId)
        .eq('status', 'completed')
        .gte('appointment_date', toISODateString(subDays(new Date(), REVIEW_WINDOW_DAYS)))
        .lte('appointment_date', todayISO())
      if (error) throw error
      const phones = [...new Set((visits || []).map(v => v.client_phone))]
      if (!phones.length) return []
      const { data: asked, error: askedError } = await supabase
        .from('appointments')
        .select('client_phone')
        .eq('business_id', businessId)
        .in('client_phone', phones)
        .not('review_requested_at', 'is', null)
      if (askedError) throw askedError
      return pickReviewCandidates(visits || [], (asked || []).map(a => a.client_phone))
    },
  })
}
