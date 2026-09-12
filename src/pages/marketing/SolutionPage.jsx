import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HiOutlineArrowLeft, HiCheck, HiChevronDown, HiChevronUp } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import Seo from '../../components/seo/Seo'
import Nav from '../../components/marketing/Nav'
import Footer from '../../components/marketing/Footer'
import { pageBySlug } from '../../content/marketingPages'
import {
  breadcrumbSchema,
  faqSchema,
  organizationSchema,
  softwareApplicationSchema,
} from '../../lib/seo'
import { SUPPORT_WHATSAPP } from '../../lib/support'

/**
 * One template for every keyword-targeted page (see content/marketingPages.js).
 *
 * Its structure is the on-page SEO contract: exactly one H1 carrying the target
 * keyword, H2s per sub-topic, a visible FAQ block that backs the FAQPage schema
 * (Google requires the answer text to be on the page, not only in JSON-LD), and
 * internal links out to the related clusters.
 */
export default function SolutionPage({ slug }) {
  const page = pageBySlug(slug)
  const [openFaq, setOpenFaq] = useState(0)

  // Routes are generated from the same content file, so a miss means a typo in
  // a hand-written route — fail loudly in dev rather than render an empty page.
  if (!page) {
    if (import.meta.env.DEV) throw new Error(`SolutionPage: unknown slug "${slug}"`)
    return null
  }

  const path = `/${page.slug}`
  const crumbs = [{ name: 'الرئيسية', path: '/' }]
  if (page.group !== 'pricing') crumbs.push({ name: page.groupLabel, path: '/' })
  crumbs.push({ name: page.h1 })

  return (
    <div className="min-h-screen bg-white text-[#0F2C4E] font-sans antialiased" dir="rtl">
      <Seo
        title={page.title}
        description={page.description}
        path={path}
        ogType="article"
        schemas={[
          organizationSchema(),
          softwareApplicationSchema(),
          faqSchema(page.faqs),
          breadcrumbSchema(crumbs),
        ]}
      />

      <Nav />

      <main className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* BREADCRUMB — mirrors the BreadcrumbList schema above */}
        <nav aria-label="مسار التنقل" className="pt-6 pb-2">
          <ol className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <li>
              <Link to="/" className="hover:text-accent transition-colors">
                الرئيسية
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-slate-500 font-semibold">{page.groupLabel}</li>
            <li aria-hidden="true">/</li>
            <li className="text-[#0F2C4E] font-bold">{page.keyword}</li>
          </ol>
        </nav>

        {/* HERO */}
        <section className="pt-6 pb-12 border-b border-slate-100">
          <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-5">{page.h1}</h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-3xl mb-8">{page.intro}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 bg-[#16B89A] hover:bg-accent-600 text-white font-bold px-7 py-3.5 rounded-2xl shadow-lg shadow-accent/20 transition-all hover:scale-102"
            >
              <span>ابدأ تجربة 14 يوم مجاناً</span>
              <HiOutlineArrowLeft className="w-5 h-5" />
            </Link>
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-slate-200 hover:border-[#0F2C4E] font-semibold px-7 py-3.5 rounded-2xl transition-colors"
            >
              <FaWhatsapp className="w-5 h-5 text-[#16B89A]" />
              <span>تحدث معنا على واتساب</span>
            </a>
          </div>
        </section>

        {/* BODY SECTIONS */}
        {page.sections.map((section) => (
          <section key={section.h2} className="py-12 border-b border-slate-100">
            <h2 className="text-2xl font-black mb-4">{section.h2}</h2>
            <p className="text-base text-slate-600 leading-relaxed max-w-3xl">{section.body}</p>
            {section.bullets && (
              <ul className="grid sm:grid-cols-2 gap-3 mt-7">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 bg-slate-50 rounded-2xl p-4">
                    <HiCheck className="w-5 h-5 text-[#16B89A] flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold text-slate-700 leading-relaxed">{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* FAQ — visible text is what makes the FAQPage schema eligible */}
        {page.faqs?.length > 0 && (
          <section className="py-12 border-b border-slate-100">
            <h2 className="text-2xl font-black mb-6">أسئلة شائعة عن {page.keyword}</h2>
            <div className="space-y-3">
              {page.faqs.map((faq, idx) => (
                <div key={faq.q} className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    aria-expanded={openFaq === idx}
                    className="w-full px-5 py-4 bg-slate-50 hover:bg-slate-100/60 flex justify-between items-center gap-3 text-right transition-colors"
                  >
                    <h3 className="font-bold text-sm sm:text-base">{faq.q}</h3>
                    {openFaq === idx ? (
                      <HiChevronUp className="w-5 h-5 text-accent flex-shrink-0" />
                    ) : (
                      <HiChevronDown className="w-5 h-5 text-[#0F2C4E]/60 flex-shrink-0" />
                    )}
                  </button>
                  {/* Rendered always (hidden, not unmounted) so crawlers and
                      screen readers still reach the answer text. */}
                  <div className={openFaq === idx ? 'border-t border-slate-100' : 'hidden'}>
                    <p className="px-5 py-4 text-sm text-slate-600 leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RELATED — internal linking between clusters */}
        {page.related?.length > 0 && (
          <section className="py-12">
            <h2 className="text-2xl font-black mb-6">اقرأ أيضاً</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {page.related.map((relatedSlug) => {
                const target = pageBySlug(relatedSlug)
                if (!target) return null
                return (
                  <Link
                    key={relatedSlug}
                    to={`/${target.slug}`}
                    className="flex items-center justify-between gap-3 border border-slate-200 hover:border-accent rounded-2xl px-5 py-4 transition-colors group"
                  >
                    <span className="text-sm font-bold group-hover:text-accent transition-colors">
                      {target.keyword}
                    </span>
                    <HiOutlineArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-accent transition-colors" />
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* CLOSING CTA — a WhatsApp option sits next to the trial signup:
            someone who read this far but still has a question (about their
            specific business, a feature not covered above) should be able to
            just ask instead of bouncing. */}
        <section className="mb-16 bg-[#0F2C4E] text-white rounded-3xl p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-black mb-4">جاهز تنظّم حجوزاتك؟</h2>
          <p className="text-slate-300 mb-7 max-w-xl mx-auto leading-relaxed">
            14 يوم تجربة مجانية بكل المميزات، بدون بطاقة بنكية وبدون التزام.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 bg-[#16B89A] hover:bg-accent-600 text-white font-bold px-8 py-4 rounded-2xl transition-colors"
            >
              <span>ابدأ الآن مجاناً</span>
              <HiOutlineArrowLeft className="w-5 h-5" />
            </Link>
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-white/25 hover:border-white/60 text-white font-semibold px-8 py-4 rounded-2xl transition-colors"
            >
              <FaWhatsapp className="w-5 h-5" />
              <span>عندك سؤال؟ كلمنا على واتساب</span>
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
