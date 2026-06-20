import { useState } from 'react'
import { format, addDays } from 'date-fns'
import { ar } from 'date-fns/locale'
import {
  HiOutlineBell,
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlineBuildingOffice2,
  HiOutlineCheck,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { useTomorrowsAppointments } from '../../hooks/useAppointments'
import { useBranch } from '../../context/BranchContext'
import { supabase } from '../../lib/supabase'
import { generateReminderMessage, openWhatsApp, formatTimeArabic } from '../../lib/whatsapp'

function ReminderCard({ appt, business, onSent }) {
  const [sent, setSent] = useState(appt.reminder_sent)
  const [loading, setLoading] = useState(false)

  async function handleSend() {
    setLoading(true)
    try {
      const msg = generateReminderMessage(
        appt,
        business,
        appt.branches || null
      )
      openWhatsApp(appt.client_phone, msg)
      await supabase.from('appointments').update({ reminder_sent: true }).eq('id', appt.id)
      setSent(true)
      onSent?.(appt.id)
    } finally {
      setLoading(false)
    }
  }

  const initials = (appt.client_name || '').slice(0, 2)
  const time = formatTimeArabic(appt.appointment_time)

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 sm:py-3 rounded-2xl border transition-all ${
        sent ? 'bg-accent-50 border-accent-100' : 'bg-white border-slate-100'
      }`}
      dir="rtl"
    >
      {/* Avatar — hidden on mobile, kept on desktop/tablet */}
      <div className="hidden sm:flex sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 items-center justify-center text-white font-bold text-sm leading-none flex-shrink-0">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[15px] sm:text-sm sm:font-semibold text-slate-900 truncate">{appt.client_name}</p>
        <div className="flex items-center flex-wrap gap-2 mt-1 sm:mt-0.5">
          {appt.services?.name && (
            <span className="text-sm sm:text-xs text-slate-500 truncate">{appt.services.name}</span>
          )}
          <span className="flex items-center gap-0.5 text-sm sm:text-xs text-slate-400 font-mono">
            <HiOutlineClock className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
            {time}
          </span>
          {appt.branches?.name && (
            <span className="flex items-center gap-0.5 text-sm sm:text-xs text-slate-400">
              <HiOutlineBuildingOffice2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
              {appt.branches.name}
            </span>
          )}
        </div>
      </div>

      {/* Send button / sent state */}
      {sent ? (
        <div className="flex items-center gap-1 text-xs font-semibold text-accent-600 flex-shrink-0">
          <HiOutlineCheck className="w-4 h-4" />
          تم
        </div>
      ) : (
        <button
          onClick={handleSend}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-xl transition-colors flex-shrink-0 min-h-[36px] disabled:opacity-60"
        >
          <FaWhatsapp className="w-3.5 h-3.5" />
          تذكير
        </button>
      )}
    </div>
  )
}

// "Send All" sequential modal
function SendAllModal({ appts, business, onDone, onClose }) {
  const [idx, setIdx] = useState(0)
  const [sentIds, setSentIds] = useState(new Set())
  const current = appts[idx]
  const total = appts.length

  async function sendCurrent() {
    const msg = generateReminderMessage(current, business, current.branches || null)
    openWhatsApp(current.client_phone, msg)
    await supabase.from('appointments').update({ reminder_sent: true }).eq('id', current.id)
    setSentIds(prev => new Set([...prev, current.id]))
  }

  function next() {
    if (idx < total - 1) setIdx(i => i + 1)
    else { onDone(sentIds); onClose() }
  }

  const isLast = idx === total - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        {/* Progress */}
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">إرسال الكل</h3>
          <span className="text-sm font-medium text-slate-500">{idx + 1} من {total}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-accent-500 rounded-full transition-all" style={{ width: `${((idx + 1) / total) * 100}%` }} />
        </div>

        {/* Current client */}
        <div className="bg-slate-50 rounded-2xl p-4 text-center space-y-1">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white font-bold text-lg leading-none mx-auto mb-2">
            {(current?.client_name || '').slice(0, 2)}
          </div>
          <p className="font-bold text-slate-900">{current?.client_name}</p>
          <p className="text-sm text-slate-500">{current?.services?.name} · {formatTimeArabic(current?.appointment_time)}</p>
        </div>

        {!sentIds.has(current?.id) ? (
          <button onClick={sendCurrent}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent-500 hover:bg-accent-600 text-white font-bold rounded-xl transition-colors min-h-[52px]">
            <FaWhatsapp className="w-5 h-5" />
            افتح واتساب لـ {current?.client_name}
          </button>
        ) : (
          <button onClick={next}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-xl transition-colors min-h-[52px]">
            <HiOutlineCheck className="w-5 h-5" />
            {isLast ? 'إنهاء' : 'التالي'}
          </button>
        )}

        <button onClick={onClose} className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors">
          إلغاء
        </button>
      </div>
    </div>
  )
}

export default function TomorrowReminders({ businessId, business }) {
  const branchCtx = useBranch()
  const branchId = branchCtx?.currentBranch?.id || null
  const { data: tomorrowMap = new Map(), isLoading } = useTomorrowsAppointments(businessId)
  const [sentIds, setSentIds] = useState(new Set())
  const [collapsed, setCollapsed] = useState(false)
  const [showSendAll, setShowSendAll] = useState(false)

  const tomorrow = addDays(new Date(), 1)
  const tomorrowLabel = format(tomorrow, 'EEEE، d MMMM', { locale: ar })

  // Convert map to array, filter by branch if needed
  let appts = Array.from(tomorrowMap.values())
  if (branchId) appts = appts.filter(a => a.branch_id === branchId || !a.branch_id)

  const pendingCount = appts.filter(a => !sentIds.has(a.id) && !a.reminder_sent).length

  function markSent(id) {
    setSentIds(prev => new Set([...prev, id]))
  }

  if (isLoading) return null

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4" dir="rtl">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <HiOutlineBell className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 text-sm">تذكيرات بكرا</h2>
              {pendingCount > 0 && (
                <span className="text-xs font-bold leading-none px-2 py-1 rounded-full bg-blue-500 text-white">
                  {pendingCount}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">{tomorrowLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && appts.length > 1 && pendingCount > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setShowSendAll(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              <FaWhatsapp className="w-3.5 h-3.5" />
              إرسال الكل
            </button>
          )}
          {collapsed
            ? <HiOutlineChevronDown className="w-4 h-4 text-slate-400" />
            : <HiOutlineChevronUp className="w-4 h-4 text-slate-400" />
          }
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-50 pt-3">
          {appts.length === 0 ? (
            <div className="py-6 text-center space-y-1">
              <HiOutlineCalendarDays className="w-10 h-10 text-slate-200 mx-auto" />
              <p className="text-slate-400 text-sm font-medium">مفيش مواعيد بكرا</p>
              <p className="text-slate-300 text-xs">استمتع بيومك 😊</p>
            </div>
          ) : (
            appts.map(appt => (
              <ReminderCard
                key={appt.id}
                appt={appt}
                business={business}
                onSent={markSent}
              />
            ))
          )}
        </div>
      )}

      {showSendAll && (
        <SendAllModal
          appts={appts.filter(a => !sentIds.has(a.id) && !a.reminder_sent)}
          business={business}
          onDone={ids => setSentIds(prev => new Set([...prev, ...ids]))}
          onClose={() => setShowSendAll(false)}
        />
      )}
    </div>
  )
}
