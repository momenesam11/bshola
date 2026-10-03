// Daily, hands-off lead discovery for the growth engine.
//
// Runs on a schedule (.github/workflows/growth-daily.yml) — nobody has to
// open the dashboard. Each run:
//   1. OpenStreetMap: every clinic in Cairo & Giza with a phone (free, no key) —
//      weekly, on Saturdays
//   2. Google Places:  the next slice of the type × area rotation, with review
//      pain signals (if GOOGLE_PLACES_API_KEY is set and auto-discovery is on)
//   3. growth_sync_platform(): new sign-ups, trials, payments, qualification
// Everything goes through growth_import_leads(), which skips anything already
// in the list (same phone / place / name+area), so re-running is harmless.
//
// Uses the same tested modules as the dashboard (src/lib/growth/*), which is
// why it runs under tsx (extension-less imports).
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/growth-daily.mjs

import { createClient } from '@supabase/supabase-js'
import { fetchOsmClinics } from '../src/lib/growth/osm.js'
import { discoveryQueries, nextBatch, placeToRow, cairoToday } from '../src/lib/growth/discover.js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_PLACES_API_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const log = (...args) => console.log('[growth-daily]', ...args)

async function importRows(rows, source) {
  let inserted = 0
  let skipped = 0
  for (let i = 0; i < rows.length; i += 1000) {
    const { data, error } = await supabase.rpc('growth_import_leads', { p_rows: rows.slice(i, i + 1000), p_source: source })
    if (error) throw new Error(`import failed: ${error.message}`)
    inserted += data.inserted
    skipped += data.skipped
  }
  return { inserted, skipped }
}

// ── 1. OpenStreetMap ────────────────────────────────────────────────────────
async function runOsm() {
  // OSM changes slowly — the same clinics come back every day — so once a
  // week is enough to pick up new ones and kinder to the free public servers.
  // GROWTH_FORCE_OSM=1 runs it on any day (the dashboard button does too).
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' }).format(new Date())
  if (weekday !== 'Sat' && !process.env.GROWTH_FORCE_OSM) return { skipped: 'weekly — runs on Saturdays' }
  const userAgent = 'Beshola-growth/1.0 (+https://www.beshola.co)'
  const out = {}
  for (const governorate of ['cairo', 'giza']) {
    const { rows } = await fetchOsmClinics({ governorate, userAgent })
    out[governorate] = { found: rows.length, ...(await importRows(rows, 'openstreetmap')) }
  }
  return out
}

// ── 2. Google Places ────────────────────────────────────────────────────────
const PLACES_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.internationalPhoneNumber', 'places.websiteUri', 'places.rating', 'places.userRatingCount',
  'places.googleMapsUri', 'places.businessStatus', 'places.reviews',
].join(',')

async function googleSearch(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': PLACES_FIELDS },
    body: JSON.stringify({ textQuery: query, languageCode: 'ar', regionCode: 'EG', pageSize: 20 }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? `Google Places ${res.status}`)
  // Same shape the dashboard gets from the growth Edge Function.
  return (data.places ?? []).map((p) => ({
    google_place_id: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    google_rating: p.rating ?? null,
    google_reviews_count: p.userRatingCount ?? 0,
    google_maps_url: p.googleMapsUri ?? null,
    business_status: p.businessStatus ?? null,
    reviews: (p.reviews ?? []).map((r) => ({ text: r.originalText?.text ?? r.text?.text ?? '', rating: r.rating ?? null, publishTime: r.publishTime ?? null })),
  }))
}

async function runGoogle(settings) {
  if (!GOOGLE_PLACES_API_KEY) return { skipped: 'no GOOGLE_PLACES_API_KEY' }
  if (!settings.auto_discover_enabled) return { skipped: 'auto-discovery is off in settings' }
  const today = cairoToday()
  if (settings.auto_discover_last_run === today) return { skipped: 'already ran today' }

  const list = discoveryQueries(settings.auto_discover_categories ?? [], settings.auto_discover_areas ?? [])
  const { batch, cursor } = nextBatch(list, settings.auto_discover_cursor ?? 0, settings.auto_discover_per_day ?? 4)
  await supabase.from('growth_settings').update({ auto_discover_last_run: today, auto_discover_cursor: cursor }).eq('id', 1)

  const rows = []
  let searched = 0
  for (const item of batch) {
    const { data: allowed } = await supabase.rpc('growth_take_places_quota')
    if (!allowed) {
      log('google: daily cap reached')
      break
    }
    try {
      for (const place of await googleSearch(item.query)) {
        const row = placeToRow(place, item)
        if (row) rows.push(row)
      }
      searched += 1
    } catch (e) {
      log('google search failed, stopping:', e.message)
      break
    }
  }
  const res = rows.length ? await importRows(rows, 'google_maps_api') : { inserted: 0, skipped: 0 }
  return { searched, found: rows.length, ...res }
}

// ── run ─────────────────────────────────────────────────────────────────────
async function main() {
  const { data: settings, error } = await supabase.from('growth_settings').select('*').eq('id', 1).single()
  if (error) throw new Error(`can't read growth_settings: ${error.message}`)

  const summary = {}
  for (const [name, fn] of [['openstreetmap', runOsm], ['google', runGoogle]]) {
    try {
      summary[name] = await fn(settings)
    } catch (e) {
      summary[name] = { error: e.message }
    }
    log(name, JSON.stringify(summary[name]))
  }

  const { data: sync, error: syncError } = await supabase.rpc('growth_sync_platform')
  summary.sync = syncError ? { error: syncError.message } : sync
  log('sync', JSON.stringify(summary.sync))

  // Fail the run (so GitHub flags it) only if nothing worked at all.
  const failed = Object.values(summary).filter((s) => s?.error).length
  if (failed === Object.keys(summary).length) process.exit(1)
}

main().catch((e) => {
  console.error('[growth-daily] fatal:', e.message)
  process.exit(1)
})

