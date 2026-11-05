import { Link } from 'react-router-dom'
import { HiOutlineArrowLeft, HiOutlineCheck } from 'react-icons/hi2'
import { Section, SectionHead } from './Section'
import Reveal from './Reveal'
import { FEATURE_GROUPS } from '../../content/featureGroups'

/**
 * Condensed feature summary for the homepage: group headings + item titles
 * only, no descriptions — the full ruled breakdown (with descriptions and
 * captions) now lives on /product.
 *
 * Laid out as a checkerboard of navy and white cards, with every feature as its
 * own chip, so four lists of words read as four distinct parts of the product.
 */
export default function FeatureTeaser({ id }) {
  return (
    <Section id={id} tone="paper">
      <SectionHead
        title="المميزات، باختصار"
        lead="كل بند تحت موجود في النظام دلوقتي. التفاصيل والفروق كاملة في صفحة المنتج."
      />

      <div className="mt-9 grid md:grid-cols-2 gap-5">
        {FEATURE_GROUPS.map((group, i) => {
          const dark = i === 0 || i === 3
          return (
            <Reveal key={group.title} delay={i * 80} className="h-full">
              <div
                className={`group relative h-full overflow-hidden rounded-3xl p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:hover:translate-y-0 ${
                  dark ? 'bg-ink text-white' : 'bg-white border border-rule'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute -top-16 -left-16 w-48 h-48 rounded-full blur-3xl transition-opacity duration-500 ${
                    dark ? 'bg-accent-500/25 opacity-70 group-hover:opacity-100' : 'bg-accent-200/50 opacity-0 group-hover:opacity-100'
                  }`}
                />
                <div className="relative flex items-center gap-3 mb-5">
                  <span className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100 ${dark ? 'bg-accent-500 text-white' : 'bg-accent-50 text-accent-700'}`}>
                    <group.Icon className="w-6 h-6" aria-hidden="true" />
                  </span>
                  <h3 className={`text-[18px] font-bold ${dark ? 'text-white' : 'text-ink'}`}>{group.title}</h3>
                </div>
                <ul className="relative flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <li
                      key={item.title}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium leading-snug ${
                        dark ? 'bg-white/10 text-white/90' : 'bg-paper text-ink'
                      }`}
                    >
                      <HiOutlineCheck className={`w-3.5 h-3.5 flex-shrink-0 ${dark ? 'text-accent-300' : 'text-accent-600'}`} aria-hidden="true" />
                      {item.title}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )
        })}
      </div>

      <Reveal delay={200} className="mt-9">
        <Link
          to="/product"
          className="group inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-5 py-3 text-[14px] font-bold text-ink transition-colors hover:border-accent-500 hover:text-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          شوف كل المميزات بالتفصيل وجولة في النظام
          <HiOutlineArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1 motion-reduce:group-hover:translate-x-0" aria-hidden="true" />
        </Link>
      </Reveal>
    </Section>
  )
}
