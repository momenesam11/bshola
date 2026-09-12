import { useEffect, useRef, useState } from 'react'

/**
 * Scroll-triggered entrance for one block of content.
 *
 * This is the page's answer to "no life" without going back to a global
 * fade-and-slide stamped on every div: each section still has its own static
 * resting layout (see artifact-design's "show the page at rest"), but content
 * arrives with a short, deliberate motion as it scrolls into view instead of
 * simply existing. `delay` (ms) staggers siblings — used sparingly, only where
 * a group of items reads as a set (problem list, pricing cards, table rows).
 *
 * prefers-reduced-motion: renders visible immediately, no observer, no
 * transition class — never a flash of hidden content for those users.
 */
export default function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className = '',
  once = true,
  ...rest
}) {
  const ref = useRef(null)
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
  const [visible, setVisible] = useState(reduced)
  const motionOk = !reduced

  useEffect(() => {
    if (reduced) return

    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setVisible(false)
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [once, reduced])

  return (
    <Tag
      ref={ref}
      className={`${motionOk ? 'transition-all duration-700 ease-out' : ''} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      } ${className}`}
      style={motionOk && delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}
