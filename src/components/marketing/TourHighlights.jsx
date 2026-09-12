import { TOUR_HIGHLIGHTS } from '../../content/featureGroups'

/** Compact highlight strip rendered under the system-tour video. */
export default function TourHighlights() {
  return (
    <div className="mt-10 pt-8 border-t border-rule">
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
        {TOUR_HIGHLIGHTS.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5">
            <item.Icon className="w-4 h-4 text-accent-600 flex-shrink-0" aria-hidden="true" />
            <span className="text-[13.5px] font-semibold text-ink">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
