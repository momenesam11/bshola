import { Link } from 'react-router-dom'
import Seo from '../../components/seo/Seo'
import SiteLinks from '../../components/seo/SiteLinks'
import { LAST_UPDATED, legalPageBySlug } from '../../content/legalPages'
import { breadcrumbSchema, organizationSchema } from '../../lib/seo'
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from '../../lib/support'

/**
 * Privacy policy / terms.
 *
 * Indexable on purpose: these two pages are a trust signal Google looks for on
 * any product that handles customer records, and the footer used to render
 * them as dead, unclickable text.
 *
 * They carry no FAQ or product schema — only Organization and a breadcrumb.
 * Marking legal text up as marketing content would be wrong.
 */
export default function LegalPage({ slug }) {
  const page = legalPageBySlug(slug)

  if (!page) {
    if (import.meta.env.DEV) throw new Error(`LegalPage: unknown slug "${slug}"`)
    return null
  }

  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased flex flex-col" dir="rtl">
      <Seo
        title={page.metaTitle}
        description={page.metaDescription}
        path={`/${page.slug}`}
        schemas={[
          organizationSchema(),
          breadcrumbSchema([{ name: 'الرئيسية', path: '/' }, { name: page.title }]),
        ]}
      />

      <header className="bg-ink text-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="text-[22px] font-bold tracking-tight">
            بسهولة
          </Link>
          <Link
            to="/"
            className="text-[13.5px] font-medium text-white/75 hover:text-white transition-colors"
          >
            الرجوع للرئيسية
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <h1 className="text-[28px] sm:text-[36px] font-extrabold leading-[1.2] text-balance">
            {page.title}
          </h1>
          <p className="mt-2 text-[12.5px] text-ink-soft/80 tabular-nums">
            آخر تحديث: {LAST_UPDATED}
          </p>
          <p className="mt-5 text-[15.5px] leading-[1.9] text-ink-soft max-w-[64ch]">
            {page.intro}
          </p>

          <div className="mt-10 border-t border-rule">
            {page.sections.map((section) => (
              <section key={section.h2} className="py-8 border-b border-rule">
                <h2 className="text-[18px] sm:text-[20px] font-bold leading-snug">{section.h2}</h2>

                {section.body && (
                  <p className="mt-3 text-[15px] leading-[1.9] text-ink-soft max-w-[66ch]">
                    {section.body}
                  </p>
                )}

                {section.bullets && (
                  <ul className="mt-4 space-y-2.5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2.5">
                        <span
                          className="mt-[9px] w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-[14.5px] leading-[1.85] text-ink-soft max-w-[64ch]">
                          {bullet}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.note && (
                  <p className="mt-4 border-r-2 border-accent-500 bg-white px-4 py-3 text-[14px] leading-[1.8] text-ink max-w-[64ch]">
                    {section.note}
                  </p>
                )}
              </section>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent-700 hover:text-accent-800 transition-colors"
            >
              اسألنا على واتساب
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold text-accent-700 hover:text-accent-800 transition-colors"
              dir="ltr"
            >
              {SUPPORT_EMAIL}
            </a>
            <Link
              to={page.slug === 'privacy' ? '/terms' : '/privacy'}
              className="font-semibold text-ink hover:text-ink-soft transition-colors"
            >
              {page.slug === 'privacy' ? 'الشروط والأحكام' : 'سياسة الخصوصية'}
            </Link>
          </div>
        </div>
      </main>

      <footer className="bg-ink-deep text-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
          <SiteLinks />
          <p className="mt-10 pt-6 border-t border-white/10 text-[12px] text-white/45 tabular-nums">
            © {new Date().getFullYear()} بسهولة · نظام حجز مواعيد وإدارة عملاء
          </p>
        </div>
      </footer>
    </div>
  )
}
