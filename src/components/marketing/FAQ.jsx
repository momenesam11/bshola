import { useState } from 'react'
import { HiChevronDown } from 'react-icons/hi2'
import { Section, SectionHead } from './Section'
import { FAQS } from '../../content/faqs'

/**
 * FAQ accordion.
 *
 * Answers are rendered in the DOM at all times (hidden with `hidden`, not
 * unmounted) for two reasons: a crawler reads the answer text even when the
 * panel is closed, and the FAQPage structured data on the page must match
 * visible content or Google drops the rich result.
 *
 * The questions come from what people actually ask before buying — including
 * the two awkward ones (is the reminder automatic? is my data safe if I stop
 * paying?), answered straight.
 */

export default function FAQ({ id }) {
  const [open, setOpen] = useState(0)

  return (
    <Section id={id} tone="surface">
      <SectionHead title="أسئلة بنتسألها كتير" />

      <div className="mt-8 border-t border-rule">
        {FAQS.map((faq, i) => {
          const isOpen = open === i
          return (
            <div key={faq.q} className="border-b border-rule">
              <h3>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  className="w-full flex items-start justify-between gap-4 py-5 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <span className="text-[15px] sm:text-base font-bold text-ink leading-snug">
                    {faq.q}
                  </span>
                  <HiChevronDown
                    className={`w-5 h-5 flex-shrink-0 mt-0.5 text-ink-soft transition-transform motion-reduce:transition-none ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </h3>
              {/* Kept in the DOM when closed — see the note at the top of this file */}
              <div id={`faq-answer-${i}`} hidden={!isOpen}>
                <p className="pb-5 -mt-1 text-[14.5px] leading-[1.9] text-ink-soft max-w-[68ch]">
                  {faq.a}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
