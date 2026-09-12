import { useEffect, useRef, useState } from 'react'
import { HiOutlineCheckCircle, HiOutlineChevronLeft } from 'react-icons/hi2'

/**
 * The hero's one bold element: the real booking flow rebuilt in markup.
 *
 * Not a stock illustration and not a screenshot — it mirrors the actual
 * three steps of src/pages/booking/BookingPage.jsx (الخدمة ← الموعد ← بياناتك),
 * its progress bar, and its confirmation screen, using the clinic service
 * names the onboarding actually suggests (OnboardingFlow.jsx:108).
 *
 * It carries the page's single orchestrated animation: one pass through the
 * three steps on load, then it stops and stays on the confirmation. The step
 * dots remain clickable afterwards, so all further motion is user-driven.
 * Under prefers-reduced-motion nothing auto-advances.
 */

// Mirrors STEP_LABELS in src/pages/booking/BookingPage.jsx:39
const STEP_LABELS = ['الخدمة', 'الموعد', 'بياناتك']

// Clinic services as suggested by the real onboarding (OnboardingFlow.jsx:108).
// Durations/prices are illustrative — the note under the phone says so.
const SERVICES = [
  { name: 'كشف', duration: '30 دقيقة', price: '300' },
  { name: 'متابعة', duration: '15 دقيقة', price: '150' },
  { name: 'تنظيف أسنان', duration: '45 دقيقة', price: '500' },
]

const SLOTS = [
  { time: '10:00 ص', available: true },
  { time: '10:30 ص', available: false },
  { time: '11:00 ص', available: true },
  { time: '11:30 ص', available: true },
  { time: '12:00 م', available: false },
  { time: '12:30 م', available: true },
]

const TEAL = '#16B89A'

function StepProgress({ step }) {
  return (
    <div className="px-4 pt-4 pb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
          خطوة {step + 1} من 3
        </span>
        <span className="text-[10px] font-bold" style={{ color: TEAL }}>
          {STEP_LABELS[step]}
        </span>
      </div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${((step + 1) / 3) * 100}%`, backgroundColor: TEAL }}
        />
      </div>
    </div>
  )
}

export default function BookingPhoneDemo() {
  const [step, setStep] = useState(0)
  const timers = useRef([])

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    // One pass only — no loop. Cleared on unmount or on the first manual tap.
    timers.current = [
      setTimeout(() => setStep(1), 2200),
      setTimeout(() => setStep(2), 4400),
    ]
    return () => timers.current.forEach(clearTimeout)
  }, [])

  function goTo(next) {
    timers.current.forEach(clearTimeout)
    setStep(next)
  }

  return (
    <div className="w-full max-w-[300px] mx-auto">
      {/* Phone shell — flat, no glow, no gradient */}
      <div className="rounded-[28px] border border-white/15 bg-white p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]">
        <div className="rounded-[22px] overflow-hidden bg-white" dir="rtl">
          {/* Business header, as the real booking page renders it */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-bold leading-none"
              style={{ backgroundColor: TEAL }}
            >
              عأ
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-slate-900 truncate">عيادة د. أحمد</p>
              <p className="text-[10px] text-slate-400">حجز موعد</p>
            </div>
          </div>

          <StepProgress step={step} />

          {/* Fixed height so the phone never jumps between steps */}
          <div className="px-4 pb-4 h-[248px]">
            {step === 0 && (
              <ul className="space-y-2">
                {SERVICES.map((svc) => (
                  <li
                    key={svc.name}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-[12px] font-bold text-slate-900">{svc.name}</p>
                      <p className="text-[10px] text-slate-400 tabular-nums">{svc.duration}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: TEAL }}>
                        {svc.price} ج
                      </span>
                      <HiOutlineChevronLeft className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {step === 1 && (
              <div>
                <p className="text-[11px] font-bold text-slate-900 mb-2">الخميس 18 سبتمبر</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {SLOTS.map((slot) => (
                    <div
                      key={slot.time}
                      className={`rounded-lg border px-1 py-2 text-center text-[10.5px] font-semibold tabular-nums ${
                        slot.available
                          ? 'border-slate-200 text-slate-700'
                          : 'border-slate-100 bg-slate-50 text-slate-300 line-through'
                      }`}
                    >
                      {slot.time}
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-2">
                  <p className="text-[10px] text-amber-700 leading-relaxed">
                    كل المواعيد محجوزة؟ العميل يسجّل في قائمة الانتظار وتبلّغه لو اتفرج موعد.
                  </p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-1">
                <HiOutlineCheckCircle className="w-11 h-11 mb-2" style={{ color: TEAL }} />
                <p className="text-[13px] font-bold text-slate-900">تم تأكيد موعدك!</p>
                <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                  سنرسل لك تذكيراً على واتساب قبل الموعد
                </p>
                <dl className="mt-3 w-full rounded-xl bg-slate-50 border border-slate-100 p-2.5 space-y-1.5 text-right">
                  {[
                    ['الخدمة', 'كشف'],
                    ['التاريخ', 'الخميس 18 سبتمبر'],
                    ['الوقت', '11:00 ص'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <dt className="text-[10px] text-slate-400">{k}</dt>
                      <dd className="text-[10.5px] font-semibold text-slate-800 tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step dots — keep the demo operable after the single auto pass */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`اعرض خطوة ${label}`}
            aria-current={step === i}
            className={`h-1.5 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400 ${
              step === i ? 'w-6 bg-accent-500' : 'w-1.5 bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
