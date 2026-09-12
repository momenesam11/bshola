import { Link } from 'react-router-dom'
import { MARKETING_PAGES } from '../../content/marketingPages'

/**
 * The site's internal link hub, rendered in the footer of every public page.
 *
 * Internal links are how a crawler discovers the keyword pages at all: without
 * a link path from the home page they are orphans that only the sitemap knows
 * about, which crawls slowly and ranks worse. It also spreads link equity from
 * the home page (the only page with external links today) to every cluster.
 */
export default function SiteLinks({ className = '' }) {
  const solutions = MARKETING_PAGES.filter((p) => p.group === 'solutions')
  const features = MARKETING_PAGES.filter((p) => p.group === 'features')

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 gap-8 text-right ${className}`}>
      <nav aria-labelledby="footer-solutions">
        <h3 id="footer-solutions" className="text-sm font-bold mb-4 text-white">
          حلول حسب نوع النشاط
        </h3>
        <ul className="space-y-2.5">
          {solutions.map((p) => (
            <li key={p.slug}>
              <Link
                to={`/${p.slug}`}
                className="text-xs text-slate-300 hover:text-accent transition-colors leading-relaxed"
              >
                {p.keyword}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-labelledby="footer-features">
        <h3 id="footer-features" className="text-sm font-bold mb-4 text-white">
          مميزات النظام
        </h3>
        <ul className="space-y-2.5">
          {features.map((p) => (
            <li key={p.slug}>
              <Link
                to={`/${p.slug}`}
                className="text-xs text-slate-300 hover:text-accent transition-colors leading-relaxed"
              >
                {p.keyword}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-labelledby="footer-more">
        <h3 id="footer-more" className="text-sm font-bold mb-4 text-white">
          روابط مهمة
        </h3>
        <ul className="space-y-2.5">
          <li>
            <Link to="/" className="text-xs text-slate-300 hover:text-accent transition-colors">
              الرئيسية — نظام حجز مواعيد
            </Link>
          </li>
          <li>
            <Link to="/pricing" className="text-xs text-slate-300 hover:text-accent transition-colors">
              الأسعار والباقات
            </Link>
          </li>
          <li>
            <Link to="/product" className="text-xs text-slate-300 hover:text-accent transition-colors">
              جولة في المنتج والمميزات
            </Link>
          </li>
          <li>
            <Link to="/faq" className="text-xs text-slate-300 hover:text-accent transition-colors">
              الأسئلة الشائعة
            </Link>
          </li>
          <li>
            <Link to="/register" className="text-xs text-slate-300 hover:text-accent transition-colors">
              ابدأ تجربة 14 يوم مجاناً
            </Link>
          </li>
          <li>
            <Link to="/login" className="text-xs text-slate-300 hover:text-accent transition-colors">
              تسجيل الدخول
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
