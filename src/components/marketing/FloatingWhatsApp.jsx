import { useState } from 'react'
import { FaWhatsapp } from 'react-icons/fa'
import { SUPPORT_WHATSAPP } from '../../lib/support'

const PREFILLED_MESSAGE = 'مرحباً، عايز أعرف أكتر عن بسهولة'

/**
 * Persistent floating WhatsApp button, mounted once inside Nav so it rides
 * along on every marketing page. Always the same tap target regardless of
 * scroll position — the fastest path to a real conversation for a visitor
 * who's decided to just ask rather than read further.
 *
 * The label expands on hover/focus (desktop) so the button's purpose reads
 * as "تواصل معنا" rather than a bare icon guessing game; it opens already
 * showing on touch devices via `group-focus`/`:active` since there's no
 * hover there — it doesn't need to, the icon plus WhatsApp's own green is
 * unambiguous on a touch device already familiar with the icon.
 */
export default function FloatingWhatsApp() {
  const [everHovered, setEverHovered] = useState(false)

  return (
    <a
      href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(PREFILLED_MESSAGE)}`}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setEverHovered(true)}
      aria-label="تواصل معنا على واتساب"
      className="group fixed bottom-5 left-5 z-40 flex items-center gap-2.5 rounded-full bg-[#25D366] pl-4 pr-4 py-4 text-white shadow-lg shadow-black/25 transition-transform hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {/* A quiet ping to catch the eye on first paint — not a permanent
          distraction, so it plays a few times then settles (see the
          animation utility below) rather than looping forever. */}
      <span
        className="absolute inset-0 rounded-full bg-[#25D366] motion-reduce:hidden animate-[ping_1.8s_ease-out_3]"
        aria-hidden="true"
      />
      <FaWhatsapp className="relative w-6 h-6 flex-shrink-0" aria-hidden="true" />
      <span
        className={`relative overflow-hidden text-[13.5px] font-bold whitespace-nowrap transition-all duration-300 ${
          everHovered
            ? 'max-w-[140px] opacity-100'
            : 'max-w-0 opacity-0 group-hover:max-w-[140px] group-hover:opacity-100 group-focus-visible:max-w-[140px] group-focus-visible:opacity-100'
        }`}
      >
        تواصل معنا
      </span>
    </a>
  )
}
