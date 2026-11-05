// Overture Maps Places as a free, keyless lead source.
//
// Open data, licensed for storing and reuse (CDLA Permissive 2.0, with
// attribution): real businesses, most of them with the phone from their public
// Facebook page. Queried with DuckDB straight from Overture's public S3 bucket
// by scripts/growth-daily.mjs (a few minutes, too heavy for a browser); this
// file is the pure, tested part.

import { normalizePhone, isMobile } from './phone'
import { AREAS } from './regions'
import { NOT_A_CLINIC } from './osm'

export const OVERTURE_ATTRIBUTION = '© Overture Maps Foundation · © OpenStreetMap contributors'
export const OVERTURE_BUCKET = 'overturemaps-us-west-2'
// Greater Cairo. To open another city: add its box here and its districts in regions.js.
export const OVERTURE_BOX = { west: 30.85, east: 31.75, south: 29.8, north: 30.3 }
export const MIN_CONFIDENCE = 0.6
// Farther than this from every known district: outskirts or a wrongly placed pin.
const MAX_KM_FROM_DISTRICT = 8

const DENTAL = new Set(['dental_clinic', 'general_dentistry', 'cosmetic_dentistry', 'orthodontics', 'pediatric_dentistry', 'oral_and_maxillofacial_surgery', 'prosthodontics', 'periodontics', 'endodontics'])
const DERMA = new Set(['dermatology', 'plastic_and_reconstructive_surgery'])
const CLINIC = new Set(['doctors_office', 'obstetrics_and_gynecology', 'physical_therapy', 'pediatric_clinic', 'vision_or_eye_care_clinic', 'orthopedics', 'reproductive_perinatal_and_womens_care', 'cardiology', 'ear_nose_and_throat', 'urology', 'internal_medicine', 'family_practice', 'neurology', 'fertility_clinic', 'gastroenterology', 'oncology', 'refractive_surgery_or_lasik', 'psychotherapy', 'speech_therapy', 'psychology', 'psychiatry', 'rheumatology', 'pulmonology', 'endocrinology', 'nephrology', 'allergy_and_immunology', 'surgery'])
// Broad labels that also cover pages that aren't clinics: kept only if the name says clinic or doctor.
const GENERIC = new Set(['health_care', 'outpatient_care_facility', 'medical_service_organization'])
const CLINIC_NAME = /(عياد|دكتور|دكتوره|دكتورة|د\.|د\/|clinic|dr[. ])/i
const DENTAL_NAME = /(اسنان|أسنان|دينتال|دنتال|dental|dentist)/i
const DERMA_NAME = /(جلد|تجميل|ليزر|derma|skin|cosmetic|laser)/i

/** Overture taxonomy + name → our category, or null when it isn't a clinic we sell to. */
export function classifyPlace(taxonomy, name) {
  const text = String(name ?? '')
  if (NOT_A_CLINIC.test(text)) return null
  if (DENTAL.has(taxonomy)) return 'dental'
  if (DERMA.has(taxonomy)) return 'derma'
  if (!CLINIC.has(taxonomy) && !(GENERIC.has(taxonomy) && CLINIC_NAME.test(text))) return null
  if (DENTAL_NAME.test(text)) return 'dental'
  if (DERMA_NAME.test(text)) return 'derma'
  return 'clinic'
}

function km(lat1, lon1, lat2, lon2) {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)) * 111.32
  const y = (lat2 - lat1) * 110.57
  return Math.hypot(x, y)
}

const CITY = { cairo: 'القاهرة', giza: 'الجيزة' }

/** The closest known district to a point, or null if it's too far from all of them. */
export function nearestArea(lat, lon) {
  let best = null
  for (const key of Object.keys(CITY)) {
    for (const [name, aLat, aLon] of AREAS[key]) {
      const d = km(lat, lon, aLat, aLon)
      if (!best || d < best.d) best = { d, area: name, city: CITY[key] }
    }
  }
  return best && best.d <= MAX_KM_FROM_DISTRICT ? best : null
}

const firstEgyptianPhone = (phones) => {
  for (const raw of phones ?? []) {
    const p = normalizePhone(raw)
    if (p?.startsWith('20')) return p
  }
  return null
}

const isSocialOrMap = (url) => /facebook\.com|fb\.me|instagram\.com|maps\.app|goo\.gl|google\.[a-z.]+\/maps|wa\.me/i.test(url)

/**
 * One Overture place → a row for growth_import_leads(), or null when it isn't
 * worth calling: not a clinic, low confidence, no phone, or outside the areas.
 */
export function placeToLeadRow(p) {
  const name = String(p.name ?? '').trim()
  if (!name || Number(p.confidence) < MIN_CONFIDENCE) return null
  const category = classifyPlace(p.taxonomy, name)
  if (!category) return null
  const phone = firstEgyptianPhone(p.phones)
  if (!phone) return null
  const where = nearestArea(Number(p.lat), Number(p.lng))
  if (!where) return null

  const website = (p.websites ?? []).find((u) => !isSocialOrMap(u))
  const facebook = [...(p.socials ?? []), ...(p.websites ?? [])].find((u) => /facebook\.com/i.test(u))
  const instagram = (p.socials ?? []).find((u) => /instagram\.com/i.test(u))
  return {
    name: name.slice(0, 160),
    phone,
    category,
    specialty: p.taxonomy && !GENERIC.has(p.taxonomy) ? p.taxonomy.replace(/_/g, ' ') : undefined,
    area: where.area,
    city: where.city,
    address: p.address?.trim() || undefined,
    website,
    facebook,
    instagram,
    lat: p.lat,
    lng: p.lng,
    overture_id: p.id,
    confidence: Number(p.confidence),
    source_detail: `Overture Maps — ${where.area}`,
    signals: website
      ? []
      : [{ type: 'no_website', kind: 'inference', evidence: 'مفيش موقع إلكتروني مسجّل — غالباً الحجز بالتليفون أو الواتساب', observed_at: new Date().toISOString() }],
  }
}

/** Places → unique rows (one per phone, keeping the most confident). */
export function placesToRows(places = []) {
  const byPhone = new Map()
  for (const p of places) {
    const row = placeToLeadRow(p)
    if (!row) continue
    const seen = byPhone.get(row.phone)
    if (!seen || row.confidence > seen.confidence) byPhone.set(row.phone, row)
  }
  return [...byPhone.values()]
}

const CATEGORY_RANK = { dental: 0, derma: 0, clinic: 1 }

/**
 * The best `n` rows to add to the pool: mobile numbers (WhatsApp) and the
 * specialties we fit best first, spread evenly over the districts so the pool
 * isn't all from one street.
 */
export function pickForPool(rows, n) {
  const rank = (r) => (isMobile(r.phone) ? 0 : 2) + CATEGORY_RANK[r.category]
  const byArea = new Map()
  for (const r of [...rows].sort((a, b) => rank(a) - rank(b) || b.confidence - a.confidence)) {
    if (!byArea.has(r.area)) byArea.set(r.area, [])
    byArea.get(r.area).push(r)
  }
  const queues = [...byArea.values()]
  const out = []
  for (let i = 0; out.length < n && queues.some((q) => i < q.length); i++) {
    for (const q of queues) {
      if (i < q.length && out.length < n) out.push(q[i])
    }
  }
  return out
}

/** Newest release name from the bucket listing XML ("release/2026-10-21.0/" → "2026-10-21.0"). */
export function latestRelease(listingXml) {
  const names = [...String(listingXml).matchAll(/<Prefix>release\/([^</]+)\/<\/Prefix>/g)].map((m) => m[1])
  return names.sort().at(-1) ?? null
}

/** DuckDB SQL for the medical places inside the box. */
export function overtureSql(release, box = OVERTURE_BOX) {
  return `SELECT id, names.primary AS name, taxonomy.primary AS taxonomy, confidence, phones, websites, socials,
    addresses[1].freeform AS address, (bbox.xmin + bbox.xmax) / 2 AS lng, (bbox.ymin + bbox.ymax) / 2 AS lat
  FROM read_parquet('s3://${OVERTURE_BUCKET}/release/${release}/theme=places/type=place/*', hive_partitioning = 1)
  WHERE bbox.xmin BETWEEN ${box.west} AND ${box.east} AND bbox.ymin BETWEEN ${box.south} AND ${box.north}
    AND len(phones) > 0 AND confidence >= ${MIN_CONFIDENCE}
    AND (array_contains(taxonomy.hierarchy, 'health_care') OR array_contains(taxonomy.hierarchy, 'health_and_medical'))`
}
