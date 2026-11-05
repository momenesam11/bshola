import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange) {
  const media = window.matchMedia?.(QUERY)
  media?.addEventListener?.('change', onChange)
  return () => media?.removeEventListener?.('change', onChange)
}

/**
 * Whether the visitor asked for reduced motion.
 *
 * Always false during prerender and hydration, then corrected right after, so
 * the first client render matches the prerendered HTML. Reading matchMedia in a
 * useState initializer doesn't: React then leaves the mismatched attributes in
 * the DOM, or throws away the prerendered page if the markup differs.
 */
export default function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => Boolean(window.matchMedia?.(QUERY).matches),
    () => false
  )
}
