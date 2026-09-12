import { Link } from 'react-router-dom'
import { HiOutlineArrowLeft } from 'react-icons/hi2'
import { Section, SectionHead } from './Section'
import Reveal from './Reveal'
import { FEATURE_GROUPS } from '../../content/featureGroups'

/**
 * Condensed feature summary for the homepage: group headings + item titles
 * only, no descriptions — the full ruled breakdown (with descriptions and
 * captions) now lives on /product. This is what kept the homepage long: four
 * full FeatureGroup blocks with every description repeated in full.
 */
export default function FeatureTeaser({ id }) {
  return (
    <Section id={id} tone="surface">
      <SectionHead
        title="المميزات، باختصار"
        lead="كل بند تحت موجود في النظام دلوقتي. التفاصيل والفروق كاملة في صفحة المنتج."
      />

      <div className="mt-9 grid sm:grid-cols-2 gap-x-10 gap-y-8">
        {FEATURE_GROUPS.map((group, i) => (
          <Reveal key={group.title} delay={i * 80}>
            <div className="flex items-center gap-2.5 mb-3">
              <group.Icon className="w-5 h-5 text-accent-600 flex-shrink-0" aria-hidden="true" />
              <h3 className="text-[15.5px] font-bold text-ink">{group.title}</h3>
            </div>
            <p className="text-[13.5px] leading-[1.9] text-ink-soft">
              {group.items.map((item) => item.title).join(' · ')}
            </p>
          </Reveal>
        ))}
      </div>

      <Reveal delay={200} className="mt-10">
        <Link
          to="/product"
          className="inline-flex items-center gap-1.5 text-[14px] font-bold text-accent-700 hover:text-accent-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded"
        >
          شوف كل المميزات بالتفصيل وجولة في النظام
          <HiOutlineArrowLeft className="w-4 h-4" aria-hidden="true" />
        </Link>
      </Reveal>
    </Section>
  )
}
