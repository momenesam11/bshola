import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { supabase } from '../lib/supabase'

export function useNotifications(businessId) {
  const qc = useQueryClient()
  // NotificationBell is mounted twice at once (desktop + mobile TopBar,
  // both in the DOM simultaneously — only CSS-hidden), so each hook
  // instance needs its own channel name. Two channels sharing the same
  // name throws "cannot add postgres_changes callbacks ... after subscribe()".
  const instanceId = useId()

  const query = useQuery({
    queryKey: ['notifications', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
    enabled: !!businessId,
  })

  useEffect(() => {
    if (!businessId) return
    const channel = supabase
      .channel(`notifications-${businessId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `business_id=eq.${businessId}` },
        () => qc.invalidateQueries({ queryKey: ['notifications', businessId] })
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [businessId, instanceId, qc])

  return query
}

export function useUnreadNotificationCount(businessId) {
  const { data: notifications = [] } = useNotifications(businessId)
  return notifications.filter(n => !n.is_read).length
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notificationId) => {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
      if (error) throw error
    },
    onSuccess: (_, notificationId) => {
      qc.setQueriesData({ queryKey: ['notifications'] }, (old) =>
        old?.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      )
    },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (businessId) => {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('business_id', businessId).eq('is_read', false)
      if (error) throw error
    },
    onSuccess: (_, businessId) => {
      qc.setQueryData(['notifications', businessId], (old) => old?.map(n => ({ ...n, is_read: true })))
    },
  })
}
