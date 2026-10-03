// OpenStreetMap as a free, no-key lead source.
//
// OSM data is open (ODbL): it may be used and stored with attribution
// ("© OpenStreetMap contributors", shown wherever it's imported). Queried
// through the public Overpass API straight from the browser — it allows
// cross-origin requests — so there's no server, key or billing involved.
// Coverage is thinner than Google's, so this complements Places, not
// replaces it.

import { normalizePhone } from './phone'
import { areasFor, governorateByKey } from './regions'

// The public Overpass servers are community-run and sometimes busy (504/429),
// so a request falls through to the next mirror.
export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors'

/**
 * Where to search:
 *   { areaId }                 inside an OSM boundary (governorate)
 *   { lat, lon, radiusM }      a circle around a point (district)
 */
export function overpassQuery(target) {
  const scope = target.areaId
    ? { pre: `area(id:${target.areaId})->.a;`, filter: '(area.a)' }
    : { pre: '', filter: `(around:${Math.round(target.radiusM)},${target.lat},${target.lon})` }
  return `[out:json][timeout:120];${scope.pre}(` +
    `nwr["amenity"~"^(dentist|clinic|doctors)$"]${scope.filter};` +
    `nwr["healthcare"~"^(dentist|clinic|doctor)$"]${scope.filter};` +
    `);out tags center;`
}

// An OSM relation id maps to its Overpass area id by this fixed offset.
const areaIdFor = (relationId) => 3600000000 + relationId

/**
 * Resolve a governorate key (+ optional district name) to a query target and
 * a human label for the rows' source_detail.
 */
export function osmTarget({ governorate, area, radiusKm = 3 }) {
  const gov = governorateByKey(governorate)
  if (!gov) throw new Error('اختار محافظة')
  if (!area) return { target: { areaId: areaIdFor(gov.relationId) }, governorate: gov.name, area: null, label: `${gov.name} (المحافظة كلها)` }
  const spot = areasFor(governorate).find((a) => a.name === area)
  if (!spot) throw new Error('المنطقة دي مش في القايمة')
  return {
    target: { lat: spot.lat, lon: spot.lon, radiusM: radiusKm * 1000 },
    governorate: gov.name,
    area: spot.name,
    label: `${spot.name}، ${gov.name} (${radiusKm} كم)`,
  }
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
export function osmToRows(elements = [], { governorate, area, label } = {}) {
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
      area: area || t['addr:suburb'] || t['addr:district'] || t['addr:neighbourhood'] || undefined,
      city: governorate || t['addr:city'] || undefined,
      address: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ') || undefined,
      website: website || undefined,
      facebook: t['contact:facebook'] || undefined,
      instagram: t['contact:instagram'] || undefined,
      google_maps_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      source_detail: label ? `OpenStreetMap — ${label}` : 'OpenStreetMap',
      signals: website
        ? []
        : [{ type: 'no_website', kind: 'inference', evidence: 'مفيش موقع إلكتروني على الخريطة — غالباً الحجز بالتليفون أو الواتساب', observed_at: new Date().toISOString() }],
    })
  }
  return rows
}

/**
 * Fetch clinics for a governorate, or a district within it.
 * @param {{governorate: string, area?: string|null, radiusKm?: number, userAgent?: string}} opts
 *   userAgent: Overpass rejects requests without a descriptive one; browsers
 *   send their own, the daily script passes one.
 * @returns {Promise<{label: string, rows: object[]}>}
 */
export async function fetchOsmClinics({ governorate, area = null, radiusKm = 3, userAgent } = {}) {
  const where = osmTarget({ governorate, area, radiusKm })
  const query = encodeURIComponent(overpassQuery(where.target))
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
      return { label: where.label, rows: osmToRows(data.elements ?? [], where) }
    } catch (e) {
      lastError = e
    }
  }
  throw new Error(`OpenStreetMap مش بيرد دلوقتي (${lastError?.message ?? 'خطأ'}) — جرّب كمان شوية`)
}
