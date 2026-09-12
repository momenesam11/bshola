import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HiChevronDown, HiOutlineArrowLeft } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { Section, SectionHead } from './Section'
import Reveal from './Reveal'
import { FAQS } from '../../content/faqs'
import { SUPPORT_WHATSAPP } from '../../lib/support'

/**
 * FAQ accordion.
 *
 * Answers are rendered in the DOM at all times, never unmounted, for two
 * reasons: a crawler reads the answer text even when the panel is visually
 * closed, and the FAQPage structured data on the page must match visible
 * content or Google drops the rich result. The open/close motion is a CSS
 * grid-rows collapse (0fr → 1fr) rather than the `hidden` attribute, which
 * used to snap instantly — the row still exists in the DOM either way, only
 * how it's hidden changed.
 *
 * The questions come from what people actually ask before buying — including
 * the two awkward ones (is the reminder automatic? is my data safe if I stop
 * paying?), answered straight.
 *
 * `limit` renders only the first N questions with a link to the full /faq
 * page (used on the homepage, which used to carry all of them). Whatever the
 * page passes to `faqSchema()` for its structured data must match this same
 * slice — see LandingPage.jsx and FaqPage.jsx.
 */
export default function FAQ({ id, limit, title = 'أسئلة بنتسألها كتير', headingLevel = 'h2' }) {
  const [open, setOpen] = useState(0)
  const items = limit ? FAQS.slice(0, limit) : FAQS
  const truncated = limit && FAQS.length > limit

  return (
    <Section id={id} tone="surface">
      <SectionHead as={headingLevel} title={title} />

      <Reveal delay={100} className="mt-8 border-t border-rule">
        {items.map((faq, i) => {
          const isOpen = open === i
          return (
            <div key={faq.q} className="border-b border-rule">
              <h3>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  className="group w-full flex items-start justify-between gap-4 py-5 text-right transition-colors hover:text-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <span className="text-[15px] sm:text-base font-bold text-ink leading-snug transition-colors group-hover:text-accent-700">
                    {faq.q}
                  </span>
                  <HiChevronDown
                    className={`w-5 h-5 flex-shrink-0 mt-0.5 text-ink-soft transition-transform duration-300 motion-reduce:transition-none group-hover:text-accent-600 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </h3>
              {/* grid-rows collapse: 0fr hides without display:none, so height
                  animates instead of snapping — content stays in the a11y
                  tree and in the raw HTML crawlers read either way. */}
              <div
                id={`faq-answer-${i}`}
                aria-hidden={!isOpen}
                className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="overflow-hidden">
                  <p className="pb-5 -mt-1 text-[14.5px] leading-[1.9] text-ink-soft max-w-[68ch]">
                    {faq.a}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </Reveal>

      {truncated ? (
        <Reveal delay={160} className="mt-6">
          <Link
            to="/faq"
            className="inline-flex items-center gap-1.5 text-[14px] font-bold text-accent-700 hover:text-accent-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded"
          >
            شوف كل الأسئلة
            <HiOutlineArrowLeft className="w-4 h-4" aria-hidden="true" />
          </Link>
        </Reveal>
      ) : (
        // The full list, not the homepage teaser: someone who read every
        // question and still isn't sure has a question specific to them —
        // worth a direct line instead of hoping they scroll to the closing CTA.
        <Reveal delay={160} className="mt-6">
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('مرحباً، عندي سؤال مش لاقيه في صفحة الأسئلة الشائعة')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[14px] font-bold text-accent-700 hover:text-accent-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded"
          >
            <FaWhatsapp className="w-4 h-4" aria-hidden="true" />
            مش لاقي سؤالك؟ اسألنا على واتساب
          </a>
        </Reveal>
      )}
    </Section>
  )
}
