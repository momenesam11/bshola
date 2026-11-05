import { useEffect, useRef, useState } from 'react'

/**
 * Counts up to `value` the first time it scrolls into view.
 *
 * The final number is what renders first (in the prerendered HTML, for crawlers
 * and for anyone with reduced motion); the animation only plays over it.
 */
export default function CountUp({ value, duration = 1200 }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(value)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return undefined
    let frame = 0

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        const start = performance.now()
        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration)
          setShown(Math.round(value * (1 - (1 - t) ** 3)))
          if (t < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [value, duration])

  return <span ref={ref}>{shown.toLocaleString('en-US')}</span>
}
