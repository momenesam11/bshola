// The morning job of the growth engine.
//
// Runs on a schedule (.github/workflows/growth-daily.yml), so nobody has to open
// the dashboard. Each run:
//   1. OpenStreetMap: clinics with a phone in Cairo & Giza (free) — Saturdays
//   2. Overture Maps: tops the pool up to pool_target when it runs low (free)
//   3. Google Places: the next slice of the type × area rotation, only if
//      GOOGLE_PLACES_API_KEY is set and auto-discovery is on in settings
//   4. growth_sync_platform(): new sign-ups, trials, payments, commissions
//   5. Today's list: picks the day's batch of new clinics
//   6. Writes what happened to growth_runs, which the Today screen shows
// Everything goes through growth_import_leads(), which skips anything already
// in the list (same phone / place / name+area), so re-running is harmless.
//
// Uses the same tested modules as the dashboard (src/lib/growth/*), which is
// why it runs under tsx (extension-less imports).
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/growth-daily.mjs
//
// Overture needs DuckDB, which the workflow installs just for this job
// (npm i --no-save @duckdb/node-api) to keep it out of the app's dependencies.

import { createClient } from '@supabase/supabase-js'
import { fetchOsmClinics } from '../src/lib/growth/osm.js'
import { discoveryQueries, nextBatch, placeToRow, cairoToday } from '../src/lib/growth/discover.js'
import { latestRelease, overtureSql, OVERTURE_BUCKET, placesToRows, pickForPool } from '../src/lib/growth/overture.js'
import { pickDailyLeads, poolStats } from '../src/lib/growth/dailyList.js'

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

// Supabase returns at most 1000 rows per request, so read in pages.
async function loadLeads() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('growth_leads').select('*').is('archived_at', null).order('id').range(from, from + 999)
    if (error) throw new Error(`can't read leads: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

// ── 1. OpenStreetMap ────────────────────────────────────────────────────────
async function runOsm() {
  // OSM changes slowly, so once a week is enough to pick up new ones and kinder
  // to the free public servers. GROWTH_FORCE_OSM=1 runs it on any day.
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

// ── 2. Overture Maps ────────────────────────────────────────────────────────
async function fetchOverturePlaces() {
  const listing = await fetch(`https://${OVERTURE_BUCKET}.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/`)
  const release = latestRelease(await listing.text())
  if (!release) throw new Error("couldn't find the latest Overture release")
  const { DuckDBInstance } = await import('@duckdb/node-api')
  const db = await DuckDBInstance.create(':memory:')
  const conn = await db.connect()
  await conn.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
  const result = await conn.runAndReadAll(overtureSql(release))
  return { release, places: result.getRowObjectsJson() }
}

async function runOverture(settings) {
  const target = settings.pool_target ?? 300
  const leads = await loadLeads()
  const before = poolStats(leads, settings).ready
  if (before >= target) return { skipped: `pool is full enough (${before}/${target})` }

  const { release, places } = await fetchOverturePlaces()
  const rows = placesToRows(places)
  // Hidden leads count too: what you cleaned up mustn't come back.
  const known = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('growth_leads').select('phone, overture_id').order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const l of data) {
      if (l.phone) known.add(l.phone)
      if (l.overture_id) known.add(l.overture_id)
    }
    if (data.length < 1000) break
  }
  const fresh = rows.filter((r) => !known.has(r.phone) && !known.has(r.overture_id))
  const batch = pickForPool(fresh, target - before).map(({ confidence, ...row }) => row)
  return { release, usable: rows.length, unused: fresh.length, ...(batch.length ? await importRows(batch, 'overture') : { inserted: 0, skipped: 0 }) }
}

// ── 3. Google Places ────────────────────────────────────────────────────────
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
      log('google: budget reached')
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

// ── 4. Sync ─────────────────────────────────────────────────────────────────
async function runSync() {
  const { data, error } = await supabase.rpc('growth_sync_platform')
  if (error) throw new Error(error.message)
  return data
}

// ── 5. Today's list ─────────────────────────────────────────────────────────
async function runDailyList(settings) {
  const leads = await loadLeads()
  const ids = pickDailyLeads(leads.filter((l) => !l.is_test), settings)
  const { data, error } = await supabase.rpc('growth_set_daily_list', { p_day: cairoToday(), p_lead_ids: ids, p_mode: 'ensure' })
  if (error) throw new Error(error.message)
  return { ...data, pool_left: poolStats(leads, settings).ready }
}

// ── run ─────────────────────────────────────────────────────────────────────
async function main() {
  const { data: settings, error } = await supabase.from('growth_settings').select('*').eq('id', 1).single()
  if (error) throw new Error(`can't read growth_settings: ${error.message}`)

  const { data: run } = await supabase.from('growth_runs')
    .insert({ trigger: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'schedule' : 'manual' })
    .select('id').single()

  const summary = {}
  const steps = [['openstreetmap', runOsm], ['overture', runOverture], ['google', runGoogle], ['sync', runSync], ['daily_list', runDailyList]]
  for (const [name, fn] of steps) {
    try {
      summary[name] = await fn(settings)
    } catch (e) {
      summary[name] = { error: e.message }
    }
    log(name, JSON.stringify(summary[name]))
  }

  const failed = Object.values(summary).filter((s) => s?.error).length
  if (run?.id) {
    await supabase.from('growth_runs').update({ finished_at: new Date().toISOString(), ok: failed === 0, summary }).eq('id', run.id)
    await supabase.from('growth_runs').delete().lt('started_at', new Date(Date.now() - 90 * 864e5).toISOString())
  }

  // The list and the sync are what the day depends on: flag the run in GitHub if either broke.
  if (summary.sync?.error || summary.daily_list?.error) process.exit(1)
}

main().catch((e) => {
  console.error('[growth-daily] fatal:', e.message)
  process.exit(1)
})
