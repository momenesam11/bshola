import { Link } from 'react-router-dom'
import { FaFacebook, FaInstagram, FaTiktok, FaWhatsapp } from 'react-icons/fa'
import SiteLinks from '../seo/SiteLinks'
import { SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP } from '../../lib/support'

/** Site-wide footer, shared by the homepage and every standalone marketing page. */
export default function Footer() {
  return (
    <footer className="bg-ink-deep text-white border-t border-white/10">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14">
        <SiteLinks />

        <div className="mt-12 pt-8 border-t border-white/10 grid sm:grid-cols-2 gap-8 items-start">
          <div>
            <p className="text-[19px] font-bold">بسهولة</p>
            <p className="mt-1.5 text-[13px] text-white/75 leading-relaxed max-w-[42ch]">
              نظام حجز مواعيد وإدارة عملاء للأنشطة اللي شغالة بمواعيد. اشتراك ثابت، بدون عمولة.
            </p>
            <ul className="mt-4 flex items-center gap-2.5">
              <li>
                <a
                  href="https://www.facebook.com/profile.php?id=61590803084934"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="بسهولة على فيسبوك"
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                >
                  <FaFacebook className="w-4 h-4" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.instagram.com/beshola.co"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="بسهولة على إنستجرام"
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                >
                  <FaInstagram className="w-4 h-4" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.tiktok.com/@beshola.co"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="بسهولة على تيك توك"
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                >
                  <FaTiktok className="w-4 h-4" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${SUPPORT_WHATSAPP}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="دعم بسهولة على واتساب"
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                >
                  <FaWhatsapp className="w-4 h-4" aria-hidden="true" />
                </a>
              </li>
            </ul>
          </div>

          <div className="sm:text-left">
            <p className="text-[12.5px] font-bold text-white/80 mb-3">الدعم والتواصل</p>
            <ul className="space-y-2 text-[13px]">
              <li>
                <a
                  href={`https://wa.me/${SUPPORT_WHATSAPP}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/85 hover:text-white transition-colors tabular-nums"
                  dir="ltr"
                >
                  {SUPPORT_PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-white/85 hover:text-white transition-colors"
                  dir="ltr"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li>
                <Link to="/privacy" className="text-white/85 hover:text-white transition-colors">
                  سياسة الخصوصية
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-white/85 hover:text-white transition-colors">
                  الشروط والأحكام
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-10 pt-6 border-t border-white/10 text-[12px] text-white/45 tabular-nums">
          © {new Date().getFullYear()} بسهولة · نظام حجز مواعيد وإدارة عملاء
        </p>
      </div>
    </footer>
  )
}
