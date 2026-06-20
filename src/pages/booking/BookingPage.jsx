import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { format, addDays } from 'date-fns'
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
} from 'react-icons/hi2'
import { FaInstagram, FaFacebook } from 'react-icons/fa'
import { usePublicBusiness, usePublicServices, usePublicBranches } from '../../hooks/useBusiness'
import { useBookedSlotCounts, useCreateAppointment } from '../../hooks/useAppointments'
import { bookingClientSchema } from '../../lib/validators'
import { supabase } from '../../lib/supabase'
import {
  getDayKey, getSlotsWithAvailabilityForDay, getSlotsWithAvailability, branchHasScheduleBlocks,
  formatTime12, toISODateString,
} from '../../utils/dateHelpers'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'

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

function generateAvailableDates(branch, workingHours, count = 30) {
  const useBlocks = branchHasScheduleBlocks(branch?.schedule_blocks)
  const dates = []
  let d = addDays(new Date(), 0)
  let guard = 0
  while (dates.length < count && guard < 365) {
    guard++
    const key = getDayKey(d)
    const isOpen = useBlocks
      ? (branch.schedule_blocks?.[key]?.length || 0) > 0
      : !!workingHours?.[key]?.active
    if (isOpen) dates.push(toISODateString(d))
    d = addDays(d, 1)
  }
  return dates
}

export default function BookingPage() {
  const { businessSlug } = useParams()
  const qc = useQueryClient()
  const [step, setStep] = useState(STEP_SERVICE)
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [selectedService, setSelectedService] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [submitted, setSubmitted] = useState(null)
  const [waitlistMode, setWaitlistMode] = useState(false)
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false)
  const [limitError, setLimitError] = useState('')

  const { data: business, isLoading: bizLoading } = usePublicBusiness(businessSlug)
  const { data: branches = [] } = usePublicBranches(business?.id)
  const { data: services = [], isLoading: svcLoading } = usePublicServices(business?.id)
  const activeBranch = selectedBranch || branches[0] || null
  const { data: bookedCounts = {} } = useBookedSlotCounts(business?.id, selectedDate, activeBranch?.id)
  const createAppt = useCreateAppointment()

  const hasBranches = branches.length > 1
  const brandColor = business?.brand_color || '#10B981'

  useEffect(() => {
    if (brandColor) {
      document.documentElement.style.setProperty('--brand-color', brandColor)
    }
    return () => document.documentElement.style.removeProperty('--brand-color')
  }, [brandColor])

  // Live updates: if someone else books a slot while this page is open,
  // reflect it immediately without requiring a refresh.
  useEffect(() => {
    if (!business?.id) return
    const channel = supabase
      .channel(`booking-page-${business.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `business_id=eq.${business.id}` },
        () => qc.invalidateQueries({ queryKey: ['booked-slots', business.id] })
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [business?.id, qc])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(bookingClientSchema),
  })

  const availableDates = business ? generateAvailableDates(activeBranch, business.working_hours) : []

  // Returns every slot for the selected day, each annotated with
  // { time, isAvailable, bookedCount, capacity, isPast } — booked/past slots
  // are never dropped from the list, only marked unavailable, so the UI can
  // show them visibly as "محجوز" instead of just disappearing.
  function getSlots() {
    if (!selectedDate || !business) return []
    const dayKey = getDayKey(selectedDate)
    const capacity = activeBranch?.capacity || 1
    if (branchHasScheduleBlocks(activeBranch?.schedule_blocks)) {
      return getSlotsWithAvailability(activeBranch.schedule_blocks?.[dayKey], business.slot_duration || 30, bookedCounts, capacity, selectedDate)
    }
    const wh = business.working_hours?.[dayKey]
    return getSlotsWithAvailabilityForDay(wh, business.slot_duration || 30, bookedCounts, capacity, selectedDate)
  }

  async function onSubmitClient({ client_name, client_phone }) {
    setLimitError('')
    if (!activeBranch?.id) {
      setLimitError('حدث خطأ في تحديد الفرع — جرّب تحديث الصفحة، أو تواصل مع النشاط مباشرة')
      return
    }
    try {
      if (!waitlistMode) {
        const { count } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .eq('client_phone', client_phone)
          .in('status', ['confirmed', 'waitlist'])
          .gte('appointment_date', toISODateString(new Date()))
        if ((count || 0) >= 2) {
          setLimitError('عندك بالفعل أقصى عدد حجوزات مسموح (2). لازم تنهي أو تلغي حجز قبل ما تحجز تاني')
          return
        }
      }
      await createAppt.mutateAsync({
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
      if (waitlistMode) setWaitlistSubmitted(true)
      else setSubmitted({ client_name, service: selectedService.name, date: selectedDate, time: selectedTime, branch: selectedBranch?.name })
    } catch (e) {
      alert('حدث خطأ أثناء الحجز: ' + e.message)
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

  // Waitlist success
  if (waitlistSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
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
                { label: 'الوقت', value: formatTime12(submitted.time), ltr: true },
              ].filter(Boolean).map(({ label, value, ltr }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-dashed border-gray-100 last:border-0">
                  <span className="text-gray-400">{label}</span>
                  <span className={`font-semibold text-gray-900 ${ltr ? 'font-mono' : ''}`} dir={ltr ? 'ltr' : undefined}>{value}</span>
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
        </div>
      </div>
    )
  }

  const slots = step === STEP_DATETIME ? getSlots() : []
  const hasAnyAvailable = slots.some(s => s.isAvailable)

  // Main booking flow
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
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
          <div className="max-w-sm mx-auto bg-white/95 backdrop-blur-sm rounded-3xl shadow-xl border border-white p-4 flex items-center gap-3.5">
            <div className="w-16 h-16 rounded-2xl border-2 border-white shadow-md overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: brandColor }}>
              {business.logo_url
                ? <img src={business.logo_url} alt={business.name} className="w-full h-full object-cover" />
                : <span className="text-white text-2xl font-bold leading-none">{business.name.charAt(0)}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{business.name}</h1>
              {business.specialty && <p className="text-sm text-gray-500 truncate">{business.specialty}</p>}
            </div>
            {business.years_experience > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-bold flex-shrink-0"
                style={{ backgroundColor: `${brandColor}15`, color: brandColor }}>
                <HiOutlineStar className="w-3 h-3" /> {business.years_experience} سنة
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Business info */}
      <div className="max-w-sm mx-auto px-4 pt-16 pb-2 text-center">
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
            <a href={`tel:${business.public_phone}`}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white border border-gray-100 text-gray-500 hover:text-gray-700 shadow-sm transition-colors" dir="ltr">
              <HiOutlinePhone className="w-3.5 h-3.5" />
              {business.public_phone}
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
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${brandColor}15`, color: brandColor }}>
                          <HiOutlineWrenchScrewdriver className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 truncate">{svc.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{svc.duration_minutes} دقيقة</p>
                        </div>
                        {svc.price ? (
                          <span className="text-sm font-bold flex-shrink-0" style={{ color: brandColor }}>{svc.price} ج.م</span>
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

              {/* Date strip */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-4">
                {availableDates.map(date => {
                  const d = new Date(date + 'T00:00:00')
                  const isSelected = date === selectedDate
                  return (
                    <button key={date} onClick={() => { setSelectedDate(date); setSelectedTime(null) }}
                      className={`flex-shrink-0 w-16 py-2.5 rounded-2xl border-2 text-center transition-all active:scale-95 ${
                        isSelected ? 'text-white shadow-md' : 'border-gray-100 hover:border-[var(--brand-color)] text-gray-700'
                      }`}
                      style={isSelected ? { backgroundColor: brandColor, borderColor: brandColor } : undefined}>
                      <p className={`text-[10px] ${isSelected ? 'opacity-80' : 'text-gray-400'}`}>{format(d, 'EEE', { locale: ar })}</p>
                      <p className="text-lg font-bold">{format(d, 'd')}</p>
                      <p className={`text-[10px] ${isSelected ? 'opacity-80' : 'text-gray-400'}`}>{format(d, 'MMM', { locale: ar })}</p>
                    </button>
                  )
                })}
              </div>

              {/* Time slots */}
              {!selectedDate ? (
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
                    <Button variant="secondary" size="sm" onClick={() => setSelectedDate(null)} className="w-full">اختر يوماً آخر</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map(slot => (
                    <button key={slot.time} type="button" disabled={!slot.isAvailable}
                      onClick={() => { if (slot.isAvailable) { setSelectedTime(slot.time); setStep(STEP_CLIENT) } }}
                      className={
                        slot.isAvailable
                          ? `py-3 px-2 rounded-xl border-2 transition-all text-sm font-medium active:scale-95 min-h-[48px] ${
                              slot.time === selectedTime ? 'text-white shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-[var(--brand-color)] hover:border-[var(--brand-color)] hover:text-white'
                            }`
                          : 'py-3 px-2 rounded-xl border-2 border-slate-200 bg-slate-100 text-slate-400 text-sm font-medium min-h-[48px] cursor-not-allowed flex flex-col items-center justify-center gap-0.5'
                      }
                      dir="ltr"
                      style={slot.isAvailable && slot.time === selectedTime ? { backgroundColor: brandColor, borderColor: brandColor } : undefined}>
                      {slot.isAvailable ? formatTime12(slot.time) : (
                        <>
                          <HiOutlineLockClosed className="w-3.5 h-3.5" />
                          <span className="text-[10px]">محجوز</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Client Info */}
          {step === STEP_CLIENT && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <BackButton onClick={() => setStep(STEP_DATETIME)} />
                <h2 className="font-bold text-gray-900">بياناتك</h2>
              </div>

              {/* Summary chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  selectedService?.name,
                  selectedDate && format(new Date(selectedDate + 'T00:00:00'), 'EEEE d MMMM', { locale: ar }),
                  !waitlistMode && formatTime12(selectedTime),
                ].filter(Boolean).map((value, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ backgroundColor: `${brandColor}12`, color: brandColor }}>
                    {value}
                  </span>
                ))}
              </div>

              <form onSubmit={handleSubmit(onSubmitClient)} className="space-y-3">
                <Input label="الاسم الكامل" placeholder="مثال: محمد أحمد" error={errors.client_name?.message} {...register('client_name')} />
                <Input label="رقم واتساب" placeholder="201XXXXXXXXX" dir="ltr" error={errors.client_phone?.message} {...register('client_phone')} />
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
                <p className="text-[11px] text-gray-400 text-center mt-3">{business.cancellation_policy}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
