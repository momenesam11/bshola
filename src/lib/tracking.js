// Google Analytics 4 — measurement for our own marketing funnel only.
//
// What is recorded:
//   page_view       sent here on every route change (see syncTrackingForPath).
//                   The GA4 stream's "page changes based on browser history
//                   events" setting must stay OFF: it fires on pushState, before
//                   we know whether the new route may be measured, and would
//                   double-count the ones that may.
//   whatsapp_click  click on any link to our support WhatsApp
//   sign_up         account created (Register.jsx, or Google sign-up in AuthCallback.jsx)
//   start_trial     onboarding finished — the business has a live booking link
//
// Production builds only, so local dev never pollutes the data.

import { SUPPORT_WHATSAPP } from './support'

const GA_MEASUREMENT_ID = 'G-JS9EG1FVZH'

// Never measured: the owner's app screens, and above all the public booking
// pages — the people booking on /book/:slug are a clinic's patients, not our
// visitors, and a patient-record page title can carry a patient's name. gtag is
// not even loaded when a visit starts on one of these, and once loaded, GA's
// documented opt-out flag mutes every hit while the visitor is on one.
const UNTRACKED_PREFIXES = [
  '/book',
  '/dashboard',
  '/appointments',
  '/crm',
  '/patients',
  '/reports',
  '/settings',
  '/admin',
  '/partner',
]

const enabled = import.meta.env.PROD && typeof window !== 'undefined'

export function isTrackedPath(pathname) {
  return !UNTRACKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function loadGtag() {
  if (window.gtag) return
  window.dataLayer = window.dataLayer || []
  // gtag.js reads the `arguments` object off the queue, not an array.
  window.gtag = function () {
    window.dataLayer.push(arguments)
  }
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(script)
  window.gtag('js', new Date())
  window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false })
}

/** Called on every route change (RouteTracker in App.jsx). */
export function syncTrackingForPath(pathname) {
  if (!enabled) return
  const tracked = isTrackedPath(pathname)
  window[`ga-disable-${GA_MEASUREMENT_ID}`] = !tracked
  if (!tracked) return
  loadGtag()
  // Next tick, so the route's Helmet has set document.title first.
  setTimeout(() => {
    window.gtag('event', 'page_view', {
      page_location: window.location.href,
      page_path: pathname,
      page_title: document.title,
    })
  }, 0)
}

export function trackEvent(name, params = {}) {
  if (!enabled || !isTrackedPath(window.location.pathname)) return
  loadGtag()
  window.gtag('event', name, params)
}

const SUPPORT_LINK = `a[href*="wa.me/${SUPPORT_WHATSAPP}"]`

/**
 * One delegated listener instead of an onClick on each of the dozen support
 * WhatsApp links scattered across the marketing components. Returns the
 * cleanup function.
 */
export function trackSupportWhatsAppClicks() {
  if (!enabled) return () => {}
  const onClick = (e) => {
    if (!e.target.closest?.(SUPPORT_LINK)) return
    trackEvent('whatsapp_click', { page_path: window.location.pathname })
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
