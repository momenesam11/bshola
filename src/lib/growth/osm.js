// OpenStreetMap as a free, no-key lead source.
//
// OSM data is open (ODbL): it may be used and stored with attribution
// ("© OpenStreetMap contributors", shown wherever it's imported). Queried
// through the public Overpass API straight from the browser — it allows
// cross-origin requests — so there's no server, key or billing involved.
// Coverage is thinner than Google's, so this complements Places, not
// replaces it.

import { normalizePhone } from './phone'

// The public Overpass servers are community-run and sometimes busy (504/429),
// so a request falls through to the next mirror.
export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors'

// Greater Cairo + Giza, including New Cairo, 6th of October and Sheikh Zayed.
export const CAIRO_GIZA_BBOX = [29.8, 30.9, 30.25, 31.6] // south, west, north, east

export function overpassQuery(bbox = CAIRO_GIZA_BBOX) {
  const b = bbox.join(',')
  return `[out:json][timeout:90];(` +
    `nwr["amenity"~"^(dentist|clinic|doctors)$"](${b});` +
    `nwr["healthcare"~"^(dentist|clinic|doctor)$"](${b});` +
    `);out tags center;`
}

const NOT_A_CLINIC = /(صيدلي|صيدليه|صيدلية|pharmac|مستشفى|مستشفي|hospital|معمل|laborator|lab\b|اشعة|أشعة|radiolog|scan)/i
const DERMA = /(جلد|تجميل|ليزر|derma|skin|cosmetic|laser|beauty)/i
const DENTAL = /(اسنان|أسنان|دينتال|دنتال|dental|dent)/i

const firstPhone = (raw) => {
  for (const part of String(raw ?? '').split(/[;,/]/)) {
    const p = normalizePhone(part)
    if (p) return p
  }
  return null
}

/**
 * Overpass elements → rows for growth_import_leads(). Keeps clinics with a
 * name and a phone; drops pharmacies, hospitals, labs and scan centres.
 */
export function osmToRows(elements = []) {
  const rows = []
  for (const el of elements) {
    const t = el.tags ?? {}
    const name = t['name:ar'] || t.name || t['name:en']
    if (!name) continue
    const kind = t.amenity || t.healthcare || ''
    const text = `${name} ${t['healthcare:speciality'] ?? ''} ${t.description ?? ''}`
    if (kind === 'hospital' || NOT_A_CLINIC.test(text)) continue
    const phone = firstPhone(t.phone || t['contact:phone'] || t.mobile || t['contact:mobile'])
    if (!phone) continue

    const category = kind === 'dentist' || DENTAL.test(text) ? 'dental' : DERMA.test(text) ? 'derma' : 'clinic'
    const website = t.website || t['contact:website']
    rows.push({
      name: String(name).slice(0, 160),
      phone,
      category,
      specialty: t['healthcare:speciality'] || undefined,
      area: t['addr:suburb'] || t['addr:district'] || t['addr:neighbourhood'] || undefined,
      city: t['addr:city'] || undefined,
      address: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ') || undefined,
      website: website || undefined,
      facebook: t['contact:facebook'] || undefined,
      instagram: t['contact:instagram'] || undefined,
      google_maps_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      source_detail: 'OpenStreetMap',
      signals: website
        ? []
        : [{ type: 'no_website', kind: 'inference', evidence: 'مفيش موقع إلكتروني على الخريطة — غالباً الحجز بالتليفون أو الواتساب', observed_at: new Date().toISOString() }],
    })
  }
  return rows
}

/**
 * @param {{userAgent?: string}} [opts] - Overpass rejects requests without a
 *   descriptive User-Agent; browsers send their own, the daily script passes one.
 */
export async function fetchOsmClinics(bbox = CAIRO_GIZA_BBOX, { userAgent } = {}) {
  const query = encodeURIComponent(overpassQuery(bbox))
  let lastError = null
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(`${url}?data=${query}`, {
        headers: { Accept: 'application/json', ...(userAgent ? { 'User-Agent': userAgent } : {}) },
      })
      if (!res.ok) {
        lastError = new Error(`${new URL(url).host} ردّ ${res.status}`)
        continue
      }
      const data = await res.json()
      return osmToRows(data.elements ?? [])
    } catch (e) {
      lastError = e
    }
  }
  throw new Error(`OpenStreetMap مش بيرد دلوقتي (${lastError?.message ?? 'خطأ'}) — جرّب كمان شوية`)
}
