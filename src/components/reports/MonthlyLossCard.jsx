import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { HiOutlineExclamationTriangle, HiOutlineCheck, HiOutlineBell } from 'react-icons/hi2'
import { startOfMonth, endOfMonth } from 'date-fns'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useServices } from '../../hooks/useBusiness'
import { toISODateString } from '../../utils/dateHelpers'

export default function MonthlyLossCard({ businessId, hasReminders }) {
  const navigate = useNavigate()
  const today = new Date()
  const from = toISODateString(startOfMonth(today))
  const to = toISODateString(endOfMonth(today))

  const { data: appointments = [], isLoading } = useAllAppointments(businessId, { from, to })
  const { data: services = [] } = useServices(businessId)

  const avgPrice = useMemo(() => {
    if (!services.length) return 0
    const priced = services.filter(s => s.price)
    if (!priced.length) return 0
    return Math.round(priced.reduce((s, svc) => s + svc.price, 0) / priced.length)
  }, [services])

  const { noShowCount, lossAmount, remindersSent, savedAmount } = useMemo(() => {
    const noShows = appointments.filter(a => a.status === 'no_show')
    const confirmed = appointments.filter(a =>
      a.status === 'completed' && a.reminder_sent === true
    )
    return {
      noShowCount: noShows.length,
      lossAmount: noShows.length * avgPrice,
      remindersSent: confirmed.length,
      savedAmount: confirmed.length * avgPrice,
    }
  }, [appointments, avgPrice])

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 animate-pulse mb-6">
        <div className="h-4 bg-slate-100 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-red-50 rounded-xl" />
          <div className="h-24 bg-accent-50 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6" dir="rtl">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* Loss side */}
        <div className="bg-red-50 p-6 border-b sm:border-b-0 sm:border-l border-red-100">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <HiOutlineExclamationTriangle className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mt-2">خسرت هذا الشهر</p>
          </div>
          <p className="text-4xl font-bold text-red-600 leading-none">{lossAmount.toLocaleString()}</p>
          <p className="text-sm text-red-400 mt-1">جنيه</p>
          <p className="text-xs text-red-500 mt-2">من {noShowCount} غياب</p>
        </div>

        {/* Saved side */}
        <div className="bg-accent-50 p-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-accent-100 flex items-center justify-center flex-shrink-0">
              <HiOutlineCheck className="w-5 h-5 text-accent-500" />
            </div>
            <p className="text-xs font-semibold text-accent-600 uppercase tracking-wide mt-2">وفّرت بالتذكير</p>
          </div>
          <p className="text-4xl font-bold text-accent-600 leading-none">{savedAmount.toLocaleString()}</p>
          <p className="text-sm text-accent-400 mt-1">جنيه</p>
          <p className="text-xs text-accent-500 mt-2">من {remindersSent} تذكير أُرسل</p>
        </div>
      </div>

      {/* CTA if reminders are off */}
      {!hasReminders && (
        <div className="px-6 py-4 bg-amber-50 border-t border-amber-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <HiOutlineBell className="w-4 h-4 flex-shrink-0" />
            <span>التذكير التلقائي غير مفعّل — أنت بتخسر بلاش</span>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-2 rounded-lg whitespace-nowrap transition-colors min-h-[36px]"
          >
            فعّل الآن
          </button>
        </div>
      )}
    </div>
  )
}
