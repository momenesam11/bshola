import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { HiBars3, HiChevronDown, HiXMark } from 'react-icons/hi2'
import Logo from './Logo'
import FloatingWhatsApp from './FloatingWhatsApp'
import { VERTICALS } from '../../content/verticals'

/**
 * Site-wide header, shared by the homepage and every standalone marketing
 * page (/product, /faq, /pricing…) so navigation is identical everywhere.
 *
 * Anchor links use a leading `/` (e.g. `/#pricing`) rather than a bare `#…`:
 * a bare hash only scrolls within the current document, so from /product or
 * /faq it would silently do nothing. `/#pricing` is a real navigation to the
 * homepage that lands on that section.
 */
const NAV_LINKS = [
  { href: '/#how-patients-book', label: 'إزاي بيشتغل' },
  { to: '/product', label: 'المنتج' },
  { href: '/#pricing', label: 'الأسعار' },
  { to: '/faq', label: 'الأسئلة' },
]

const isSolutionsPath = (pathname) => pathname.startsWith('/solutions/')

// The two NAV_LINKS entries that are anchors into homepage sections rather
// than routes of their own.
const ANCHOR_IDS = ['how-patients-book', 'pricing']

/**
 * Tracks which of the homepage's anchor sections is currently in view, so
 * "إزاي بيشتغل" / "الأسعار" can underline the same way a routed page does —
 * before this, being on the homepage showed no active item at all, anywhere,
 * because those two links aren't routes and nothing tracked scroll position.
 *
 * The "current" section is whichever one crosses the vertical middle of the
 * viewport (a `-45%` top/bottom rootMargin), the standard scrollspy trick —
 * a plain "is it visible at all" check flags two sections at once during the
 * scroll between them.
 */
function useSectionScrollSpy(enabled) {
  const [activeId, setActiveId] = useState(null)

  useEffect(() => {
    if (!enabled) return undefined

    const elements = ANCHOR_IDS.map((id) => document.getElementById(id)).filter(Boolean)
    if (!elements.length) return undefined

    // IntersectionObserver only reports entries whose state just changed, not
    // "here's everything's current state" — so leaving both sections (e.g.
    // scrolling back up to the hero) fires only an exit event. Tracking each
    // id's own intersecting flag lets every callback recompute a clean answer
    // — the first id (in page order) still intersecting, or null when none
    // are — instead of leaving the last-active id stuck forever.
    const intersecting = new Map(ANCHOR_IDS.map((id) => [id, false]))

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => intersecting.set(entry.target.id, entry.isIntersecting))
        const current = ANCHOR_IDS.find((id) => intersecting.get(id))
        setActiveId(current ?? null)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [enabled])

  // Not state-derived from `enabled` via an effect (that would mean setting
  // state during the disabled branch above, which React flags) — just don't
  // report a section as active when scrollspy isn't running on this page.
  return enabled ? activeId : null
}

/**
 * "الحلول" is a dropdown, not a link — its only job is to make the six
 * solution pages (src/content/marketingPages.js) discoverable from the nav.
 * Before this they existed only as footer text and homepage chips, so the
 * nav gave no hint the site had more than one page.
 *
 * `surfaceClass` is the exact background Nav is using right now (bg-ink or
 * bg-ink-deep, depending on scroll) — the dropdown panel matches it instead
 * of a fixed shade, so opening it never reads as the navbar itself changing
 * colour.
 */
function SolutionsMenu({ surfaceClass, active }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onEscape(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center gap-1 pb-1 text-[13.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400 ${
          active ? 'text-white' : 'text-white/90 hover:text-white'
        }`}
      >
        الحلول
        <HiChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        {active && (
          <span className="absolute -bottom-[1px] inset-x-0 h-[2px] rounded-full bg-accent-400" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          className={`absolute top-full right-0 mt-3 w-60 rounded-2xl border border-white/10 shadow-xl shadow-black/30 p-2 z-50 ${surfaceClass}`}
        >
          {VERTICALS.map((v) => (
            <Link
              key={v.label}
              to={v.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-medium text-white/85 hover:bg-white/10 hover:text-white transition-colors"
            >
              <v.Icon className="w-4 h-4 text-accent-400 flex-shrink-0" aria-hidden="true" />
              {v.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/** A nav link with an active-page underline — Link variant (real route) or plain anchor (in-page/cross-page hash). */
function NavItem({ link, active }) {
  const className = `relative pb-1 text-[13.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400 ${
    active ? 'text-white' : 'text-white/90 hover:text-white'
  }`
  const underline = active && (
    <span className="absolute -bottom-[1px] inset-x-0 h-[2px] rounded-full bg-accent-400" aria-hidden="true" />
  )

  return link.to ? (
    <Link to={link.to} aria-current={active ? 'page' : undefined} className={className}>
      {link.label}
      {underline}
    </Link>
  ) : (
    <a href={link.href} aria-current={active ? 'page' : undefined} className={className}>
      {link.label}
      {underline}
    </a>
  )
}

export default function Nav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()
  const activeAnchorId = useSectionScrollSpy(pathname === '/')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function isLinkActive(link) {
    if (link.to) return link.to === pathname
    return pathname === '/' && link.href.split('#')[1] === activeAnchorId
  }

  // Same class the header itself uses, so the "الحلول" dropdown panel can
  // match it exactly — see SolutionsMenu's comment.
  const surfaceClass = scrolled ? 'bg-ink-deep' : 'bg-ink'

  return (
    <>
    <header
      // Scrolled = solid ink-deep + a real shadow, not a lighter/blurred navy:
      // the unscrolled header sits on an equally-dark hero on the homepage, so
      // translucency reads fine there — but standalone pages and every section
      // below the hero are white or paper, and a lighter blurred bar let that
      // white bleed through and cost the nav its own contrast. Darker + opaque
      // fixes that regardless of what's scrolling underneath.
      className={`sticky top-0 z-50 transition-shadow ${surfaceClass} ${
        scrolled ? 'shadow-lg shadow-black/25' : ''
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
          <Logo className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400 rounded-md" />

          <nav aria-label="أقسام الصفحة" className="hidden md:flex items-center gap-7">
            <SolutionsMenu surfaceClass={surfaceClass} active={isSolutionsPath(pathname)} />
            {NAV_LINKS.map((link) => (
              <NavItem key={link.to || link.href} link={link} active={isLinkActive(link)} />
            ))}
          </nav>

          {/* دخول لنظامك vs ابدأ 14 يوم مجاناً now read as two distinct buttons (outline vs
              filled) instead of a plain text link beside a solid one — the
              pairing that was hard to tell apart at a glance. */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="text-[13.5px] font-bold text-white border border-white/30 hover:border-white/60 hover:bg-white/5 px-4 py-2.5 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
            >
              دخول لنظامك
            </Link>
            <Link
              to="/register"
              className="bg-accent-500 hover:bg-accent-600 text-white text-[13.5px] font-bold px-5 py-2.5 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              ابدأ 14 يوم مجاناً
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            className="md:hidden p-2 -mr-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
          >
            {open ? <HiXMark className="w-6 h-6" /> : <HiBars3 className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <div className={`md:hidden border-t border-white/10 ${surfaceClass}`} hidden={!open}>
        <nav aria-label="أقسام الصفحة" className="max-w-6xl mx-auto px-5 py-4 flex flex-col gap-1">
          <p className="px-1 pt-1 pb-2 text-[11px] font-bold text-white/50 uppercase tracking-wider">
            الحلول
          </p>
          {VERTICALS.map((v) => (
            <Link
              key={v.label}
              to={v.to}
              onClick={() => setOpen(false)}
              aria-current={pathname === v.to ? 'page' : undefined}
              className={`flex items-center gap-2.5 py-2.5 text-[14px] font-medium ${
                pathname === v.to ? 'text-white font-bold' : 'text-white/85'
              }`}
            >
              <v.Icon className="w-4 h-4 text-accent-400 flex-shrink-0" aria-hidden="true" />
              {v.label}
            </Link>
          ))}
          <div className="mt-2 pt-2 border-t border-white/10">
            {NAV_LINKS.map((link) => {
              const active = isLinkActive(link)
              return link.to ? (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`block py-3 text-[15px] border-b border-white/10 ${
                    active ? 'text-white font-bold' : 'text-white/85 font-medium'
                  }`}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`block py-3 text-[15px] border-b border-white/10 ${
                    active ? 'text-white font-bold' : 'text-white/85 font-medium'
                  }`}
                >
                  {link.label}
                </a>
              )
            })}
          </div>
          <div className="flex gap-3 pt-4">
            <Link
              to="/login"
              className="flex-1 text-center py-3 text-[14px] font-semibold text-white border border-white/25 rounded-xl"
            >
              دخول لنظامك
            </Link>
            <Link
              to="/register"
              className="flex-1 text-center py-3 text-[14px] font-bold text-white bg-accent-500 rounded-xl"
            >
              ابدأ 14 يوم مجاناً
            </Link>
          </div>
        </nav>
      </div>
    </header>
    <FloatingWhatsApp />
    </>
  )
}
