import { useState, useRef, useEffect } from 'react'
import {
  HiOutlineBuildingOffice2,
  HiOutlineSquares2X2,
  HiOutlineChevronDown,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineEnvelope,
  HiOutlineLink,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { useBusiness } from '../../hooks/useBusiness'
import { useBranch, ALL_BRANCHES } from '../../context/BranchContext'
import { getBranchColor } from '../../utils/constants'
import BookingLinkActions from '../booking/BookingLinkActions'

const SUPPORT_WHATSAPP = '201021179969'
const SUPPORT_EMAIL = 'moment.esam15@gmail.com'

function BookingLinkWidget({ business }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const bookingUrl = `${window.location.origin}/book/${business.booking_slug || business.id}`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-center gap-1.5 w-9 h-9 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl md:bg-slate-50 md:border md:border-slate-200 text-sm text-slate-700 hover:bg-slate-100 transition-colors min-h-[36px]"
      >
        <HiOutlineLink className="w-[18px] h-[18px] md:w-4 md:h-4 text-slate-500 flex-shrink-0" />
        <span className="hidden sm:block">رابط حجزك</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-slate-100 rounded-xl shadow-lg p-4 z-50 min-w-[280px] space-y-3" dir="rtl">
          <p className="text-xs font-medium text-slate-500 leading-snug">رابط صفحة الحجز الخاصة بيك</p>
          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
            <span className="block text-xs text-accent-700 font-mono truncate" dir="ltr">{bookingUrl}</span>
          </div>
          <BookingLinkActions
            url={bookingUrl}
            shareMessage={`احجز موعدك مع ${business.name} بسهولة من الرابط ده 👇\n${bookingUrl}`}
          />
        </div>
      )}
    </div>
  )
}

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

  if (business.subscription_type !== 'trial' || !business.trial_ends_at) return null
  const daysLeft = Math.ceil((new Date(business.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24))
  const color = daysLeft < 3 ? 'text-red-600 bg-red-50 border-red-200' : daysLeft <= 7 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-slate-600 bg-slate-50 border-slate-200'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-2 md:px-3 py-1.5 rounded-xl md:border text-xs font-medium transition-colors min-h-[36px] ${color}`}
      >
        <HiOutlineClock className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="hidden sm:block leading-none">باقي {daysLeft > 0 ? daysLeft : 0} يوم في تجربتك المجانية</span>
        <span className="sm:hidden leading-none">{daysLeft > 0 ? daysLeft : 0} يوم</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-slate-100 rounded-xl shadow-lg p-4 z-50 min-w-[240px] space-y-3" dir="rtl">
          <p className="text-sm text-slate-700">
            تجربتك تنتهي في <strong>{new Date(business.trial_ends_at).toLocaleDateString('ar-EG')}</strong>
          </p>
          <p className="text-xs text-slate-400">تواصل معنا للاشتراك وعدم فقدان بياناتك</p>
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('أهلاً، عايز أعرف تفاصيل الاشتراك في بسهولة')}`}
            target="_blank" rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <FaWhatsapp className="w-3.5 h-3.5" />
            تواصل معنا للاشتراك
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

export default function TopBar({ title }) {
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
    <header className="h-14 bg-white border-b border-gray-100 flex items-center px-3 sm:px-6 gap-2 md:gap-3" dir="rtl">
      <img src="/logo.png" alt="بسهولة" className="md:hidden w-8 h-8 rounded-lg object-contain flex-shrink-0" />
      <h1 className="text-base font-semibold text-gray-900 flex-1">{title}</h1>

      <div className="flex items-center gap-0.5 md:gap-2">
        {business && <TrialWidget business={business} />}
        {business && <BookingLinkWidget business={business} />}
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
    </header>
  )
}
