import { Link } from 'react-router-dom'
import { FaFacebook, FaInstagram, FaPhone, FaTiktok, FaWhatsapp } from 'react-icons/fa'
import Reveal from './Reveal'
import LeadCaptureForm from './LeadCaptureForm'
import { DEMO_BOOKING_PATH, SOCIAL_LINKS, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_E164, SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_DISPLAY } from '../../lib/support'

/** Closing call-to-action, shared by the homepage and every standalone marketing page. */
export default function FinalCta({
  title = 'جرّبه 14 يوم على مواعيدك الحقيقية',
  lead = 'الإعداد 6 خطوات، وفي آخرها يبقى معاك رابط حجز شغال تبعته لعملاءك. من غير بطاقة بنكية، ومن غير أي التزام.',
}) {
  return (
    <section className="bg-ink-deep text-white border-t border-white/10">
      <Reveal className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20 text-center">
        <h2 className="text-[24px] sm:text-[32px] font-bold leading-[1.3] text-balance max-w-[34ch] mx-auto">
          {title}
        </h2>
        <p className="mt-4 text-[15px] leading-[1.85] text-white/85 max-w-[52ch] mx-auto">{lead}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/register"
            className="inline-flex items-center justify-center bg-accent-500 hover:bg-accent-600 text-white text-[15px] font-bold px-8 py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] motion-reduce:hover:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            ابدأ تجربتك المجانية
          </Link>
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 border border-white/25 hover:border-white/60 text-white text-[15px] font-semibold px-8 py-4 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
          >
            <FaWhatsapp className="w-5 h-5 text-accent-400" aria-hidden="true" />
            اسألنا على واتساب
          </a>
        </div>

        {/* For the visitor who won't sign up alone but will take a call —
            lands at the top of the admin's call list (/admin/growth). */}
        <div className="mt-10 max-w-xl mx-auto">
          <p className="text-[14px] text-white/80 mb-3">أو سيب رقمك ونكلّمك نجهّزلك الصفحة بنفسنا:</p>
          <LeadCaptureForm />
        </div>

        <p className="mt-8 text-[14px] text-white/80">
          عايز تشوف الحجز بنفسك الأول؟{' '}
          <a href={DEMO_BOOKING_PATH} target="_blank" rel="noopener" className="font-bold text-accent-400 underline hover:text-accent-300">
            جرّب صفحة حجز حقيقية
          </a>
        </p>

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[14px] text-white/90">
          <li>
            <a href={`tel:${SUPPORT_PHONE_E164}`} className="inline-flex items-center gap-2 hover:text-white">
              <FaPhone className="w-3.5 h-3.5" aria-hidden="true" /> اتصال: <span dir="ltr" className="tabular-nums">{SUPPORT_PHONE_DISPLAY}</span>
            </a>
          </li>
          <li>
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white">
              <FaWhatsapp className="w-4 h-4" aria-hidden="true" /> واتساب: <span dir="ltr" className="tabular-nums">{SUPPORT_WHATSAPP_DISPLAY}</span>
            </a>
          </li>
          <li><a href={SOCIAL_LINKS.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white"><FaFacebook className="w-4 h-4" aria-hidden="true" /> فيسبوك</a></li>
          <li><a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white"><FaInstagram className="w-4 h-4" aria-hidden="true" /> إنستجرام</a></li>
          <li><a href={SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white"><FaTiktok className="w-4 h-4" aria-hidden="true" /> تيك توك</a></li>
        </ul>
      </Reveal>
    </section>
  )
}
