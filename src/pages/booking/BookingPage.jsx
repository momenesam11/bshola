import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'
import {
  HiOutlineClock,
  HiOutlineCheck,
  HiOutlineCalendarDays,
  HiOutlineWrenchScrewdriver,
  HiOutlineGlobeAlt,
  HiOutlineChevronRight,
  HiOutlineStar,
  HiOutlinePhone,
  HiOutlineLockClosed,
  HiOutlineSparkles,
  HiOutlineExclamationCircle,
} from 'react-icons/hi2'
import { FaInstagram, FaFacebook } from 'react-icons/fa'
import { usePublicBusiness, usePublicServices, usePublicBranches, isBusinessLocked } from '../../hooks/useBusiness'
import { useBusyRanges, useCreateAppointment } from '../../hooks/useAppointments'
import { bookingClientSchema } from '../../lib/validators'
import { supabase } from '../../lib/supabase'
import Seo from '../../components/seo/Seo'
import { bookingFooterPath } from '../../lib/growth/links'
import { bookableDates } from '../../lib/bookingWindow'
import {
  getDayKey, getDayPeriods, getServiceSlots, getSlotStep, branchHasScheduleBlocks,
  formatTime12, toISODateString, todayISO,
} from '../../utils/dateHelpers'
import { periodLabel, periodName, periodStatus } from '../../lib/queueBooking'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import PhoneInput from '../../components/ui/PhoneInput'
import { displayPhone, formatMoney, telHref } from '../../lib/countries'

const STEP_SERVICE = 0
const STEP_DATETIME = 1
const STEP_CLIENT = 2
const STEP_LABELS = ['الخدمة', 'الموعد', 'بياناتك']

function StepProgress({ step, brandColor }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-400">خطوة {step + 1} من {STEP_LABELS.length}</span>
        <span className="text-xs font-bold" style={{ color: brandColor }}>{STEP_LABELS[step]}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%`, backgroundColor: brandColor }}
        />
      </div>
    </div>
  )
}

function BackButton({ onClick }) {
  return (
    <button onClick={onClick} className="text-gray-400 hover:text-gray-600 min-h-[40px] min-w-[40px] flex items-center justify-center -mr-1.5 transition-colors">
      <HiOutlineChevronRight className="w-5 h-5 rotate-180" />
    </button>
  )
}

function SocialRow({ business }) {
  const links = [
    business.google_reviews_url && { href: business.google_reviews_url, Icon: HiOutlineGlobeAlt, label: 'Google' },
    business.instagram_url && { href: business.instagram_url, Icon: FaInstagram, label: 'Instagram' },
    business.facebook_url && { href: business.facebook_url, Icon: FaFacebook, label: 'Facebook' },
  ].filter(Boolean)
  if (!links.length) return null
  return (
    <div className="flex items-center justify-center gap-2 mt-3">
      {links.map(({ href, Icon, label }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors">
          <Icon className="w-3.5 h-3.5" /> {label}
        </a>
      ))}
    </div>
  )
}

const DAY_LABELS_AR = { sat: 'السبت', sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة' }
const DAYS_ORDER_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']

function getOpenDaysSummary(branch, workingHours) {
  const useBlocks = branchHasScheduleBlocks(branch?.schedule_blocks)
  const openDays = DAYS_ORDER_KEYS.filter(key =>
    useBlocks ? (branch.schedule_blocks?.[key]?.length || 0) > 0 : !!workingHours?.[key]?.active
  )
  if (!openDays.length) return null
  if (openDays.length === 7) return 'مفتوح كل أيام الأسبوع'
  return `مفتوح ${openDays.map(d => DAY_LABELS_AR[d]).join('، ')}`
}

// lastDate is the clinic's booking window (migration 055); without one the
// page offers the next 30 open days, as it always did.
function generateAvailableDates(branch, workingHours, lastDate = null) {
  const useBlocks = branchHasScheduleBlocks(branch?.schedule_blocks)
  const isOpen = (d) => {
    const key = getDayKey(d)
    return useBlocks ? (branch.schedule_blocks?.[key]?.length || 0) > 0 : !!workingHours?.[key]?.active
  }
  return bookableDates(new Date(), isOpen, toISODateString, lastDate)
}

// The last day patients may book, in the clinic's own time zone, or null.
function useLastBookableDate(businessId) {
  return useQuery({
    queryKey: ['last-bookable-date', businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('last_bookable_date', { p_business_id: businessId })
      // Before 055 runs the function doesn't exist: keep the old behaviour.
      if (error) return null
      return data || null
    },
  })
}

// A queue clinic's periods for the chosen day (057): the number the visitor
// would get, how many took one, and on the day itself who is inside now.
function QueuePeriodList({ periods, stats, limit, dateStr, brandColor, onPick, onWaitlist }) {
  const isToday = dateStr === todayISO()
  const rows = periods.map(p => ({ p, st: periodStatus(p, stats[String(p.start).slice(0, 5)], limit, { dateStr }) }))
  const anyOpen = rows.some(r => !r.st.full && !r.st.over)
  return (
    <div className="space-y-2.5" data-testid="queue-periods">
      {rows.map(({ p, st }) => {
        const closed = st.full || st.over
        return (
          <button key={p.start} type="button" disabled={closed} onClick={() => onPick(p)} data-testid="queue-period"
            className={`w-full text-right rounded-2xl border-2 p-4 transition-all ${closed ? 'border-slate-200 bg-slate-50 cursor-not-allowed' : 'border-gray-200 hover:border-[var(--brand-color)] active:scale-[0.99]'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{periodName(p)}</p>
                <p className="text-sm text-gray-500">{periodLabel(p)}</p>
              </div>
              {!closed && (
                <div className="text-center flex-shrink-0">
                  <p className="text-[11px] text-gray-400">هتاخد رقم</p>
                  <p className="text-2xl font-bold leading-none" style={{ color: brandColor }}>{st.nextNumber}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2.5 text-xs">
              {st.over && <span className="px-2 py-1 rounded-lg bg-slate-200 text-slate-600">الفترة خلصت</span>}
              {!st.over && st.full && <span className="px-2 py-1 rounded-lg bg-red-50 text-red-600 font-semibold">الفترة اتملت</span>}
              {!st.over && <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">{limit != null ? `اتحجز ${st.taken} من ${limit}` : `اتحجز ${st.taken}`}</span>}
              {isToday && !st.over && (st.started && st.currentNumber != null
                ? <span data-testid="inside-now" className="px-2 py-1 rounded-lg font-semibold" style={{ backgroundColor: `${brandColor}14`, color: brandColor }}>جوه دلوقتي رقم {st.currentNumber}</span>
                : <span data-testid="inside-now" className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">الكشف لسه ما بدأش</span>)}
            </div>
          </button>
        )
      })}
      {periods.length === 0 && <p className="text-gray-400 text-sm text-center py-6">مفيش فترات شغل في اليوم ده</p>}
      {periods.length > 0 && !anyOpen && (
        <button type="button" onClick={onWaitlist}
          className="w-full py-3 text-white text-sm font-bold rounded-xl min-h-[48px]" style={{ backgroundColor: brandColor }}>
          انضم لقائمة الانتظار
        </button>
      )}
    </div>
  )
}

// Whether the clinic books by time or by turn, and its per-period limit (057).
function useBookingMode(businessId) {
  return useQuery({
    queryKey: ['booking-mode', businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_booking_mode', { p_business_id: businessId })
      // Before 057 runs the function doesn't exist: book by time as always.
      if (error) return { mode: 'time', queue_limit: null }
      return data || { mode: 'time', queue_limit: null }
    },
  })
}

// Each period's numbers for one day, counts only. Today it refreshes every
// minute, so "inside now" keeps up with the clinic.
function useQueuePeriods(businessId, branchId, date, enabled) {
  return useQuery({
    queryKey: ['queue-periods', businessId, branchId, date],
    enabled: enabled && !!businessId && !!date,
    refetchInterval: date === todayISO() ? 60_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_queue_periods', { p_business_id: businessId, p_branch_id: branchId || null, p_date: date })
      if (error) throw error
      return Object.fromEntries((data || []).map(r => [String(r.period_start).slice(0, 5), r]))
    },
  })
}

export default function BookingPage() {
  const { businessSlug } = useParams()
  const qc = useQueryClient()
  const [step, setStep] = useState(STEP_SERVICE)
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [selectedService, setSelectedService] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [submitted, setSubmitted] = useState(null)
  const [waitlistMode, setWaitlistMode] = useState(false)
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false)
  const [limitError, setLimitError] = useState('')
  const [justBookedSlots, setJustBookedSlots] = useState(new Set())
  const selectedDateRef = useRef(selectedDate)
  const justBookedTimers = useRef({})

  const { data: business, isLoading: bizLoading } = usePublicBusiness(businessSlug)
  const { data: branches = [] } = usePublicBranches(business?.id)
  const { data: services = [], isLoading: svcLoading } = usePublicServices(business?.id)
  const activeBranch = selectedBranch || branches[0] || null
  const { data: busyRanges = [] } = useBusyRanges(business?.id, selectedDate, activeBranch?.id)
  const createAppt = useCreateAppointment()

  const hasBranches = branches.length > 1
  const brandColor = business?.brand_color || '#0D9B6C'

  useEffect(() => {
    if (brandColor) {
      document.documentElement.style.setProperty('--brand-color', brandColor)
    }
    return () => document.documentElement.style.removeProperty('--brand-color')
  }, [brandColor])

  // Slots that were already booked when the page first loaded never enter
  // justBookedSlots — only a Realtime INSERT received after mount adds a key,
  // so the "تم حجزه للتو" treatment never applies to pre-existing bookings.
  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  function chooseDate(date) {
    setSelectedDate(date)
    setJustBookedSlots(new Set())
  }

  // Live updates: if someone else books a slot while this page is open,
  // reflect it immediately without requiring a refresh.
  useEffect(() => {
    if (!business?.id) return
    const channel = supabase
      .channel(`booking-page-${business.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `business_id=eq.${business.id}` },
        (payload) => {
          if (
            payload.eventType === 'INSERT' &&
            payload.new?.status === 'confirmed' &&
            payload.new?.appointment_date === selectedDateRef.current
          ) {
            const key = payload.new.appointment_time?.slice(0, 5)
            if (key) {
              setJustBookedSlots(prev => new Set(prev).add(key))
              clearTimeout(justBookedTimers.current[key])
              justBookedTimers.current[key] = setTimeout(() => {
                setJustBookedSlots(prev => {
                  const next = new Set(prev)
                  next.delete(key)
                  return next
                })
              }, 4500)
            }
          }
          qc.invalidateQueries({ queryKey: ['booked-slots', business.id] })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      Object.values(justBookedTimers.current).forEach(clearTimeout)
    }
  }, [business?.id, qc])

  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(bookingClientSchema),
    defaultValues: { client_name: '', client_phone: '' },
  })

  const { data: modeInfo } = useBookingMode(business?.id)
  const queueMode = modeInfo?.mode === 'queue'
  const { data: periodStats = {} } = useQueuePeriods(business?.id, activeBranch?.id, selectedDate, queueMode)
  const { data: lastBookableDate = null, isLoading: windowLoading } = useLastBookableDate(business?.id)
  const availableDates = business && !windowLoading ? generateAvailableDates(activeBranch, business.working_hours, lastBookableDate) : []

  // Returns every slot for the selected day, each annotated with
  // { time, isAvailable, bookedCount, capacity, isPast } — booked/past slots
  // are never dropped from the list, only marked unavailable, so the UI can
  // show them visibly as "محجوز" instead of just disappearing.
  // The selected day's working periods, [{ start, end }].
  function dayPeriods() {
    if (!selectedDate || !business) return []
    const dayKey = getDayKey(selectedDate)
    const hours = business.working_hours?.[dayKey]
    return branchHasScheduleBlocks(activeBranch?.schedule_blocks)
      ? activeBranch.schedule_blocks?.[dayKey] || []
      : hours?.active ? getDayPeriods(hours).map(p => ({ start: p.open, end: p.close })) : []
  }

  function getSlots() {
    if (!selectedDate || !business || !selectedService) return []
    const periods = dayPeriods()
    return getServiceSlots(periods, {
      duration: selectedService.duration_minutes || business.slot_duration || 30,
      step: getSlotStep(services, business.slot_duration || 30),
      busy: busyRanges,
      capacity: activeBranch?.capacity || 1,
      dateStr: selectedDate,
    })
  }

  async function onSubmitClient({ client_name, client_phone }) {
    setLimitError('')
    if (!activeBranch?.id) {
      setLimitError('حدث خطأ في تحديد الفرع — جرّب تحديث الصفحة، أو تواصل مع النشاط مباشرة')
      return
    }
    try {
      if (!waitlistMode) {
        // anon has no SELECT policy on appointments (by design — it would
        // leak every other client's bookings), so this goes through a
        // SECURITY DEFINER RPC that returns only a count, never rows.
        const { data: count, error: countError } = await supabase.rpc('count_active_bookings', {
          p_business_id: business.id,
          p_phone: client_phone,
        })
        if (countError) throw countError
        if ((count || 0) >= 2) {
          setLimitError('عندك بالفعل أقصى عدد حجوزات مسموح (2). لازم تنهي أو تلغي حجز قبل ما تحجز تاني')
          return
        }
      }
      // Visitors can't read the row back, so a random id sent with it lets the
      // page ask for the number the database gave it (057).
      const bookingRef = queueMode && !waitlistMode ? crypto.randomUUID() : null
      await createAppt.mutateAsync({
        ...(bookingRef && { booking_ref: bookingRef }),
        business_id: business.id,
        service_id: selectedService.id,
        // Guarded above — activeBranch.id is always set here. Never fall back
        // to null: branch_id is NOT NULL in the DB, and a null write would
        // make this row invisible to branch-filtered slot/calendar queries.
        branch_id: activeBranch.id,
        client_name,
        client_phone,
        appointment_date: selectedDate,
        appointment_time: selectedTime,
        status: waitlistMode ? 'waitlist' : 'confirmed',
      })
      let queueNumber = null
      if (bookingRef) {
        const { data: n } = await supabase.rpc('public_my_queue_number', { p_booking_ref: bookingRef })
        queueNumber = n ?? null
        qc.invalidateQueries({ queryKey: ['queue-periods', business.id] })
      }
      if (waitlistMode) setWaitlistSubmitted(true)
      else setSubmitted({ client_name, service: selectedService.name, date: selectedDate, time: selectedTime, branch: selectedBranch?.name, queueNumber, period: queueMode ? selectedPeriod : null })
    } catch (e) {
      if (e.message?.includes('CAPACITY_EXCEEDED')) {
        setSelectedTime(null)
        qc.invalidateQueries({ queryKey: ['booked-slots', business.id] })
        setStep(STEP_DATETIME)
        toast.error('عذراً، تم حجز هذا الموعد للتو من شخص آخر. اختر وقتاً آخر')
      } else if (e.message?.includes('BOOKING_LIMIT')) {
        setLimitError('عندك بالفعل أقصى عدد حجوزات مسموح (2). لازم تنهي أو تلغي حجز قبل ما تحجز تاني')
      } else if (e.message?.includes('RATE_LIMITED')) {
        toast.error('حجوزات كتير من نفس الشبكة. جرّب تاني بعد شوية، أو كلّم المكان مباشرة')
      } else if (e.message?.includes('QUEUE_FULL')) {
        setSelectedTime(null)
        setStep(STEP_DATETIME)
        qc.invalidateQueries({ queryKey: ['queue-periods', business.id] })
        toast.error('الفترة دي اتملت للتو. اختار فترة تانية أو ادخل قايمة الانتظار')
      } else if (e.message?.includes('too_far')) {
        setSelectedTime(null)
        setStep(STEP_DATETIME)
        qc.invalidateQueries({ queryKey: ['last-bookable-date', business.id] })
        toast.error('الحجز لليوم ده لسه ما اتفتحش. اختار يوم أقرب')
      } else if (e.message?.includes('INVALID_BOOKING')) {
        toast.error('راجع الاسم ورقم الموبايل وجرّب تاني')
      } else {
        toast.error('حدث خطأ أثناء الحجز: ' + e.message)
      }
    }
  }

  if (bizLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Skeleton className="h-[200px] w-full" />
        <div className="max-w-sm mx-auto px-4 pt-10 space-y-4">
          <Skeleton className="h-6 w-40 mx-auto" />
          <Skeleton className="h-4 w-24 mx-auto" />
          <Skeleton className="h-32 w-full rounded-3xl" />
        </div>
      </div>
    )
  }

  if (!business) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
        <Helmet><meta name="robots" content="noindex" /></Helmet>
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiOutlineWrenchScrewdriver className="w-8 h-8 text-gray-300" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">صفحة الحجز غير موجودة</h1>
          <p className="text-gray-500 text-sm">تحقق من الرابط وحاول مرة أخرى</p>
        </div>
      </div>
    )
  }

  if (isBusinessLocked(business)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
        <Helmet><meta name="robots" content="noindex" /></Helmet>
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiOutlineLockClosed className="w-8 h-8 text-gray-300" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">الحجز غير متاح حالياً</h1>
          <p className="text-gray-500 text-sm">تواصل مع {business.name} مباشرة لحجز موعد</p>
        </div>
      </div>
    )
  }

  // Waitlist success
  if (waitlistSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
        <Helmet><meta name="robots" content="noindex" /></Helmet>
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${brandColor}1a` }}>
            <HiOutlineClock className="w-8 h-8" style={{ color: brandColor }} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">تم التسجيل في قائمة الانتظار!</h1>
          <p className="text-gray-500 text-sm">هنبلغك على واتساب لو اتفرج موعد</p>
          <p className="text-xs text-gray-400 mt-4">{business.name}</p>
        </div>
      </div>
    )
  }

  // Success / receipt screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
        <Helmet><meta name="robots" content="noindex" /></Helmet>
        <div className="w-full max-w-sm">
          {/* Receipt card */}
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            {/* Top band */}
            <div className="h-2 w-full" style={{ backgroundColor: brandColor }} />
            <div className="p-7 text-center border-b border-gray-100">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${brandColor}1a` }}>
                <HiOutlineCheck className="w-8 h-8" style={{ color: brandColor }} />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">تم تأكيد موعدك!</h1>
              <p className="text-gray-500 text-sm">سنرسل لك تذكيراً على واتساب قبل الموعد</p>
            </div>

            {/* Receipt rows */}
            <div className="p-5 space-y-3 text-sm">
              {[
                { label: 'الاسم', value: submitted.client_name },
                submitted.branch && { label: 'الفرع', value: submitted.branch },
                { label: 'الخدمة', value: submitted.service },
                { label: 'التاريخ', value: format(new Date(submitted.date + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: ar }) },
                submitted.queueNumber != null && { label: 'رقمك في الدور', value: String(submitted.queueNumber), big: true },
                submitted.period
                  ? { label: 'الفترة', value: periodLabel(submitted.period) }
                  : { label: 'الوقت', value: formatTime12(submitted.time), ltr: true },
              ].filter(Boolean).map(({ label, value, ltr, big }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-dashed border-gray-100 last:border-0">
                  <span className="text-gray-400">{label}</span>
                  <span data-testid={big ? 'queue-number' : undefined} className={`font-semibold text-gray-900 ${ltr ? 'font-mono' : ''} ${big ? 'text-2xl' : ''}`} dir={ltr ? 'ltr' : undefined} style={big ? { color: brandColor } : undefined}>{value}</span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 pb-6 text-center">
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                {business.logo_url
                  ? <img src={business.logo_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                  : <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold leading-none" style={{ backgroundColor: brandColor }}>{business.name.charAt(0)}</div>}
                {business.name}
              </div>
            </div>
          </div>

          {/* Keep-this-receipt notice */}
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2.5 text-right">
            <HiOutlineExclamationCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              احتفظ بهذه الصفحة أو قم بحفظ صورة لها على جهازك — قد تحتاج لإظهارها عند الطلب لتأكيد حجزك.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const slots = step === STEP_DATETIME ? getSlots() : []
  const hasAnyAvailable = slots.some(s => s.isAvailable)

  // Main booking flow
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Seo (not a bare Helmet) so index.html's static canonical — which
          points at the home page — is removed; with both present Google read
          every booking page as an alternate of "/". */}
      <Seo
        title={business?.name ? `احجز موعدك عند ${business.name} — بسهولة` : 'احجز موعدك — بسهولة'}
        description={business?.bio || `احجز موعدك بسهولة عند ${business?.name || ''}`}
        path={`/book/${businessSlug}`}
        image={business?.cover_url || undefined}
      />
      {/* Hero */}
      <div className="relative">
        <div className="h-[200px] w-full relative" style={{
          background: business.cover_url
            ? `url(${business.cover_url}) center/cover no-repeat`
            : `linear-gradient(135deg, ${brandColor}, ${brandColor}99)`,
        }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/0" />
        </div>

        {/* Floating info card */}
        <div className="absolute -bottom-12 inset-x-0 px-4">
          <div className="max-w-sm mx-auto bg-white/95 backdrop-blur-sm rounded-3xl shadow-xl border border-white p-4 flex items-start gap-3.5">
            <div className="w-16 h-16 rounded-2xl border-2 border-white shadow-md overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: brandColor }}>
              {business.logo_url
                ? <img src={business.logo_url} alt={business.name} className="w-full h-full object-cover" />
                : <span className="text-white text-2xl font-bold leading-none">{business.name.charAt(0)}</span>}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-lg font-bold text-gray-900 leading-snug line-clamp-2">{business.name}</h1>
              {business.specialty && <p className="text-sm text-gray-500 truncate">{business.specialty}</p>}
            </div>
            {business.years_experience > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[12.5px] px-2.5 py-1 rounded-full font-bold flex-shrink-0 mt-1"
                style={{ backgroundColor: `${brandColor}15`, color: brandColor }}>
                <HiOutlineStar className="w-3 h-3" /> {business.years_experience} سنة
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Business info */}
      <div className="max-w-sm mx-auto px-4 pt-20 pb-2 text-center">
        {business.bio && (
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">{business.bio}</p>
        )}
        {business.welcome_message && (
          <p className="text-sm italic mt-3 px-4 border-r-2 text-right" style={{ color: brandColor, borderColor: brandColor }}>
            {business.welcome_message}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
          {getOpenDaysSummary(activeBranch, business.working_hours) && (
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white border border-gray-100 text-gray-500 shadow-sm">
              <HiOutlineClock className="w-3.5 h-3.5" />
              {getOpenDaysSummary(activeBranch, business.working_hours)}
            </span>
          )}
          {business.public_phone && (
            <a href={telHref(business.public_phone)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white border border-gray-100 text-gray-500 hover:text-gray-700 shadow-sm transition-colors" dir="ltr">
              <HiOutlinePhone className="w-3.5 h-3.5" />
              <span dir="ltr">{displayPhone(business.public_phone)}</span>
            </a>
          )}
        </div>
        <SocialRow business={business} />
      </div>

      {/* Booking card */}
      <div className="max-w-sm mx-auto px-4 pb-10 mt-5">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-5">
          <StepProgress step={step} brandColor={brandColor} />

          {/* Step 1: Branch (optional, inline) + Service */}
          {step === STEP_SERVICE && (
            <div className="space-y-4">
              {hasBranches && (
                <div>
                  <p className="text-xs font-bold text-gray-400 mb-2">اختر الفرع</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {branches.map(branch => {
                      const isActive = activeBranch?.id === branch.id
                      return (
                        <button key={branch.id} onClick={() => setSelectedBranch(branch)}
                          className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 whitespace-nowrap transition-all ${
                            isActive ? 'text-white shadow-sm' : 'text-gray-600 border-gray-200 hover:border-gray-300'
                          }`}
                          style={isActive ? { backgroundColor: brandColor, borderColor: brandColor } : undefined}>
                          {branch.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <HiOutlineSparkles className="w-4.5 h-4.5" style={{ color: brandColor }} />
                  اختر الخدمة
                </h2>
                {svcLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
                ) : services.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">لا توجد خدمات متاحة حالياً</p>
                ) : (
                  <div className="space-y-2">
                    {services.map(svc => (
                      <button key={svc.id} onClick={() => { setSelectedService(svc); setStep(STEP_DATETIME) }}
                        className="w-full text-right p-3.5 rounded-2xl border-2 border-gray-100 hover:border-[var(--brand-color)] hover:shadow-md transition-all active:scale-[0.98] flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 truncate">{svc.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{svc.duration_minutes} دقيقة</p>
                        </div>
                        {svc.price ? (
                          <span className="text-sm font-bold flex-shrink-0" style={{ color: brandColor }}>{formatMoney(svc.price, business.currency)}</span>
                        ) : null}
                        <HiOutlineChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Date + Time together */}
          {step === STEP_DATETIME && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <BackButton onClick={() => setStep(STEP_SERVICE)} />
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <HiOutlineCalendarDays className="w-4.5 h-4.5" style={{ color: brandColor }} />
                  اختر الموعد
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-4 px-1">الخدمة: <strong className="text-gray-700">{selectedService?.name}</strong></p>

              {/* A short booking window can leave no open day yet (055). */}
              {!windowLoading && availableDates.length === 0 && (
                <p data-testid="no-open-days" className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 mb-4">
                  مفيش أيام متاحة للحجز دلوقتي. الحجز بيتفتح أول بأول، فجرّب تاني بكرا أو كلّم العيادة.
                </p>
              )}

              {/* Date strip */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-4">
                {availableDates.map(date => {
                  const d = new Date(date + 'T00:00:00')
                  const isSelected = date === selectedDate
                  return (
                    <button key={date} onClick={() => { chooseDate(date); setSelectedTime(null); setWaitlistMode(false) }}
                      className={`flex-shrink-0 w-16 py-2.5 rounded-2xl border-2 text-center transition-all active:scale-95 ${
                        isSelected ? 'text-white shadow-md' : 'border-gray-100 hover:border-[var(--brand-color)] text-gray-700'
                      }`}
                      style={isSelected ? { backgroundColor: brandColor, borderColor: brandColor } : undefined}>
                      <p className={`text-[11.5px] ${isSelected ? 'opacity-80' : 'text-gray-400'}`}>{format(d, 'EEE', { locale: ar })}</p>
                      <p className="text-lg font-bold">{format(d, 'd')}</p>
                      <p className={`text-[11.5px] ${isSelected ? 'opacity-80' : 'text-gray-400'}`}>{format(d, 'MMM', { locale: ar })}</p>
                    </button>
                  )
                })}
              </div>

              {/* Time slots */}
              {queueMode && selectedDate ? (
                <QueuePeriodList
                  periods={dayPeriods()}
                  stats={periodStats}
                  limit={modeInfo?.queue_limit ?? null}
                  dateStr={selectedDate}
                  brandColor={brandColor}
                  onPick={(p) => { setWaitlistMode(false); setSelectedPeriod(p); setSelectedTime(String(p.start).slice(0, 5)); setStep(STEP_CLIENT) }}
                  onWaitlist={() => { setWaitlistMode(true); setSelectedPeriod(null); setSelectedTime('00:00'); setStep(STEP_CLIENT) }}
                />
              ) : !selectedDate ? (
                <p className="text-gray-400 text-sm text-center py-8">اختر تاريخاً لعرض الأوقات المتاحة</p>
              ) : slots.length === 0 || !hasAnyAvailable ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                    <HiOutlineClock className="w-7 h-7 text-gray-300" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">مفيش مواعيد متاحة</p>
                    <p className="text-gray-400 text-sm mt-1">كل المواعيد في هذا اليوم محجوزة</p>
                  </div>
                  <div className="space-y-2">
                    <button onClick={() => { setWaitlistMode(true); setSelectedTime('00:00'); setStep(STEP_CLIENT) }}
                      className="w-full py-3 text-white text-sm font-bold rounded-xl transition-colors min-h-[48px] flex items-center justify-center gap-2"
                      style={{ backgroundColor: brandColor }}>
                      <HiOutlineClock className="w-4 h-4" />
                      انضم لقائمة الانتظار
                    </button>
                    <Button variant="secondary" size="sm" onClick={() => chooseDate(null)} className="w-full">اختر يوماً آخر</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map(slot => {
                    const isJustBooked = !slot.isAvailable && justBookedSlots.has(slot.time)
                    return (
                      <button key={slot.time} type="button" disabled={!slot.isAvailable}
                        onClick={() => { if (slot.isAvailable) { setWaitlistMode(false); setSelectedTime(slot.time); setStep(STEP_CLIENT) } }}
                        className={
                          slot.isAvailable
                            ? `py-3 px-2 rounded-xl border-2 transition-all text-sm font-medium active:scale-95 min-h-[48px] ${
                                slot.time === selectedTime ? 'text-white shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-[var(--brand-color)] hover:border-[var(--brand-color)] hover:text-white'
                              }`
                            : `py-3 px-2 rounded-xl border-2 text-sm font-medium min-h-[48px] cursor-not-allowed flex flex-col items-center justify-center gap-0.5 transition-colors duration-700 ${
                                isJustBooked ? 'border-amber-300 bg-amber-50 text-amber-600 animate-pulse' : 'border-slate-200 bg-slate-100 text-slate-400'
                              }`
                        }
                        dir="ltr"
                        style={slot.isAvailable && slot.time === selectedTime ? { backgroundColor: brandColor, borderColor: brandColor } : undefined}>
                        {slot.isAvailable ? formatTime12(slot.time) : (
                          <>
                            <HiOutlineLockClosed className="w-3.5 h-3.5" />
                            <span className="text-[11.5px]">{isJustBooked ? 'تم حجزه للتو' : 'محجوز'}</span>
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Client Info */}
          {step === STEP_CLIENT && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <BackButton onClick={() => { setWaitlistMode(false); setStep(STEP_DATETIME) }} />
                <h2 className="font-bold text-gray-900">بياناتك</h2>
              </div>

              {/* Summary chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  selectedService?.name,
                  selectedDate && format(new Date(selectedDate + 'T00:00:00'), 'EEEE d MMMM', { locale: ar }),
                  !waitlistMode && (queueMode && selectedPeriod ? `${periodName(selectedPeriod)} · هتاخد رقم في الدور` : formatTime12(selectedTime)),
                ].filter(Boolean).map((value, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ backgroundColor: `${brandColor}12`, color: brandColor }}>
                    {value}
                  </span>
                ))}
              </div>

              <form onSubmit={handleSubmit(onSubmitClient)} className="space-y-3">
                <Input label="الاسم الكامل" placeholder="مثال: محمد أحمد" error={errors.client_name?.message} {...register('client_name')} />
                <Controller
                  name="client_phone"
                  control={control}
                  render={({ field }) => (
                    <PhoneInput {...field} label="رقم واتساب" defaultCountry={business.country} error={errors.client_phone?.message} />
                  )}
                />
                <p className="text-xs text-gray-400">سنرسل تذكيراً بالموعد على هذا الرقم</p>
                {!activeBranch?.id && (
                  <div className="bg-red-50 text-red-600 text-sm px-3 py-2.5 rounded-xl">
                    تعذر تحديد الفرع — لا يمكن إكمال الحجز الآن. جرّب تحديث الصفحة، أو تواصل مع النشاط مباشرة.
                  </div>
                )}
                {limitError && (
                  <div className="bg-red-50 text-red-600 text-sm px-3 py-2.5 rounded-xl">{limitError}</div>
                )}
                <button type="submit" disabled={isSubmitting || createAppt.isPending || !activeBranch?.id}
                  className="w-full py-4 text-white font-bold rounded-xl shadow-lg transition-opacity disabled:opacity-60 text-sm min-h-[52px]"
                  style={{ backgroundColor: brandColor }}>
                  {isSubmitting || createAppt.isPending ? 'جاري الحجز...' : 'تأكيد الحجز'}
                </button>
              </form>

              {business.cancellation_policy && (
                <p className="text-[12.5px] text-gray-400 text-center mt-3">{business.cancellation_policy}</p>
              )}
            </div>
          )}
        </div>

        {/* Made-with link: patients are often business owners too. The B-<slug>
            ref credits this customer as the referrer (lib/growth/links.js). */}
        <p className="text-center text-[12.5px] text-gray-400 py-6">
          صفحة الحجز دي معمولة بـ{' '}
          <a href={bookingFooterPath(businessSlug)} target="_blank" rel="noopener" className="font-semibold text-gray-500 hover:text-gray-700 underline">بسهولة</a>
          {' '}— اعمل صفحة زيها لنشاطك
        </p>
      </div>
    </div>
  )
}
