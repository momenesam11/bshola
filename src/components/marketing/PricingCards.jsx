import { Link } from 'react-router-dom'
import { HiOutlineCheck } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { Section, SectionHead } from './Section'
import Reveal from './Reveal'
import { PLANS } from '../../lib/seo'
import { SUPPORT_WHATSAPP } from '../../lib/support'

/**
 * Pricing.
 *
 * Prices come from PLANS in src/lib/seo.js — the same constant that feeds the
 * Offer structured data — so the page and what Google reads can never disagree.
 *
 * All plans open the whole system: there is no feature gating anywhere in the
 * codebase (MARKETING_CLAIMS.md §7), so the plans differ only in term length
 * and are presented as one feature list plus three terms, not as three tiers
 * with tick-marks withheld.
 */

const INCLUDED = [
  'مواعيد وحجوزات بلا حد',
  'صفحة حجز برابط خاص بيك',
  'قائمة انتظار',
  'تذكير واتساب من رقمك',
  'ملف عميل وكشف حساب وخطة زيارات',
  'ملف طبي وروشتة (للعيادات)',
  'تقارير وتصدير CSV وطباعة',
  'أكتر من فرع',
  'دعم على واتساب بالعامية',
]

export default function PricingCards({ id }) {
  const monthly = PLANS.find((p) => p.months === 1)

  return (
    <Section id={id} tone="paper">
      <SectionHead
        title="الأسعار"
        lead="كل الباقات بتفتح النظام بالكامل. الفرق بينها في مدة الاشتراك بس — المدة الأطول سعرها الشهري أقل. ومفيش عمولة على أي حجز، مهما كان عدد حجوزاتك."
      />

      <div className="mt-9 grid sm:grid-cols-3 gap-4">
        {PLANS.map((plan, i) => {
          const perMonth = Math.round(plan.price / plan.months)
          const isBest = plan.months === 6
          const savingVsMonthly = monthly ? monthly.price - perMonth : 0

          return (
            <Reveal
              as="div"
              key={plan.name}
              delay={i * 100}
              className={`rounded-2xl bg-white p-6 flex flex-col transition-all hover:-translate-y-1 hover:shadow-lg motion-reduce:hover:translate-y-0 ${
                isBest ? 'border-2 border-ink' : 'border border-rule'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-bold text-ink">{plan.name}</h3>
                {isBest && (
                  <span className="text-[10.5px] font-bold text-white bg-ink px-2 py-1 rounded-md">
                    أوفر سعر شهري
                  </span>
                )}
              </div>

              <p className="mt-4 text-[34px] font-bold text-ink leading-none tabular-nums">
                {plan.price.toLocaleString('en-EG')}
                <span className="text-[14px] font-semibold text-ink-soft"> جنيه</span>
              </p>

              <p className="mt-2 text-[13px] text-ink-soft tabular-nums">
                {plan.months === 1
                  ? 'شهرياً · تجديد كل شهر'
                  // Arabic noun-number agreement: 3–10 takes the plural
                  // (شهور), 11+ takes the singular (شهر) — "12 شهور" reads
                  // as a mistake to an Arabic reader.
                  : `لمدة ${plan.months} ${plan.months <= 10 ? 'شهور' : 'شهر'} · يعني ${perMonth} جنيه في الشهر`}
              </p>

              {savingVsMonthly > 0 && (
                <p className="mt-1 text-[12px] font-semibold text-accent-700 tabular-nums">
                  توفّر {savingVsMonthly} جنيه في الشهر
                </p>
              )}

              <Link
                to="/register"
                className={`mt-6 text-center text-[14px] font-bold py-3 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  isBest
                    ? 'bg-accent-500 hover:bg-accent-600 text-white'
                    : 'border border-ink/20 hover:border-ink text-ink'
                }`}
              >
                ابدأ تجربتك المجانية
              </Link>
            </Reveal>
          )
        })}
      </div>

      {/* One shared feature list — the plans are terms, not tiers */}
      <Reveal delay={200} className="mt-8 rounded-2xl border border-rule bg-white p-6 sm:p-7">
        <h3 className="text-[15px] font-bold text-ink">
          كل باقة فيها ده كله — مفيش نسخة ناقصة
        </h3>
        <ul className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2.5">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <HiOutlineCheck
                className="w-4 h-4 text-accent-600 flex-shrink-0 mt-[3px]"
                aria-hidden="true"
              />
              <span className="text-[13.5px] leading-[1.7] text-ink-soft">{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 pt-5 border-t border-rule text-[13px] text-ink-soft leading-[1.8]">
          التجربة 14 يوم بكل المميزات ومن غير بطاقة بنكية — تقدر تستقبل حجوزات حقيقية خلالها.
          الاشتراك والتجديد بيتم بالتنسيق معانا على واتساب؛ مفيش دفع إلكتروني جوه النظام لحد الآن.
        </p>
        {/* Pricing is where hesitation peaks — "which term fits my business"
            is exactly the question worth a real answer instead of a guess. */}
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('مرحباً، عايز أساعد أختار الباقة المناسبة لبيزنسي')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-accent-700 hover:text-accent-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded"
        >
          <FaWhatsapp className="w-4 h-4" aria-hidden="true" />
          مش متأكد أنهي باقة تناسبك؟ كلمنا على واتساب
        </a>
      </Reveal>
    </Section>
  )
}
