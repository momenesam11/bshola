import { useEffect, useState } from 'react'
import { HiOutlineCheckCircle, HiOutlineChevronLeft } from 'react-icons/hi2'

/**
 * The hero's one bold element: the real booking flow rebuilt in markup,
 * inside an actual phone frame (notch, side buttons, home indicator) so it
 * reads as "someone's phone" rather than a rounded rectangle.
 *
 * It mirrors the real booking page in two places at once:
 *   - the three steps and progress bar of src/pages/booking/BookingPage.jsx
 *     (STEP_LABELS: الخدمة ← الموعد ← بياناتك)
 *   - that page's actual header structure — a cover band with a floating
 *     rounded logo card overlapping it, business name and specialty
 *     (BookingPage.jsx's "Floating info card") — not the flat icon-and-name
 *     row this component used before, which didn't look like the product.
 *
 * Unlike a one-shot entrance animation, this one loops continuously: it is
 * a product demo whose whole point is showing the tap-to-book motion
 * repeatedly, not a page-load flourish. Each step is preceded by a brief
 * "tap" cursor (a pulsing dot) over the row being selected, so the loop reads
 * as someone tapping through it rather than slides changing on their own.
 * prefers-reduced-motion gets a single static resting frame — no loop, no cursor.
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
  { time: '11:00 ص', available: true, tapTarget: true },
  { time: '11:30 ص', available: true },
  { time: '12:00 م', available: false },
  { time: '12:30 م', available: true },
]

const TEAL = '#16B89A'
const NAVY = '#0F2C4E'

// One loop cycle: which booking step is showing and how long to dwell on it
// before advancing. Total ~5.6s per pass — long enough to read, short enough
// that a visitor scrolling past the hero sees at least one full pass.
const CYCLE = [
  { step: 0, duration: 1500 },
  { step: 1, duration: 1500 },
  { step: 2, duration: 2600 },
]

/** A small pulsing dot marking the item this pass of the loop is "tapping". */
function TapCursor() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center z-10" aria-hidden="true">
      <span className="absolute w-6 h-6 rounded-full bg-accent-400/50 animate-ping motion-reduce:hidden" />
      <span className="w-2.5 h-2.5 rounded-full bg-accent-500 shadow-sm" />
    </span>
  )
}

function StepProgress({ step }) {
  return (
    <div className="px-4 pt-3 pb-2.5">
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

/**
 * The booking page's real header, scaled down: cover band + a floating
 * rounded card (logo tile, name, specialty) overlapping its bottom edge —
 * see BookingPage.jsx's "Floating info card". A generic clinic is kept as the
 * concrete example (the demo has to show *something*), while TrustStrip and
 * the vertical chips right below the hero make clear it isn't clinic-only.
 */
function PhoneHeader() {
  return (
    <div className="relative">
      <div
        className="h-14"
        style={{ background: `linear-gradient(135deg, ${TEAL}, ${NAVY})` }}
      />
      <div className="absolute -bottom-6 inset-x-0 px-3">
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 px-3 py-2.5 flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[12px] font-bold leading-none flex-shrink-0"
            style={{ backgroundColor: TEAL }}
          >
            عأ
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-slate-900 truncate">عيادة د. أحمد</p>
            <p className="text-[10px] text-slate-400 truncate">أسنان وتقويم</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BookingPhoneDemo() {
  // Computed once at mount via a lazy initializer rather than set inside an
  // effect — an effect that calls setState unconditionally on every mount
  // triggers an avoidable extra render.
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const looping = !reduced && !paused

  useEffect(() => {
    if (!looping) return

    let alive = true
    let cycleIndex = 0
    let timer

    function advance() {
      if (!alive) return
      const phase = CYCLE[cycleIndex]
      setStep(phase.step)
      timer = setTimeout(() => {
        cycleIndex = (cycleIndex + 1) % CYCLE.length
        advance()
      }, phase.duration)
    }
    advance()

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [looping])

  function goTo(next) {
    setPaused(true)
    setStep(next)
  }

  return (
    // A real phone reads roughly 9:19.5 — the frame used to be 300px wide
    // with ~460px of content, closer to a squat tablet than a phone. Narrower
    // width, taller content (h-[280px] below) gets it into phone territory
    // without needing to shrink any of the legible text/tap targets inside.
    <div className="w-full max-w-[248px] mx-auto">
      {/* Phone frame: bezel, side buttons, notch, home indicator — not just a
          rounded rectangle standing in for a phone. */}
      <div className="relative rounded-[34px] bg-[#111] p-[9px] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]">
        {/* Side buttons */}
        <span className="absolute -right-[2px] top-20 w-[3px] h-8 rounded-r bg-[#0a0a0a]" aria-hidden="true" />
        <span className="absolute -left-[2px] top-16 w-[3px] h-5 rounded-l bg-[#0a0a0a]" aria-hidden="true" />
        <span className="absolute -left-[2px] top-24 w-[3px] h-10 rounded-l bg-[#0a0a0a]" aria-hidden="true" />

        <div className="relative rounded-[25px] overflow-hidden bg-white" dir="rtl">
          {/* Notch */}
          <div className="absolute top-0 inset-x-0 flex justify-center z-20">
            <div className="w-20 h-5 bg-[#111] rounded-b-2xl" />
          </div>

          <div className="pt-5">
            <PhoneHeader />

            <div className="pt-8">
              <StepProgress step={step} />

              {/* Fixed height so the phone never jumps between steps */}
              <div className="px-4 pb-4 h-[260px]">
                {step === 0 && (
                  <ul className="space-y-2">
                    {SERVICES.map((svc, i) => (
                      <li
                        key={svc.name}
                        className="relative flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5"
                      >
                        {looping && i === 0 && <TapCursor />}
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
                          className={`relative rounded-lg border px-1 py-2 text-center text-[10.5px] font-semibold tabular-nums ${
                            slot.available
                              ? 'border-slate-200 text-slate-700'
                              : 'border-slate-100 bg-slate-50 text-slate-300 line-through'
                          }`}
                        >
                          {looping && slot.tapTarget && <TapCursor />}
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

          {/* Home indicator */}
          <div className="flex justify-center pb-1.5">
            <div className="w-20 h-1 rounded-full bg-slate-200" />
          </div>
        </div>
      </div>

      {/* Step dots — tapping one pauses the loop and hands control to the visitor */}
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
