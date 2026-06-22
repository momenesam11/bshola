import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineLink,
  HiOutlineXMark,
  HiOutlineClock,
  HiOutlineEnvelope,
  HiOutlineSquares2X2,
  HiOutlineBuildingOffice2,
  HiOutlineCheck,
  HiOutlineChevronDown,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { supabase } from '../../lib/supabase'
import { useBusiness } from '../../hooks/useBusiness'
import { useBranch, ALL_BRANCHES } from '../../context/BranchContext'
import { getBranchColor } from '../../utils/constants'
import { NAV_ITEMS } from './navItems'
import BookingLinkActions from '../booking/BookingLinkActions'

// Collapsible — closed by default, tap the header to open/close the branch list
function BranchSwitcherSection({ branchCtx }) {
  const [open, setOpen] = useState(false)
  const currentBranch = branchCtx?.currentBranch
  const branches = branchCtx?.branches || []
  if (!branchCtx?.isMultiBranch || !currentBranch) return null

  return (
    <div className="mx-4 mt-4 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-3 text-sm"
      >
        {currentBranch.isAll ? (
          <HiOutlineSquares2X2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getBranchColor(currentBranch.id, branches).dot}`} />
        )}
        <span className="text-xs font-semibold text-slate-500">الفرع:</span>
        <span className="flex-1 text-right font-medium text-slate-800 truncate">{currentBranch.name}</span>
        <HiOutlineChevronDown className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-1 border-t border-slate-100 pt-2">
          <button
            onClick={() => { branchCtx.setCurrentBranch(ALL_BRANCHES); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm hover:bg-white transition-colors"
          >
            <HiOutlineSquares2X2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="flex-1 text-right font-medium">كل الفروع</span>
            {currentBranch.isAll && <HiOutlineCheck className="w-4 h-4 text-accent-500 flex-shrink-0" />}
          </button>
          {branches.map(branch => (
            <button
              key={branch.id}
              onClick={() => { branchCtx.setCurrentBranch(branch); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm hover:bg-white transition-colors"
            >
              <HiOutlineBuildingOffice2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getBranchColor(branch.id, branches).dot}`} />
              <span className="flex-1 text-right truncate">{branch.name}</span>
              {!currentBranch.isAll && currentBranch.id === branch.id && (
                <HiOutlineCheck className="w-4 h-4 text-accent-500 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SUPPORT_WHATSAPP = '201021179969'
const SUPPORT_EMAIL = 'moment.esam15@gmail.com'

function TrialSection({ business }) {
  if (!business.trial_ends_at) return null
  const isPaid = business.subscription_type === 'paid'
  const daysLeft = Math.ceil((new Date(business.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24))
  const color = daysLeft < 3 ? 'bg-red-50 border-red-200 text-red-700' : daysLeft <= 7 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-700'
  const periodLabel = isPaid ? 'اشتراكك' : 'تجربتك المجانية'

  return (
    <div className={`mx-4 mt-4 p-3.5 rounded-2xl border ${color}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <HiOutlineClock className="w-4 h-4 flex-shrink-0" />
        باقي {daysLeft > 0 ? daysLeft : 0} يوم في {periodLabel}
      </div>
      <div className="flex flex-col gap-2 mt-3">
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(isPaid ? 'أهلاً، عايز أجدد اشتراكي في بسهولة' : 'أهلاً، عايز أعرف تفاصيل الاشتراك في بسهولة')}`}
          target="_blank" rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
        >
          <FaWhatsapp className="w-4 h-4 flex-shrink-0" />
          {isPaid ? 'تجديد الاشتراك' : 'تواصل للاشتراك'}
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('استفسار اشتراك - بسهولة')}`}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
        >
          <HiOutlineEnvelope className="w-4 h-4 flex-shrink-0" />
          بالإيميل
        </a>
      </div>
    </div>
  )
}

export default function MobileDrawer({ open, onClose }) {
  const navigate = useNavigate()
  const { data: business } = useBusiness()
  const branchCtx = useBranch()

  async function handleLogout() {
    await supabase.auth.signOut()
    onClose()
    navigate('/login')
  }

  const bookingUrl = business ? `${window.location.origin}/book/${business.booking_slug || business.id}` : null

  return (
    <div
      className={`md:hidden fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Panel — slides in from the right (leading edge in RTL) */}
      <aside
        className={`absolute top-0 right-0 h-full w-[80%] max-w-[320px] bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        dir="rtl"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/logo.png" alt="بسهولة" className="w-[75px]  rounded-xl object-contain flex-shrink-0" />
            {business && <p className="text-sm text-slate-500 truncate">{business.name}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            aria-label="إغلاق القائمة"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Trial / subscription status */}
          {business && <TrialSection business={business} />}

          {/* Branch switcher — only if multi-branch */}
          <BranchSwitcherSection branchCtx={branchCtx} />

          {/* Nav */}
          <nav className="px-3 py-4 space-y-1">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3.5 rounded-xl text-base transition-colors min-h-[48px] ${
                    isActive
                      ? 'bg-accent-50 text-accent-700 font-bold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
              >
                {({ isActive }) => {
                  const Icon = item.icon
                  return (
                    <>
                      <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-accent-600' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </>
                  )
                }}
              </NavLink>
            ))}
          </nav>

          {/* Booking link — copy / share */}
          {business && (
            <div className="mx-4 mb-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <HiOutlineLink className="w-3.5 h-3.5" />
                رابط صفحة الحجز
              </p>
              <div className="bg-white rounded-xl px-3 py-2.5 border border-slate-200">
                <span className="block text-xs text-accent-700 font-mono truncate" dir="ltr">{bookingUrl}</span>
              </div>
              <BookingLinkActions
                url={bookingUrl}
                shareMessage={`احجز موعدك مع ${business.name} بسهولة من الرابط ده 👇\n${bookingUrl}`}
                stacked
              />
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-base text-red-500 hover:bg-red-50 transition-colors min-h-[48px]"
          >
            <HiOutlineArrowRightOnRectangle className="w-5 h-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </div>
  )
}
