import { Link } from 'react-router-dom'
import Seo from '../../components/seo/Seo'
import Nav from '../../components/marketing/Nav'
import Footer from '../../components/marketing/Footer'

/**
 * A real 404 page instead of the old `<Navigate to="/dashboard">` catch-all.
 *
 * Redirecting every unknown URL to an app route produced "soft 404s": Google
 * saw a 200 response with login content for typos, dead backlinks and stale
 * indexed URLs, which wastes crawl budget and can dilute the whole site's
 * quality signals. A noindex page that links back into the site is correct.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-white text-[#0F2C4E] font-sans flex flex-col" dir="rtl">
      <Seo
        title="الصفحة غير موجودة"
        description="الصفحة التي تبحث عنها غير موجودة."
        path="/404"
        noindex
      />

      <Nav />

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <p className="text-6xl font-black text-[#16B89A] mb-4">404</p>
        <h1 className="text-2xl sm:text-3xl font-black mb-4">الصفحة غير موجودة</h1>
        <p className="text-slate-500 mb-8 max-w-md leading-relaxed">
          الرابط الذي فتحته غير صحيح أو تم تغييره. تقدر ترجع للرئيسية أو تتصفح حلول بسهولة.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/"
            className="bg-[#16B89A] hover:bg-accent-600 text-white font-bold px-7 py-3.5 rounded-2xl transition-colors"
          >
            الرجوع للرئيسية
          </Link>
          <Link
            to="/pricing"
            className="border border-slate-200 hover:border-[#0F2C4E] font-semibold px-7 py-3.5 rounded-2xl transition-colors"
          >
            الأسعار والباقات
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  )
}
