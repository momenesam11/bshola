import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatTime12, toISODateString } from '../utils/dateHelpers'

function invalidateAll(qc) {
  qc.invalidateQueries({ queryKey: ['appointments'] })
  qc.invalidateQueries({ queryKey: ['calendar-day'] })
  qc.invalidateQueries({ queryKey: ['calendar-week'] })
  qc.invalidateQueries({ queryKey: ['calendar-month'] })
  qc.invalidateQueries({ queryKey: ['appointments-tomorrow'] })
  qc.invalidateQueries({ queryKey: ['booked-slots'] })
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

export function useAllAppointments(businessId, { from, to } = {}) {
  return useQuery({
    queryKey: ['appointments-all', businessId, from, to],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select('*, services(name), branches(name)')
        .eq('business_id', businessId)
      if (from) q = q.gte('appointment_date', from)
      if (to) q = q.lte('appointment_date', to)
      const { data, error } = await q.order('appointment_date').order('appointment_time')
      if (error) throw error
      return data
    },
    enabled: !!businessId,
  })
}

export function useCreateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('appointments')
        .insert(payload)
        .select()
      if (error) {
        console.error('useCreateAppointment error:', error)
        throw new Error(error.message || JSON.stringify(error))
      }
      return data?.[0]
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
        .select('client_phone, client_name, appointment_time, services(name), branches(name)')
        .eq('business_id', businessId)
        .eq('appointment_date', tomorrowStr)
        .neq('status', 'cancelled')
      if (error) throw error
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
      let q = supabase
        .from('appointments')
        .select('appointment_time')
        .eq('business_id', businessId)
        .eq('appointment_date', date)
        .in('status', ['confirmed'])
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (error) throw error
      const counts = {}
      for (const r of data) {
        const t = r.appointment_time.slice(0, 5)
        counts[t] = (counts[t] || 0) + 1
      }
      return counts
    },
    enabled: !!businessId && !!date,
  })
}

// Legacy compat — flat list of fully-booked times (capacity === 1 behavior)
export function useBookedSlots(businessId, date, branchId) {
  const { data: counts = {}, ...rest } = useBookedSlotCounts(businessId, date, branchId)
  return { ...rest, data: Object.keys(counts).filter(t => counts[t] > 0) }
}
