// Every link the sales side hands out carries a ref code, so when that person
// signs up the business is credited to the right lead / partner / referrer
// (src/lib/refCapture.js stores it; growth_attribute_signup() resolves it).
//
//   L-XXXXXXXX  a lead's own link           (growth_leads.ref_code)
//   P-XXXXXX    a partner's link            (growth_partners.ref_code)
//   R-<slug>    a customer referring a peer (businesses.booking_slug)
//   B-<slug>    the footer of a customer's public booking page

import { SITE_URL } from '../seo'

export const registerLink = (code) => `${SITE_URL}/register?ref=${encodeURIComponent(code)}`
export const previewLink = (code) => `${SITE_URL}/demo/${encodeURIComponent(code)}`
export const partnerLink = (code) => `${SITE_URL}/?ref=${encodeURIComponent(code)}`
/** A partner's private dashboard — the token is a secret, unlike their ref code. */
export const partnerDashboardLink = (token) => `${SITE_URL}/partner/${encodeURIComponent(token)}`
export const referralLink = (bookingSlug) => `${SITE_URL}/register?ref=${encodeURIComponent(`R-${bookingSlug}`)}`
export const bookingFooterPath = (bookingSlug) => `/?ref=${encodeURIComponent(`B-${bookingSlug}`)}`

/** The link to put in a message to this lead: their demo page if one exists, else sign-up. */
export function bestLinkFor(lead) {
  return lead?.preview?.enabled ? previewLink(lead.ref_code) : registerLink(lead.ref_code)
}
