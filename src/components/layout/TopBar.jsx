import { useState, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ar } from 'date-fns/locale'
import {
  HiOutlineBuildingOffice2,
  HiOutlineSquares2X2,
  HiOutlineChevronDown,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineEnvelope,
  HiOutlineBars3,
  HiOutlineBell,
  HiOutlineCalendarDays,
  HiOutlineXCircle,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { useBusiness } from '../../hooks/useBusiness'
import { useBranch, ALL_BRANCHES } from '../../context/BranchContext'
import { getBranchColor } from '../../utils/constants'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../../hooks/useNotifications'
import NotificationDetailModal from './NotificationDetailModal'

const NOTIFICATION_ICONS = {
  new_booking: { Icon: HiOutlineCalendarDays, color: 'text-accent-600 bg-accent-50' },
  cancellation: { Icon: HiOutlineXCircle, color: 'text-red-500 bg-red-50' },
  waitlist_joined: { Icon: HiOutlineClock, color: 'text-amber-500 bg-amber-50' },
}

function NotificationBell({ business }) {
  const [open, setOpen] = useState(false)
  const [detailNotification, setDetailNotification] = useState(null)
  const ref = useRef(null)
  const { data: notifications = [] } = useNotifications(business.id)
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const unreadCount = notifications.filter(n => !n.is_read).length

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleNotificationClick(n) {
    if (!n.is_read) markRead.mutate(n.id)
    setOpen(false)
    if (n.related_appointment_id) setDetailNotification(n)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors min-h-[36px]"
        aria-label="الإشعارات"
      >
        <HiOutlineBell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute top-1 left-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-slate-100 rounded-xl shadow-lg z-50 min-w-[320px] max-w-[90vw]" dir="rtl">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-900">الإشعارات</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate(business.id)}
                className="text-xs text-accent-600 hover:underline"
              >
                تحديد الكل كمقروء
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">لا توجد إشعارات</p>
            ) : (
              notifications.map(n => {
                const cfg = NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.new_booking
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full flex items-start gap-2.5 px-4 py-3 text-right hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${!n.is_read ? 'bg-accent-50/40' : ''}`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                      <cfg.Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${!n.is_read ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{n.title}</span>
                      {n.body && <span className="block text-xs text-slate-500 truncate mt-0.5">{n.body}</span>}
                      <span className="block text-[11px] text-slate-400 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ar })}
                      </span>
                    </span>
                    {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0 mt-1.5" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      <NotificationDetailModal
        open={!!detailNotification}
        onClose={() => setDetailNotification(null)}
        notification={detailNotification}
        business={business}
      />
    </div>
  )
}

const SUPPORT_WHATSAPP = '201021179969'
const SUPPORT_EMAIL = 'moment.esam15@gmail.com'

function TrialWidget({ business }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!business.trial_ends_at) return null
  const isPaid = business.subscription_type === 'paid'
  const daysLeft = Math.ceil((new Date(business.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24))
  const color = daysLeft < 3 ? 'text-red-600 bg-red-50 border-red-200' : daysLeft <= 7 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-slate-600 bg-slate-50 border-slate-200'
  const periodLabel = isPaid ? 'اشتراكك' : 'تجربتك المجانية'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-2 md:px-3 py-1.5 rounded-xl md:border text-xs font-medium transition-colors min-h-[36px] ${color}`}
      >
        <HiOutlineClock className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="hidden sm:block leading-none">باقي {daysLeft > 0 ? daysLeft : 0} يوم في {periodLabel}</span>
        <span className="sm:hidden leading-none">{daysLeft > 0 ? daysLeft : 0} يوم</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-slate-100 rounded-xl shadow-lg p-4 z-50 min-w-[240px] space-y-3" dir="rtl">
          <p className="text-sm text-slate-700">
            {periodLabel} تنتهي في <strong>{new Date(business.trial_ends_at).toLocaleDateString('ar-EG')}</strong>
          </p>
          <p className="text-xs text-slate-400">{isPaid ? 'تواصل معنا لتجديد اشتراكك وعدم فقدان بياناتك' : 'تواصل معنا للاشتراك وعدم فقدان بياناتك'}</p>
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(isPaid ? 'أهلاً، عايز أجدد اشتراكي في بسهولة' : 'أهلاً، عايز أعرف تفاصيل الاشتراك في بسهولة')}`}
            target="_blank" rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <FaWhatsapp className="w-3.5 h-3.5" />
            {isPaid ? 'تواصل معنا لتجديد الاشتراك' : 'تواصل معنا للاشتراك'}
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('استفسار اشتراك - بسهولة')}`}
            className="w-full flex items-center justify-center gap-2 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg transition-colors"
          >
            <HiOutlineEnvelope className="w-3.5 h-3.5" />
            تواصل بالإيميل
          </a>
        </div>
      )}
    </div>
  )
}

export default function TopBar({ title, onMenuClick }) {
  const { data: business } = useBusiness()
  const branchCtx = useBranch()
  const [open, setOpen] = useState(false)
  const dropRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isMultiBranch = branchCtx?.isMultiBranch
  const currentBranch = branchCtx?.currentBranch
  const branches = branchCtx?.branches || []

  return (
    <header className="h-14 bg-white border-b border-gray-100 px-3 sm:px-6 sticky top-0 z-20 md:static" dir="rtl">
      {/* Mobile: logo (right) — page title (center) — drawer button (left) */}
      <div className="md:hidden h-14 flex items-center justify-between gap-2">
        <img src="/logo.png" alt="بسهولة" className="w-[65px] rounded-xl object-contain flex-shrink-0" />
        <h1 className="flex-1 text-center text-base font-bold text-gray-900 truncate px-1">{title}</h1>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {business && <NotificationBell business={business} />}
          <button
            onClick={onMenuClick}
            className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            aria-label="القائمة"
          >
            <HiOutlineBars3 className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Desktop/tablet: original layout, unchanged */}
      <div className="hidden md:flex h-14 items-center gap-3">
      <h1 className="text-base font-semibold text-gray-900 flex-1">{title}</h1>

      <div className="flex items-center gap-0.5 md:gap-2">
        {business && <NotificationBell business={business} />}
        {business && <TrialWidget business={business} />}
        {/* Branch switcher — only if multi-branch */}
        {isMultiBranch && currentBranch && (
          <div className="relative" ref={dropRef}>
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded-xl md:bg-slate-50 md:border md:border-slate-200 text-sm text-slate-700 hover:bg-slate-100 transition-colors min-h-[36px]"
            >
              {currentBranch.isAll ? (
                <HiOutlineSquares2X2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
              ) : (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getBranchColor(currentBranch.id, branches).dot}`} />
              )}
              <span className="max-w-[120px] truncate hidden sm:block">{currentBranch.name}</span>
              <HiOutlineChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="absolute top-full mt-1 right-0 bg-white border border-slate-100 rounded-xl shadow-lg py-1 z-50 min-w-[180px]">
                <button
                  onClick={() => { branchCtx.setCurrentBranch(ALL_BRANCHES); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-right hover:bg-slate-50 transition-colors border-b border-slate-50"
                >
                  <HiOutlineSquares2X2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 truncate font-medium">كل الفروع</span>
                  {currentBranch.isAll && <HiOutlineCheck className="w-4 h-4 text-accent-500 flex-shrink-0" />}
                </button>
                {branches.map(branch => (
                  <button
                    key={branch.id}
                    onClick={() => { branchCtx.setCurrentBranch(branch); setOpen(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-right hover:bg-slate-50 transition-colors"
                  >
                    <HiOutlineBuildingOffice2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getBranchColor(branch.id, branches).dot}`} />
                    <span className="flex-1 truncate">{branch.name}</span>
                    {!currentBranch.isAll && currentBranch.id === branch.id && (
                      <HiOutlineCheck className="w-4 h-4 text-accent-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Business avatar */}
        {business && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-accent-100 rounded-full flex items-center justify-center text-accent-700 text-xs font-bold leading-none flex-shrink-0">
              {business.name.charAt(0)}
            </div>
            <span className="text-sm text-gray-600 hidden sm:block truncate max-w-[120px]">{business.name}</span>
          </div>
        )}
      </div>
      </div>
    </header>
  )
}
