import { RuledRow } from './Section'

/**
 * One group of features as a ruled register block, not a grid of identical
 * cards: the group title sits in its own column and the features read down a
 * hairline-separated list. `note` is where an honest caveat belongs (e.g. that
 * the medical record only applies to clinics).
 */
export default function FeatureGroup({ title, Icon, note, items }) {
  return (
    <div className="grid sm:grid-cols-3 gap-5 sm:gap-8 py-8 sm:py-10 border-t border-rule first:border-t-0 first:pt-0">
      <div className="sm:col-span-1">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <Icon className="w-5 h-5 text-accent-600 flex-shrink-0" aria-hidden="true" />
          )}
          <h3 className="text-[17px] sm:text-[19px] font-bold text-ink leading-snug">{title}</h3>
        </div>
        {note && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft/80 max-w-[34ch]">{note}</p>
        )}
      </div>

      <div className="sm:col-span-2">
        {items.map((item) => (
          <RuledRow key={item.title} label={item.title}>
            {item.desc}
          </RuledRow>
        ))}
      </div>
    </div>
  )
}
