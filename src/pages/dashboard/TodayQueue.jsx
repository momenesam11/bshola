import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { HiOutlineQueueList, HiOutlineCheck, HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { supabase } from '../../lib/supabase'
import { openWhatsApp, formatTimeArabic } from '../../lib/whatsapp'
import { useUpdateAppointment } from '../../hooks/useAppointments'
import { useBranch } from '../../context/branchState'
import { todayISO } from '../../utils/dateHelpers'
import { dueForNotice, notifyAheadOf, queueMessage, waitingQueue } from '../../lib/queue'

// Today's waiting patients in booking-time order (migration 053). Under the
// 'appointments' key, so any change to an appointment refreshes it.
function useTodayAppointments(businessId) {
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

// onOpen opens the appointment, like a click on it in the calendar.
export default function TodayQueue({ business, onOpen }) {
  const branchCtx = useBranch()
  const branchId = branchCtx?.currentBranch?.isAll ? null : branchCtx?.currentBranch?.id || null
  const { data: today = [] } = useTodayAppointments(business?.id)
  const update = useUpdateAppointment()
  const [busyId, setBusyId] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  const queue = waitingQueue(today, branchId)
  if (!business || !queue.length) return null
  const ahead = notifyAheadOf(business)
  const due = dueForNotice(queue, ahead)

  async function sendPlace(appt, placeAhead) {
    if (!openWhatsApp(appt.client_phone, queueMessage(appt, placeAhead, business, appt.branches))) {
      toast.error('المتصفح منع فتح واتساب — اسمح بالنوافذ المنبثقة وجرّب تاني')
      return
    }
    setBusyId(appt.id)
    try {
      await update.mutateAsync({ id: appt.id, queue_notified_at: new Date().toISOString() })
    } catch (e) {
      toast.error(e?.message || 'اتبعتت الرسالة بس ما اتسجلتش')
    } finally {
      setBusyId(null)
    }
  }

  async function setStatus(appt, status) {
    setBusyId(appt.id)
    try {
      await update.mutateAsync({ id: appt.id, status })
      toast.success(status === 'completed' ? `${appt.client_name} خلص` : `${appt.client_name} اتسجل إنه ما جاش`)
    } catch (e) {
      toast.error(e?.message || 'تعذر الحفظ')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div data-testid="today-queue" className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4" dir="rtl">
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer select-none" onClick={() => setCollapsed(c => !c)}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <HiOutlineQueueList className="w-5 h-5 text-violet-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 text-sm">الدور النهارده</h2>
              <span className="text-xs font-bold leading-none px-2 py-1 rounded-full bg-violet-500 text-white">{queue.length}</span>
            </div>
            <p className="text-xs text-slate-400">بترتيب ميعاد الحجز. دوس «خلص» لما المريض يطلع، وابعت للي بقى قدامه {ahead}</p>
          </div>
        </div>
        {collapsed ? <HiOutlineChevronDown className="w-4 h-4 text-slate-400" /> : <HiOutlineChevronUp className="w-4 h-4 text-slate-400" />}
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-50 pt-3">
          {due && (
            <div data-testid="queue-due" className="flex flex-wrap items-center justify-between gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5">
              <p className="text-sm text-violet-900">
                <b>{due.client_name}</b> بقى قدامه {ahead}. ابعتله يتحرك.
              </p>
              <button onClick={() => sendPlace(due, ahead)} disabled={busyId === due.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-xl transition-colors min-h-[36px] disabled:opacity-60">
                <FaWhatsapp className="w-3.5 h-3.5" />
                ابعتله
              </button>
            </div>
          )}

          {queue.map((a, i) => (
            <div key={a.id} data-testid="queue-row" className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border ${i === 0 ? 'border-violet-200 bg-violet-50/40' : 'border-slate-100'}`}>
              <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0 tabular-nums">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <button type="button" onClick={() => onOpen?.(a)} className="font-semibold text-sm text-slate-900 break-words text-right hover:underline">{a.client_name}</button>
                <p className="text-xs text-slate-400">
                  {formatTimeArabic(a.appointment_time)}
                  {a.services?.name ? ` · ${a.services.name}` : ''}
                  {i === 0 ? ' · دوره دلوقتي' : ` · قدامه ${i}`}
                  {a.queue_notified_at ? ' · اتبعتله' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => sendPlace(a, i)} disabled={busyId === a.id} title="ابعتله دوره"
                  className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-60">
                  <FaWhatsapp className="w-4 h-4" />
                </button>
                <button onClick={() => setStatus(a, 'no_show')} disabled={busyId === a.id}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-60">
                  ما جاش
                </button>
                <button onClick={() => setStatus(a, 'completed')} disabled={busyId === a.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60">
                  <HiOutlineCheck className="w-3.5 h-3.5" />
                  خلص
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
