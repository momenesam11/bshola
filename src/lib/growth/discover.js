// Daily automatic discovery: which Google Places searches to run today, and
// how a search result becomes a lead row. The network part lives in
// useAutoDiscover (hooks/useGrowth.js); this file is the pure, tested logic.

import { normalizePhone } from './phone'
import { detectReviewSignals, inferPlaceSignals } from './reviewSignals'

export const CATEGORY_QUERY = {
  dental: 'عيادة أسنان',
  derma: 'عيادة جلدية وتجميل',
  clinic: 'عيادة',
}

export const DISCOVERY_CATEGORIES = Object.keys(CATEGORY_QUERY)

/** Every category × area pair, in a stable order. */
export function discoveryQueries(categories = [], areas = []) {
  const list = []
  for (const area of areas) {
    for (const category of categories) {
      if (CATEGORY_QUERY[category]) list.push({ category, area, query: `${CATEGORY_QUERY[category]} ${area}` })
    }
  }
  return list
}

/** The next `n` searches after `cursor`, wrapping around, and where to resume tomorrow. */
export function nextBatch(list, cursor = 0, n = 4) {
  if (!list.length) return { batch: [], cursor: 0 }
  const count = Math.min(n, list.length)
  const start = cursor % list.length
  const batch = Array.from({ length: count }, (_, i) => list[(start + i) % list.length])
  return { batch, cursor: (start + count) % list.length }
}

/** Today in Cairo as YYYY-MM-DD — matches growth_settings.auto_discover_last_run. */
export function cairoToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now)
}

/**
 * A Places result → a row for growth_import_leads(), or null when it isn't
 * worth calling: closed, or no phone number.
 */
export function placeToRow(place, { category, area, query }) {
  if (place.business_status && place.business_status !== 'OPERATIONAL') return null
  const phone = normalizePhone(place.phone)
  if (!phone) return null
  return {
    name: place.name,
    phone,
    category,
    area,
    city: 'القاهرة',
    address: place.address,
    website: place.website ?? undefined,
    google_maps_url: place.google_maps_url,
    google_place_id: place.google_place_id,
    google_rating: place.google_rating != null ? String(place.google_rating) : undefined,
    google_reviews_count: String(place.google_reviews_count ?? ''),
    source_detail: `بحث أوتوماتيك: ${query}`,
    signals: [...detectReviewSignals(place.reviews, place.google_maps_url), ...inferPlaceSignals(place)],
  }
}
