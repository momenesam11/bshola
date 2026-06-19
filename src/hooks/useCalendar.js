import { useQuery } from '@tanstack/react-query'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns'
import { supabase } from '../lib/supabase'

function dateStr(d) {
  return format(d, 'yyyy-MM-dd')
}

export function useAppointmentsForDay(businessId, branchId, date) {
  return useQuery({
    queryKey: ['calendar-day', businessId, branchId, date],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select('*, services(name, duration_minutes, price), branches(name)')
        .eq('business_id', businessId)
        .eq('appointment_date', date)
        .order('appointment_time')
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (error) throw error
      return data
    },
    enabled: !!businessId && !!date,
    staleTime: 30_000,
  })
}

export function useAppointmentsForWeek(businessId, branchId, startDate) {
  const from = dateStr(startOfWeek(startDate, { weekStartsOn: 6 }))
  const to = dateStr(endOfWeek(startDate, { weekStartsOn: 6 }))
  return useQuery({
    queryKey: ['calendar-week', businessId, branchId, from],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select('*, services(name, duration_minutes), branches(name)')
        .eq('business_id', businessId)
        .gte('appointment_date', from)
        .lte('appointment_date', to)
        .order('appointment_date')
        .order('appointment_time')
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (error) throw error
      return data
    },
    enabled: !!businessId,
    staleTime: 30_000,
  })
}

export function useAppointmentsForMonth(businessId, branchId, year, month) {
  const from = dateStr(startOfMonth(new Date(year, month - 1)))
  const to = dateStr(endOfMonth(new Date(year, month - 1)))
  return useQuery({
    queryKey: ['calendar-month', businessId, branchId, year, month],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select('*, services(name), branches(name)')
        .eq('business_id', businessId)
        .gte('appointment_date', from)
        .lte('appointment_date', to)
        .order('appointment_date')
        .order('appointment_time')
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (error) throw error
      return data
    },
    enabled: !!businessId,
    staleTime: 30_000,
  })
}

export function useCalendarStats(businessId, branchId, startDate, endDate) {
  return useQuery({
    queryKey: ['calendar-stats', businessId, branchId, startDate, endDate],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select('status')
        .eq('business_id', businessId)
        .gte('appointment_date', startDate)
        .lte('appointment_date', endDate)
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (error) throw error

      const total = data.length
      const confirmed = data.filter(a => a.status === 'confirmed').length
      const completed = data.filter(a => a.status === 'completed').length
      const no_show = data.filter(a => a.status === 'no_show').length
      const cancelled = data.filter(a => a.status === 'cancelled').length
      const attended = confirmed + completed
      const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 0

      return { total, confirmed, completed, no_show, cancelled, attendanceRate }
    },
    enabled: !!businessId && !!startDate && !!endDate,
    staleTime: 30_000,
  })
}
