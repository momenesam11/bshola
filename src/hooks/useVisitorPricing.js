import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { DEFAULT_COUNTRY } from '../lib/countries'
import { getPricing, localizeMoneyText } from '../lib/pricing'

// Which country the visitor is in, from /api/geo. The prerendered HTML is always
// Egyptian, because crawlers mostly come from outside the Arab world and those
// pages must keep ranking in Egypt. The server snapshot below keeps hydration
// matching that HTML, and React switches to the visitor's country right after.

const STORAGE_KEY = 'beshola_visitor_country'
const listeners = new Set()
let country = null
let started = false

function readStored() {
  try { return sessionStorage.getItem(STORAGE_KEY) } catch { return null }
}

function finish(code) {
  country = code || DEFAULT_COUNTRY
  try { sessionStorage.setItem(STORAGE_KEY, country) } catch { /* private mode */ }
  // index.html hides prices until this runs, so they don't visibly jump.
  document.documentElement.classList.remove('geo-pending')
  listeners.forEach((listener) => listener())
}

// For checking prices on a Vercel preview or locally: ?country=SA. It does
// nothing on the live site.
function previewOverride() {
  if (/(^|\.)beshola\.co$/.test(window.location.hostname)) return null
  const value = new URLSearchParams(window.location.search).get('country')
  return /^[A-Z]{2}$/.test(value ?? '') ? value : null
}

function start() {
  if (started) return
  started = true
  const known = previewOverride() ?? readStored()
  if (known) {
    finish(known)
    return
  }
  fetch('/api/geo')
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => finish(data?.country))
    .catch(() => finish(null))
}

function subscribe(listener) {
  listeners.add(listener)
  start()
  return () => listeners.delete(listener)
}

const getSnapshot = () => country ?? DEFAULT_COUNTRY
const getServerSnapshot = () => DEFAULT_COUNTRY

export function useVisitorCountry() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useVisitorPricing() {
  const code = useVisitorCountry()
  const pricing = useMemo(() => getPricing(code), [code])
  const t = useCallback((text) => localizeMoneyText(text, pricing), [pricing])
  return { ...pricing, t }
}
