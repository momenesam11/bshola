// Accepting the terms is recorded on the account when it's created. Bump the
// version when the terms change materially, so it's clear which text was accepted.
export const TERMS_VERSION = '2026-11-07'

// Survives the trip to Google and back when the box was ticked on /register.
export const PENDING_TERMS_KEY = 'beshola_pending_terms'

export const termsAcceptance = () => ({
  terms_accepted_at: new Date().toISOString(),
  terms_version: TERMS_VERSION,
})
