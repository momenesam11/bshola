// Data behind the dashboard's "النهارده" card. The card and its tabs read the
// same queries, so the counts and the lists never disagree.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { todayISO } from '../utils/dateHelpers'

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

