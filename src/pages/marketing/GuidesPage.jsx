import { Link } from 'react-router-dom'
import { HiOutlineArrowLeft } from 'react-icons/hi2'
import Seo from '../../components/seo/Seo'
import Nav from '../../components/marketing/Nav'
import Footer from '../../components/marketing/Footer'
import FinalCta from '../../components/marketing/FinalCta'
import { GUIDES } from '../../content/guides'
import { GUIDES_META } from '../../content/pageMeta'
import { breadcrumbSchema, organizationSchema } from '../../lib/seo'

/** /guides: every guide in one place, and the parent page in their breadcrumb. */
export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased" dir="rtl">
      <Seo
        title={GUIDES_META.title}
        description={GUIDES_META.description}
        path={GUIDES_META.path}
        schemas={[organizationSchema(), breadcrumbSchema([{ name: 'الرئيسية', path: '/' }, { name: 'الأدلة' }])]}
      />
      <Nav />
      <main>
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">أدلة إدارة العيادات وحجز المواعيد</h1>
          <p className="mt-4 text-[16px] leading-[1.85] text-ink-soft max-w-[62ch]">
            إجابات عملية للأسئلة اللي بتقابل أصحاب العيادات في مصر كل يوم، سواء اشتركت معانا أو لأ.
          </p>
          <ul className="mt-10 border-t border-rule">
            {GUIDES.map((g) => (
              <li key={g.slug} className="border-b border-rule">
                <Link to={`/${g.slug}`} className="group flex items-start justify-between gap-4 py-5">
                  <span>
                    <span className="block text-[18px] font-bold group-hover:underline">{g.h1}</span>
                    <span className="block mt-1 text-[14.5px] leading-[1.75] text-ink-soft">{g.description}</span>
                  </span>
                  <HiOutlineArrowLeft className="w-5 h-5 text-accent-600 flex-shrink-0 mt-1" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
