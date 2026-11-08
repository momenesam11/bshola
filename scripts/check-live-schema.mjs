// Read-only check that the live database has everything the code expects:
// every table and column the migrations define, every relationship the app
// embeds, and every function it calls. Uses only the public anon key that ships
// in the website, asks for zero rows, and never runs a function (a call with a
// deliberately wrong argument name is refused before it executes).
//
//   node scripts/check-live-schema.mjs
//
// Catches the "migration file says X, production has Y" gap that CLAUDE.md
// warns about, and broken embeds like the PGRST201 that hid every visit plan.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { bootDatabase } from '../tests/local-backend/schema.mjs'
import { loadCatalog } from '../tests/local-backend/postgrest.mjs'

function env(name) {
  if (process.env[name]) return process.env[name]
  const line = readFileSync('.env', 'utf8').split('\n').find(l => l.startsWith(`${name}=`))
  return line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '')
}
const URL = env('VITE_SUPABASE_URL')
const KEY = env('VITE_SUPABASE_ANON_KEY')
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function get(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body }
}

const db = await bootDatabase()
const cat = await loadCatalog(db)
const problems = []
const unreadable = []

// 1. Tables and columns.
for (const [table, cols] of Object.entries(cat.columns)) {
  let remaining = Object.keys(cols)
  for (let tries = 0; tries < 50 && remaining.length; tries++) {
    const r = await get(`${table}?select=${remaining.join(',')}&limit=0`)
    if (r.status === 200) break
    const msg = r.body?.message || ''
    const missingCol = msg.match(/column [\w.]*?\.?(\w+) does not exist/)?.[1]
    if (missingCol && remaining.includes(missingCol)) {
      problems.push(`عمود ناقص على الموقع: ${table}.${missingCol}`)
      remaining = remaining.filter(c => c !== missingCol)
      continue
    }
    if (r.body?.code === 'PGRST205' || /does not exist/.test(msg)) {
      problems.push(`جدول ناقص على الموقع: ${table}`)
    } else if (r.status === 401 || r.body?.code === '42501') {
      unreadable.push(table)
    } else {
      problems.push(`${table}: ${r.status} ${msg}`)
    }
    break
  }
}

// 2. Every select string the app sends, exactly as written (embeds included).
function filesUnder(dir) {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(jsx?|ts)$/.test(f) ? [p] : []
  })
}
const selects = new Map()
for (const file of filesUnder('src')) {
  const code = readFileSync(file, 'utf8')
  for (const m of code.matchAll(/\.from\('(\w+)'\)\s*\.select\(\s*'([^']+)'/g)) {
    if (!unreadable.includes(m[1])) selects.set(`${m[1]}?select=${m[2].replace(/\s+/g, '')}`, file)
  }
}
for (const [query, file] of selects) {
  const r = await get(`${query}&limit=0`)
  if (r.status !== 200) problems.push(`استعلام الكود بيفشل على الموقع (${file}): ${query} → ${r.body?.code} ${r.body?.message}`)
}

// 3. Every function the app calls, without running it.
const rpcs = new Set()
for (const file of filesUnder('src')) {
  for (const m of readFileSync(file, 'utf8').matchAll(/\.rpc\('(\w+)'/g)) rpcs.add(m[1])
}
// The real argument names, with one value of an impossible type. Postgres has
// to find the function to know the type, and refuses the value before running
// it: "invalid input syntax" proves the function exists with that signature,
// PGRST202 says it doesn't. A function whose arguments are all text can't be
// probed this way without running it, so it is listed instead.
const BAD = { uuid: 'not-a-uuid', date: 'not-a-date', integer: 'not-a-number', bigint: 'x', numeric: 'x', boolean: 'not-a-bool' }
const goodValue = (type) => ({ uuid: '00000000-0000-0000-0000-000000000000', date: '2000-01-01', integer: 1, bigint: 1, numeric: 1, boolean: true, jsonb: {}, json: {} }[type] ?? 'x')
const notChecked = []
for (const fn of rpcs) {
  const def = cat.functions[fn]
  if (!def) { problems.push(`الكود بينادي ${fn} ومش موجودة حتى في ملفات المايجريشن`); continue }
  const names = def.argnames.slice(0, def.argtypes.length)
  const probeAt = def.argtypes.findIndex(t => BAD[t])
  if (probeAt < 0) { notChecked.push(fn); continue }
  const args = Object.fromEntries(names.map((n, i) => [n, i === probeAt ? BAD[def.argtypes[i]] : goodValue(def.argtypes[i])]))
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) problems.push(`الدالة ${fn} قبلت قيمة غلط ونفذت — راجعها`)
  else if (body.code === 'PGRST202') problems.push(`الدالة ${fn} مش موجودة على الموقع بنفس البارامترات (${names.join(', ')})`)
  else if (body.code !== '22P02' && body.code !== '22007' && body.code !== '22008') problems.push(`الدالة ${fn}: رد غير متوقع ${res.status} ${body.code} ${body.message}`)
}
if (notChecked.length) console.log(`دوال كل بارامتراتها نص، ما اتفحصتش عشان ما تتنفذش: ${notChecked.join('، ')}`)

console.log(`جداول: ${Object.keys(cat.columns).length} · استعلامات من الكود: ${selects.size} · دوال: ${rpcs.size}`)
if (unreadable.length) console.log(`مقفولة على الزائر (صح، ومش هتتفحص أعمدتها من هنا): ${unreadable.join('، ')}`)
console.log(problems.length ? `\nمشاكل (${problems.length}):\n- ${problems.join('\n- ')}` : '\nمفيش أي فرق بين الكود والداتابيز الحقيقية.')
await db.close()
process.exit(problems.length ? 1 : 0)
