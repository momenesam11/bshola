import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { supabase } from '../lib/supabase'

// NotificationBell mounts twice at once (desktop + mobile TopBar), so both
// instances receive the same INSERT event — dedupe by id so the sound only
// plays once per actual notification.
let lastPlayedNotificationId = null
function playNotificationSound(id) {
  if (!id || id === lastPlayedNotificationId) return
  lastPlayedNotificationId = id
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // Audio API unavailable or blocked — ignore, sound is non-critical.
  }
}

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
        (payload) => {
          qc.invalidateQueries({ queryKey: ['notifications', businessId] })
          playNotificationSound(payload.new?.id)
        }
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
