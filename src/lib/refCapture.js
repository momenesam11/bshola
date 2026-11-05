// Remembers the ?ref= code a visitor arrived with (a lead's link, a partner's
// link, a customer referral, a booking-page footer — see lib/growth/links.js)
// so it survives browsing around the site, email confirmation, and coming
// back days later to sign up. Read once at the end of onboarding by
// growth_attribute_signup(), and attached to "call me" form submissions.

const KEY = 'beshola_ref'
const MAX_AGE_DAYS = 60
const VALID = /^[LPRB]-[A-Za-z0-9-]{2,80}$/

export function captureRefFromUrl(search = typeof window !== 'undefined' ? window.location.search : '') {
  const code = new URLSearchParams(search).get('ref')?.trim()
  if (!code || !VALID.test(code)) return
  try {
    // Last touch wins: the most recent link someone clicked is the one that
    // brought them back.
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }))
  } catch {
    // Storage blocked (private mode etc.) — attribution falls back to phone match.
  }
}

export function getStoredRef() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!saved?.code || Date.now() - saved.at > MAX_AGE_DAYS * 864e5) return null
    return saved.code
  } catch {
    return null
  }
}

export function clearStoredRef() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
