import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { HiOutlineCheck } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import BookingPhoneDemo from '../../components/marketing/BookingPhoneDemo'
import Logo from '../../components/marketing/Logo'
import { usePreview } from '../../hooks/useGrowth'
import { initialsFor } from '../../lib/growth/preview'
import { SUPPORT_WHATSAPP } from '../../lib/support'
import { PLANS } from '../../lib/seo'

/**
 * Personalised demo: "this is what <clinic>'s booking page would look like".
 * Made from the admin's growth screen and sent to one prospect.
 *
 * Marked as illustrative in three places (banner, under the phone, footer):
 * this clinic has NOT signed up and nothing here is connected to them. The CTA
 * carries their ref code, so signing up from here credits the right lead.
 * Not indexed — it's a page made for one person.
 */

const POINTS = [
  'المريض يحجز من اللينك 24 ساعة ويشوف المواعيد الفاضية بنفسه',
  'كل ميعاد بمدته، والحجز المزدوج ممنوع',
  'رسايل تذكير مواعيد بكرا جاهزة — تبعتها من رقم العيادة بضغطة زر',
  'ملف لكل مريض: الزيارات والمدفوعات وخطة العلاج',
  'اشتراك ثابت بالجنيه ومفيش عمولة على أي حجز',
]

export default function DemoPage() {
  const { code } = useParams()
  const { data: preview, isLoading } = usePreview(code)

  if (isLoading) {
    return <div className="min-h-screen bg-ink flex items-center justify-center"><div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!preview) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <Helmet><title>الصفحة مش متاحة — بسهولة</title><meta name="robots" content="noindex, nofollow" /></Helmet>
        <Logo />
        <p className="mt-6 text-lg font-bold text-ink">الصفحة دي مش متاحة</p>
        <p className="mt-2 text-sm text-ink-soft">ممكن تكون اتقفلت. تقدر تعمل صفحة حجز لعيادتك بنفسك في دقايق.</p>
        <Link to="/register" className="mt-6 bg-accent-500 hover:bg-accent-600 text-white font-bold px-6 py-3 rounded-xl">جرّب 14 يوم ببلاش</Link>
      </div>
    )
  }

  const services = (preview.services ?? []).map((s) => ({
    name: s.name,
    duration: s.duration ? `${s.duration} دقيقة` : '',
    price: s.price ?? null,
  }))
  const registerHref = `/register?ref=${encodeURIComponent(preview.ref)}`
  const waText = `أهلاً، شفت صفحة الحجز التجريبية لـ ${preview.name} وعايز أعرف أكتر`

  return (
    <div className="min-h-screen bg-ink text-white font-sans" dir="rtl">
      <Helmet>
        <title>{`صفحة حجز ${preview.name} — مثال من بسهولة`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="bg-amber-400 text-amber-950 text-center text-[13px] font-semibold px-4 py-2">
        دي صفحة توضيحية معمولة لـ {preview.name} كمثال — مش صفحة حقيقية ومش مربوطة بالعيادة لسه
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-accent-400 text-sm font-bold">معمولة مخصوص لـ {preview.name}</p>
          <h1 className="mt-2 text-[28px] sm:text-[36px] font-extrabold leading-[1.25]">
            كده مرضاك هيحجزوا عندك — من لينك واحد
          </h1>
          <ul className="mt-6 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[15px] text-white/90 leading-relaxed">
                <HiOutlineCheck className="w-5 h-5 text-accent-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link to={registerHref} className="inline-flex items-center justify-center bg-accent-500 hover:bg-accent-600 text-white text-[15px] font-bold px-7 py-4 rounded-xl">
              فعّل صفحة {preview.name} الحقيقية — 14 يوم ببلاش
            </Link>
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-white/25 hover:border-white/60 text-white text-[15px] font-semibold px-7 py-4 rounded-xl">
              <FaWhatsapp className="w-5 h-5 text-accent-400" aria-hidden="true" /> اسأل على واتساب
            </a>
          </div>
          <p className="mt-4 text-[13px] text-white/60">
            من غير بطاقة بنكية · بعد التجربة من {PLANS[0].price} جنيه في الشهر · مفيش عمولة على الحجوزات
          </p>
        </div>

        <div>
          <BookingPhoneDemo
            name={preview.name}
            specialty={preview.specialty || preview.area || ''}
            initials={initialsFor(preview.name)}
            services={services.length ? services : undefined}
            color={preview.color || undefined}
          />
          <p className="mt-4 text-center text-[11.5px] text-white/45 max-w-[280px] mx-auto leading-relaxed">
            عرض توضيحي: الخدمات والمواعيد مثال، وبتتظبط على مواعيد وأسعار عيادتك الحقيقية لما تفعّلها
          </p>
        </div>
      </div>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">
        <Link to="/" className="hover:text-white/70">بسهولة — نظام حجز مواعيد عربي</Link> · الصفحة دي مثال ومش مربوطة بأي عيادة
      </footer>
    </div>
  )
}
