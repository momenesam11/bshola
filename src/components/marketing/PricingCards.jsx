import { Link } from 'react-router-dom'
import { HiCheck, HiOutlineLockClosed, HiOutlineSparkles } from 'react-icons/hi2'
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
 *
 * "بدلاً من" is the price new subscribers will pay after the launch (PLANS in
 * lib/seo.js), never an invented one. The price lock is a promise in the terms
 * too (legalPages.js, MARKETING_CLAIMS.md §7).
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
  'تدريب مجاني على النظام',
  'دعم بالعامية على واتساب والتليفون',
  'صيانة وتحديثات من غير رسوم زيادة',
]

export default function PricingCards({ id }) {
  return (
    <Section id={id} tone="surface">
      <SectionHead
        title="أسعار الإطلاق: اللي يشترك دلوقتي سعره يفضل ثابت"
        lead="الأسعار دي أقل عشان عايزين عيادات كتير تبدأ معانا. بعد فترة الإطلاق هتبقى الأسعار المتشطّبة للجداد، بس اللي مشترك يفضل بسعره طول ما بيجدد. كل الباقات بتفتح النظام بالكامل، ومفيش عمولة على أي حجز."
      />

      <div className="mt-10 grid md:grid-cols-3 gap-5 items-stretch">
        {PLANS.map((plan, i) => {
          const perMonth = Math.round(plan.price / plan.months)
          const isBest = plan.months === 6

          return (
            <Reveal as="div" key={plan.name} delay={i * 100} className={isBest ? 'md:order-last' : ''}>
              <div
                className={`relative h-full rounded-3xl p-7 flex flex-col transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl motion-reduce:hover:translate-y-0 ${
                  isBest
                    ? 'bg-ink text-white shadow-xl ring-2 ring-accent-400'
                    : 'bg-paper border border-rule'
                }`}
              >
                <div className="flex items-center justify-between gap-2 min-h-[28px]">
                  <h3 className={`text-[16px] font-bold ${isBest ? 'text-white' : 'text-ink'}`}>{plan.name}</h3>
                  {isBest && (
                    <span className="text-[12px] font-bold text-ink bg-accent-300 px-2.5 py-1 rounded-full whitespace-nowrap">
                      أوفر سعر شهري
                    </span>
                  )}
                </div>

                <p className={`mt-5 text-[46px] font-extrabold leading-none tabular-nums ${isBest ? 'text-white' : 'text-ink'}`}>
                  {plan.price.toLocaleString('en-EG')}
                  <span className={`text-[16px] font-semibold ${isBest ? 'text-white/70' : 'text-ink-soft'}`}> جنيه</span>
                </p>

                <p className={`mt-3 inline-block self-start rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums ${isBest ? 'bg-accent-500/20 text-accent-200' : 'bg-accent-50 text-accent-800'}`}>
                  بدلاً من <s>{plan.regularPrice.toLocaleString('en-EG')}</s> جنيه بعد الإطلاق · وفّر 25%
                </p>

                <p className={`mt-3 mb-6 text-[13.5px] tabular-nums ${isBest ? 'text-white/75' : 'text-ink-soft'}`}>
                  {plan.months === 1
                    ? 'شهرياً · تجديد كل شهر'
                    // Arabic noun-number agreement: 3–10 takes the plural
                    // (شهور), 11+ takes the singular (شهر) — "12 شهور" reads
                    // as a mistake to an Arabic reader.
                    : `لمدة ${plan.months} ${plan.months <= 10 ? 'شهور' : 'شهر'} · يعني ${perMonth} جنيه في الشهر`}
                </p>

                <Link
                  to="/register"
                  className={`mt-auto text-center text-[15px] font-bold py-3.5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] motion-reduce:hover:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    isBest
                      ? 'bg-accent-500 hover:bg-accent-400 text-white focus-visible:outline-white'
                      : 'bg-white border border-ink/20 hover:border-ink text-ink focus-visible:outline-ink'
                  }`}
                >
                  ابدأ تجربتك المجانية
                </Link>
              </div>
            </Reveal>
          )
        })}
      </div>

      <Reveal delay={150} className="mt-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-ink via-ink to-accent-800 text-white p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shine motion-reduce:hidden" />
          <div className="relative flex items-start gap-4">
            <span className="w-12 h-12 rounded-2xl bg-accent-500 flex items-center justify-center flex-shrink-0">
              <HiOutlineLockClosed className="w-6 h-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[19px] font-bold">الحق سعر الإطلاق</p>
              <p className="mt-1 text-[14px] leading-[1.8] text-white/85 max-w-[62ch]">
                لما الأسعار تزيد، هتزيد على الجداد بس. للقديم قديم: سعرك يفضل زي ما هو طول ما بتجدد باقتك من غير انقطاع.
              </p>
            </div>
          </div>
          <Link to="/register" className="relative flex-shrink-0 text-center bg-white text-ink hover:bg-accent-50 text-[15px] font-bold px-7 py-3.5 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            ابدأ دلوقتي
          </Link>
        </div>
      </Reveal>

      {/* One shared feature list — the plans are terms, not tiers */}
      <Reveal delay={200} className="mt-6 rounded-3xl border border-rule bg-paper p-6 sm:p-8">
        <h3 className="text-[18px] font-bold text-ink">
          كل باقة فيها ده كله — مفيش نسخة ناقصة
        </h3>
        <ul className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3.5">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-accent-500 text-white flex items-center justify-center flex-shrink-0">
                <HiCheck className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="text-[14.5px] leading-[1.6] text-ink">{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 pt-5 border-t border-rule text-[13.5px] text-ink-soft leading-[1.8]">
          التجربة 14 يوم بكل المميزات ومن غير بطاقة بنكية — تقدر تستقبل حجوزات حقيقية خلالها.
          الاشتراك والتجديد بيتم بالتنسيق معانا على واتساب؛ مفيش دفع إلكتروني جوه النظام لحد الآن.
        </p>

        <div className="mt-5 grid md:grid-cols-2 gap-3">
          <p className="flex items-start gap-3 rounded-2xl bg-white border border-rule p-4 text-[14px] leading-[1.75] text-ink">
            <HiOutlineSparkles className="w-5 h-5 text-accent-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <b>تفضّل تدفع مرة واحدة؟</b> فيه اشتراك مدى الحياة لأول 20 عيادة بس.{' '}
              <a
                href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('مرحباً، عايز أعرف تفاصيل الاشتراك مدى الحياة')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-accent-700 hover:text-accent-800 underline"
              >
                اسأل عليه على واتساب
              </a>
            </span>
          </p>
          {/* Pricing is where hesitation peaks — "which term fits my business"
              is exactly the question worth a real answer instead of a guess. */}
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('مرحباً، عايز أساعد أختار الباقة المناسبة لبيزنسي')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl bg-white border border-rule p-4 text-[14px] font-bold text-accent-700 hover:border-accent-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <FaWhatsapp className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            مش متأكد أنهي باقة تناسبك؟ كلمنا على واتساب
          </a>
        </div>
      </Reveal>
    </Section>
  )
}
