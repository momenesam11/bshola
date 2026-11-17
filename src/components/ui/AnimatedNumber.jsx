import { useEffect, useRef, useState } from 'react'

// A number that counts from its old value to its new one when it changes
// (the waiting-room screen: 4 → 5 rolls through instead of jumping). Text that
// isn't a whole number (a time, "—") fades in instead. With "reduce motion"
// on, it just shows the new value.

const DURATION_MS = 700
const isWhole = (v) => /^\d+$/.test(String(v ?? ''))
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function AnimatedNumber({ value, className = '', style, testId }) {
  const [shown, setShown] = useState(value)
  const [fade, setFade] = useState(0)
  const from = useRef(value)

  useEffect(() => {
    const start = from.current
    from.current = value
    if (start === value) return undefined
    if (reducedMotion() || !isWhole(start) || !isWhole(value)) {
      setShown(value)
      setFade(f => f + 1)
      return undefined
    }
    const a = Number(start)
    const b = Number(value)
    let raf = 0
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / DURATION_MS)
      const eased = 1 - (1 - p) ** 3
      setShown(String(Math.round(a + (b - a) * eased)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); setShown(value) }
  }, [value])

  return (
    <span key={fade} data-testid={testId} className={`${className} ${fade ? 'animate-number-in' : ''}`} style={style}>
      {shown}
    </span>
  )
}
