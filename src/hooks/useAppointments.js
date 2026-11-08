import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatTime12, toISODateString } from '../utils/dateHelpers'

// Every screen that shows appointments, or numbers derived from them. A key
// missing here is a screen that keeps showing the old state until a reload —
// the appointments page ('appointments-all') was one.
const APPOINTMENT_QUERIES = [
  'appointments', 'appointments-all', 'appointments-tomorrow', 'booked-slots',
  'calendar-day', 'calendar-week', 'calendar-month',
  'clients', 'client-profile', 'patient-visits', 'notifications',
  // A plan visit follows its appointment (DB trigger) and completing one
  // charges the client's statement.
  'client-plan', 'client-ledger',
]

export function invalidateAll(qc) {
  qc.invalidateQueries({ predicate: q => APPOINTMENT_QUERIES.includes(q.queryKey[0]) })
}

export function useAppointments(businessId, date) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['appointments', businessId, date],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select('*, services(name, duration_minutes, price)')
        .eq('business_id', businessId)
      if (date) q = q.eq('appointment_date', date)
      const { data, error } = await q.order('appointment_time')
      if (error) throw error
      return data
    },
    enabled: !!businessId,
  })

  // Realtime subscription with toast notifications
  useEffect(() => {
    if (!businessId) return
    const channel = supabase
      .channel(`appointments-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `business_id=eq.${businessId}` },
        (payload) => {
          invalidateAll(qc)
          if (payload.eventType === 'INSERT' && payload.new?.client_name) {
            const time = formatTime12(payload.new.appointment_time?.slice(0, 5))
            toast.success(
              `حجز جديد! ${payload.new.client_name} حجز الساعة ${time}`,
              { duration: 5000, position: 'top-right', id: `new-appt-${payload.new.id}` }
            )
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [businessId, qc])

  return query
}

// Supabase answers at most 1000 rows per request however the query is written,
// so a busy clinic's full history came back cut short with no error. This reads
// page by page until a short page says it's all there.
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}

export function useAllAppointments(businessId, { from, to } = {}) {
  return useQuery({
    queryKey: ['appointments-all', businessId, from, to],
    queryFn: () => fetchAllRows(() => {
      let q = supabase
        .from('appointments')
        .select('*, services(name), branches(name)')
        .eq('business_id', businessId)
      if (from) q = q.gte('appointment_date', from)
      if (to) q = q.lte('appointment_date', to)
      return q.order('appointment_date').order('appointment_time').order('id')
    }),
    enabled: !!businessId,
  })
}

export function useCreateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      // No .select() here: anon (public booking page visitors) has no
      // SELECT policy on appointments, so asking PostgREST to return the
      // inserted row fails RLS even though the insert itself is valid.
      // Neither caller (AppointmentModal, BookingPage) uses the resolved
      // value — they just need the insert to succeed.
      const { error } = await supabase
        .from('appointments')
        .insert(payload)
      if (error) {
        console.error('useCreateAppointment error:', error)
        throw new Error(error.message || JSON.stringify(error))
      }
      return null
    },
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUpdateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }) => {
      const { data, error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', id)
        .select()
      if (error) {
        console.error('useUpdateAppointment error:', error)
        throw new Error(error.message || JSON.stringify(error))
      }
      return data?.[0]
    },
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('appointments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
  })
}

export function useTomorrowsAppointments(businessId) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = toISODateString(tomorrow)
  return useQuery({
    queryKey: ['appointments-tomorrow', businessId, tomorrowStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        // id is what marks the reminder as sent, branch_id what filters it by
        // branch, and the date goes in the message.
        .select('id, branch_id, client_phone, client_name, appointment_date, appointment_time, reminder_sent, services(name), branches(name, address)')
        .eq('business_id', businessId)
        .eq('appointment_date', tomorrowStr)
        .in('status', ['confirmed', 'completed', 'no_show'])
        .order('appointment_time')
      if (error) throw error
      // One reminder per client: their first visit tomorrow.
      const map = new Map()
      for (const a of data) {
        if (!map.has(a.client_phone)) map.set(a.client_phone, a)
      }
      return map
    },
    enabled: !!businessId,
  })
}

// Returns a map of time -> active booking count, so capacity > 1 branches
// (e.g. salons with multiple chairs) can allow more than one booking per slot.
export function useBookedSlotCounts(businessId, date, branchId) {
  return useQuery({
    queryKey: ['booked-slots', businessId, date, branchId],
    queryFn: async () => {
      if (!businessId || !date) return {}
      // Visitors can't read appointments, so a direct select always came back
      // empty and every slot looked free. This returns times and counts only.
      const { data, error } = await supabase.rpc('public_booked_slots', {
        p_business_id: businessId,
        p_date: date,
        p_branch_id: branchId ?? null,
      })
      if (error) throw error
      const counts = {}
      for (const r of data) counts[r.slot_time] = r.booked
      return counts
    },
    enabled: !!businessId && !!date,
    // Realtime respects the same read rules, so visitors get no live events.
    // Polling is what keeps an open booking page current.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

// Legacy compat — flat list of fully-booked times (capacity === 1 behavior)
export function useBookedSlots(businessId, date, branchId) {
  const { data: counts = {}, ...rest } = useBookedSlotCounts(businessId, date, branchId)
  return { ...rest, data: Object.keys(counts).filter(t => counts[t] > 0) }
}
