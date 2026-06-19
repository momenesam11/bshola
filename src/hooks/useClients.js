import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { subDays } from 'date-fns'

function classifyStatus(lastDate) {
  if (!lastDate) return 'ضايع'
  const daysDiff = Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24))
  if (daysDiff <= 30) return 'منتظم'
  if (daysDiff <= 60) return 'فاتر'
  return 'ضايع'
}

export function useClients(businessId) {
  return useQuery({
    queryKey: ['clients', businessId],
    queryFn: async () => {
      const { data: appts, error } = await supabase
        .from('appointments')
        .select('client_name, client_phone, appointment_date, status, services(price)')
        .eq('business_id', businessId)
        .order('appointment_date', { ascending: false })

      if (error) throw error

      // Aggregate per phone
      const map = new Map()
      for (const a of appts) {
        const key = a.client_phone
        if (!map.has(key)) {
          map.set(key, {
            name: a.client_name,
            phone: a.client_phone,
            visits: 0,
            totalSpent: 0,
            lastVisit: null,
            attended: 0,
          })
        }
        const client = map.get(key)
        client.visits++
        if (a.services?.price) client.totalSpent += a.services.price
        if (!client.lastVisit || a.appointment_date > client.lastVisit) {
          client.lastVisit = a.appointment_date
        }
        if (a.status === 'completed') client.attended++
      }

      return Array.from(map.values()).map(c => ({
        ...c,
        status: classifyStatus(c.lastVisit),
        attendanceRate: c.visits > 0 ? Math.round((c.attended / c.visits) * 100) : 0,
      }))
    },
    enabled: !!businessId,
  })
}

export function useClientsByStatus(businessId, status) {
  const { data: clients = [], ...rest } = useClients(businessId)
  return {
    ...rest,
    data: status ? clients.filter(c => c.status === status) : clients,
  }
}

export function useClientStats(businessId) {
  const { data: clients = [], isLoading } = useClients(businessId)
  const stats = {
    total: clients.length,
    منتظم: clients.filter(c => c.status === 'منتظم').length,
    فاتر: clients.filter(c => c.status === 'فاتر').length,
    ضايع: clients.filter(c => c.status === 'ضايع').length,
  }
  return { data: stats, isLoading }
}

export function useClientProfile(phone, businessId) {
  return useQuery({
    queryKey: ['client-profile', phone, businessId],
    queryFn: async () => {
      const { data: appts, error } = await supabase
        .from('appointments')
        .select('*, services(name, price, duration_minutes), branches(name)')
        .eq('business_id', businessId)
        .eq('client_phone', phone)
        .order('appointment_date', { ascending: false })

      if (error) throw error

      const totalVisits = appts.length
      const totalSpent = appts.reduce((s, a) => s + (a.services?.price || 0), 0)
      const attended = appts.filter(a => a.status === 'completed').length
      const attendanceRate = totalVisits > 0 ? Math.round((attended / totalVisits) * 100) : 0
      const lastVisit = appts[0]?.appointment_date || null

      // Fetch notes from clients table
      const { data: clientRow } = await supabase
        .from('clients')
        .select('notes')
        .eq('business_id', businessId)
        .eq('phone', phone)
        .single()

      return {
        name: appts[0]?.client_name || '',
        phone,
        notes: clientRow?.notes || '',
        appointments: appts,
        stats: { totalVisits, totalSpent, attendanceRate, lastVisit },
        status: classifyStatus(lastVisit),
      }
    },
    enabled: !!phone && !!businessId,
  })
}

export function useUpdateClientNotes(businessId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ phone, notes, name }) => {
      // onConflict must target the actual UNIQUE(business_id, phone) constraint —
      // without it, Postgrest upserts against the primary key (id), which is never
      // supplied here, so it always tries to INSERT a new row and fails with a
      // duplicate-key error against the unique constraint (silently, since callers
      // didn't surface the error — notes appeared to never save).
      const { error } = await supabase
        .from('clients')
        .upsert(
          { business_id: businessId, phone, name: name || '', notes },
          { onConflict: 'business_id,phone' }
        )
      if (error) throw error
    },
    onSuccess: (_, { phone }) => {
      qc.invalidateQueries({ queryKey: ['client-profile', phone, businessId] })
    },
  })
}
