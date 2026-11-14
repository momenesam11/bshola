import { useState } from 'react'
import toast from 'react-hot-toast'
import { HiOutlineCheck } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { openWhatsApp, formatTimeArabic } from '../../lib/whatsapp'
import { useUpdateAppointment } from '../../hooks/useAppointments'
import { dueForNotice, notifyAheadOf, queueMessage } from '../../lib/queue'

// The "الدور" tab of the dashboard's today card (migration 053). `queue` is
// today's waiting patients of the branch, in booking-time order. onOpen opens
// an appointment, like a click on it in the calendar.
export default function TodayQueue({ business, queue, onOpen }) {
  const update = useUpdateAppointment()
  const [busyId, setBusyId] = useState(null)
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
    <div data-testid="today-queue" className="space-y-2" dir="rtl">
      <p className="text-xs text-slate-400">بترتيب ميعاد الحجز. «خلص» لما المريض يطلع.</p>
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

      {/* On a phone the buttons sit under the name, wide enough for a thumb. */}
      {queue.map((a, i) => (
        <div key={a.id} data-testid="queue-row" className={`flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2.5 px-3 py-3 sm:py-2.5 rounded-2xl border ${i === 0 ? 'border-violet-200 bg-violet-50/40' : 'border-slate-100 bg-white'}`}>
          <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 text-sm font-bold flex items-center justify-center flex-shrink-0 tabular-nums">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <button type="button" onClick={() => onOpen?.(a)} className="font-bold sm:font-semibold text-[15px] sm:text-sm text-slate-900 break-words text-right hover:underline">{a.client_name}</button>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-slate-500">
              <span className="tabular-nums">{formatTimeArabic(a.appointment_time)}</span>
              {a.services?.name && <span>· {a.services.name}</span>}
              {i === 0
                ? <span className="px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 font-semibold">دوره دلوقتي</span>
                : <span>· قدامه {i}</span>}
              {a.queue_notified_at && <span className="px-1.5 py-0.5 rounded-md bg-green-50 text-green-700">اتبعتله</span>}
            </div>
          </div>
          <div className="w-full sm:w-auto flex items-center gap-2 sm:gap-1 flex-shrink-0">
            <button onClick={() => sendPlace(a, i)} disabled={busyId === a.id} title="ابعتله دوره" aria-label="ابعتله دوره"
              className="h-11 sm:h-auto w-11 sm:w-auto sm:p-2 flex items-center justify-center rounded-xl sm:rounded-lg border border-green-200 sm:border-0 text-green-600 hover:bg-green-50 transition-colors disabled:opacity-60">
              <FaWhatsapp className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
            <button onClick={() => setStatus(a, 'no_show')} disabled={busyId === a.id}
              className="flex-1 sm:flex-none h-11 sm:h-auto px-2.5 sm:py-1.5 rounded-xl sm:rounded-lg border border-amber-200 sm:border-0 text-sm sm:text-xs font-semibold sm:font-medium text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-60">
              ما جاش
            </button>
            <button onClick={() => setStatus(a, 'completed')} disabled={busyId === a.id}
              className="flex-[2] sm:flex-none h-11 sm:h-auto flex items-center justify-center gap-1 px-2.5 sm:py-1.5 rounded-xl sm:rounded-lg text-sm sm:text-xs font-bold sm:font-semibold bg-blue-600 sm:bg-blue-50 text-white sm:text-blue-700 hover:bg-blue-700 sm:hover:bg-blue-100 transition-colors disabled:opacity-60">
              <HiOutlineCheck className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              خلص
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
