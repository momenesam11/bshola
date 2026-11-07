// A small PostgREST: turns the HTTP requests supabase-js sends into SQL, run
// under the caller's Postgres role so RLS applies, and answers the way the real
// one does. That includes the failures that matter most: an ambiguous embed
// (PGRST201), a missing relationship (PGRST200), an unknown column (PGRST204)
// and "not exactly one row" (PGRST116). Anything it doesn't understand throws
// loudly instead of guessing, so the app can't pass a test by accident.

const MAX_ROWS = 1000
const q = (s) => `"${String(s).replace(/"/g, '""')}"`
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

export class ApiError extends Error {
  constructor(status, code, message, details = null, hint = null) {
    super(message)
    Object.assign(this, { status, code, details, hint })
  }
}

export async function loadCatalog(db) {
  const columns = {}
  for (const r of (await db.query(`
    SELECT c.relname AS t, a.attname AS col, format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','v','p')
      AND a.attnum > 0 AND NOT a.attisdropped`)).rows) {
    (columns[r.t] ||= {})[r.col] = r.type
  }
  const fks = (await db.query(`
    SELECT con.conname AS name, src.relname AS src, tgt.relname AS tgt,
      (SELECT array_agg(attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(n, ord)
         JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n) AS src_cols,
      (SELECT array_agg(attname ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY k(n, ord)
         JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n) AS tgt_cols
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    WHERE con.contype = 'f' AND src.relnamespace = 'public'::regnamespace
      AND tgt.relnamespace = 'public'::regnamespace`)).rows
  const pks = {}
  for (const r of (await db.query(`
    SELECT c.relname AS t, array_agg(a.attname::text) AS cols FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE i.indisprimary AND c.relnamespace = 'public'::regnamespace GROUP BY 1`)).rows) {
    pks[r.t] = r.cols
  }
  const functions = {}
  for (const r of (await db.query(`
    SELECT p.proname AS name, p.proretset AS setof, format_type(p.prorettype, NULL) AS ret,
      t.typtype AS kind,
      coalesce(p.proargnames, '{}') AS argnames,
      coalesce((SELECT array_agg(format_type(x, NULL) ORDER BY ord)
        FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY u(x, ord)), '{}') AS argtypes,
      coalesce(p.proargmodes::text[], '{}') AS argmodes, p.pronargdefaults AS ndefaults
    FROM pg_proc p JOIN pg_type t ON t.oid = p.prorettype
    WHERE p.pronamespace = 'public'::regnamespace`)).rows) {
    functions[r.name] = r
  }
  return { columns, fks, pks, functions }
}

// ── select parser: "*, services(name), branches!fk_name(id)" ─────────────────
export function parseSelect(s) {
  let i = 0
  const col = (raw) => {
    let t = raw.trim()
    let alias = null
    const m = t.match(/^([^:]+):(?!:)(.+)$/)
    if (m) { alias = m[1].trim(); t = m[2].trim() }
    const [name, cast] = t.split('::')
    return { kind: 'col', name, cast: cast || null, alias }
  }
  const embed = (raw, children) => {
    let t = raw.trim()
    let alias = null
    const m = t.match(/^([^:]+):(.+)$/)
    if (m) { alias = m[1].trim(); t = m[2].trim() }
    const [name, ...hints] = t.split('!')
    return { kind: 'embed', name, hint: hints.find(h => h !== 'inner' && h !== 'left') || null, alias, children }
  }
  function list(end) {
    const items = []
    let buf = ''
    while (i < s.length && s[i] !== end) {
      const ch = s[i++]
      if (ch === ',') {
        if (buf.trim()) items.push(col(buf))
        buf = ''
      } else if (ch === '(') {
        const children = list(')')
        i++ // the closing paren
        items.push(embed(buf, children))
        buf = ''
      } else {
        buf += ch
      }
    }
    if (buf.trim()) items.push(col(buf))
    return items
  }
  return list(null)
}

function resolveEmbed(cat, source, node) {
  let rels = []
  for (const fk of cat.fks) {
    if (fk.src === source && fk.tgt === node.name) rels.push({ fk, many: false })
    if (fk.tgt === source && fk.src === node.name) rels.push({ fk, many: true })
  }
  if (node.hint) rels = rels.filter(r => r.fk.name === node.hint || r.fk.src_cols.includes(node.hint))
  if (rels.length === 0) {
    throw new ApiError(400, 'PGRST200',
      `Could not find a relationship between '${source}' and '${node.name}' in the schema cache`)
  }
  if (rels.length > 1) {
    throw new ApiError(300, 'PGRST201',
      `Could not embed because more than one relationship was found for '${source}' and '${node.name}'`,
      rels.map(r => ({ relationship: r.fk.name })),
      `Try changing '${node.name}' to one of: ${rels.map(r => `'${node.name}!${r.fk.name}'`).join(', ')}`)
  }
  return rels[0]
}

let aliasCounter = 0

function selectJson(cat, table, nodes, alias) {
  if (!cat.columns[table]) throw new ApiError(404, '42P01', `relation "public.${table}" does not exist`)
  const pieces = []
  let star = false
  for (const n of nodes) {
    if (n.kind === 'col') {
      if (n.name === '*') { star = true; continue }
      if (!cat.columns[table][n.name]) throw new ApiError(400, '42703', `column ${table}.${n.name} does not exist`)
      const ref = `${alias}.${q(n.name)}`
      pieces.push(`${lit(n.alias || n.name)}, ${n.cast ? `${ref}::${n.cast}` : ref}`)
    } else {
      const { fk, many } = resolveEmbed(cat, table, n)
      const child = `t${++aliasCounter}`
      const inner = selectJson(cat, n.name, n.children, child)
      const srcCols = many ? fk.tgt_cols : fk.src_cols
      const tgtCols = many ? fk.src_cols : fk.tgt_cols
      const on = srcCols.map((c, idx) => `${child}.${q(tgtCols[idx])} = ${alias}.${q(c)}`).join(' AND ')
      pieces.push(`${lit(n.alias || n.name)}, ${many
        ? `(SELECT coalesce(jsonb_agg(${inner}), '[]'::jsonb) FROM public.${q(n.name)} ${child} WHERE ${on})`
        : `(SELECT ${inner} FROM public.${q(n.name)} ${child} WHERE ${on} LIMIT 1)`}`)
    }
  }
  const base = star ? `to_jsonb(${alias})` : `'{}'::jsonb`
  return pieces.length ? `${base} || jsonb_build_object(${pieces.join(', ')})` : base
}

// ── filters ──────────────────────────────────────────────────────────────────
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }

function splitTop(s) {
  const out = []
  let depth = 0, inQuote = false, buf = ''
  for (const ch of s) {
    if (ch === '"') inQuote = !inQuote
    if (!inQuote && ch === '(') depth++
    if (!inQuote && ch === ')') depth--
    if (!inQuote && depth === 0 && ch === ',') { out.push(buf); buf = ''; continue }
    buf += ch
  }
  if (buf) out.push(buf)
  return out
}

const unquote = (v) => {
  v = v.trim()
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v
}

function condition(cat, table, alias, col, expr, params) {
  const type = cat.columns[table]?.[col]
  if (!type) throw new ApiError(400, '42703', `column ${table}.${col} does not exist`)
  const ref = `${alias}.${q(col)}`
  let neg = false
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4) }
  const dot = expr.indexOf('.')
  if (dot < 0) throw new ApiError(400, 'PGRST100', `failed to parse filter (${expr})`)
  const op = expr.slice(0, dot)
  const val = expr.slice(dot + 1)
  let sql
  if (OPS[op]) {
    params.push(val)
    sql = `${ref} ${OPS[op]} $${params.length}::${type}`
  } else if (op === 'like' || op === 'ilike') {
    params.push(val.replace(/\*/g, '%'))
    sql = `${ref}::text ${op.toUpperCase()} $${params.length}`
  } else if (op === 'in') {
    params.push(JSON.stringify(splitTop(val.replace(/^\(/, '').replace(/\)$/, '')).map(unquote)))
    sql = `${ref} IN (SELECT value::${type} FROM jsonb_array_elements_text($${params.length}::jsonb) value)`
  } else if (op === 'is') {
    const v = { null: 'NULL', true: 'TRUE', false: 'FALSE' }[val]
    if (!v) throw new ApiError(400, 'PGRST100', `bad is. value ${val}`)
    sql = `${ref} IS ${v}`
  } else {
    throw new Error(`local PostgREST: filter operator not supported yet: ${op}`)
  }
  return neg ? `NOT (${sql})` : sql
}

function logicTree(cat, table, alias, raw, joiner, params) {
  const body = raw.replace(/^\(/, '').replace(/\)$/, '')
  return splitTop(body).map(part => {
    part = part.trim()
    const m = part.match(/^(not\.)?(and|or)\((.*)\)$/)
    if (m) {
      const inner = logicTree(cat, table, alias, `(${m[3]})`, m[2].toUpperCase(), params)
      return m[1] ? `NOT (${inner})` : `(${inner})`
    }
    const dot = part.indexOf('.')
    return condition(cat, table, alias, part.slice(0, dot), part.slice(dot + 1), params)
  }).join(` ${joiner} `)
}

function buildWhere(cat, table, alias, search, params) {
  const conds = []
  for (const [k, v] of search.entries()) {
    if (RESERVED.has(k)) continue
    if (k === 'or' || k === 'and') conds.push(`(${logicTree(cat, table, alias, v, k.toUpperCase(), params)})`)
    else if (k.includes('.')) throw new Error(`local PostgREST: embedded filter not supported yet: ${k}`)
    else conds.push(condition(cat, table, alias, k, v, params))
  }
  return conds.length ? `WHERE ${conds.join(' AND ')}` : ''
}

function buildOrder(cat, table, alias, raw) {
  if (!raw) return ''
  return 'ORDER BY ' + raw.split(',').map(p => {
    const [col, ...mods] = p.split('.')
    if (!cat.columns[table]?.[col]) throw new ApiError(400, '42703', `column ${table}.${col} does not exist`)
    const nulls = mods.includes('nullsfirst') ? ' NULLS FIRST' : mods.includes('nullslast') ? ' NULLS LAST' : ''
    return `${alias}.${q(col)} ${mods.includes('desc') ? 'DESC' : 'ASC'}${nulls}`
  }).join(', ')
}

// ── requests ─────────────────────────────────────────────────────────────────
const wantsObject = (headers) => (headers.accept || '').includes('vnd.pgrst.object')

function prefer(headers) {
  const out = {}
  for (const p of (headers.prefer || '').split(',')) {
    const [k, v] = p.trim().split('=')
    if (k) out[k] = v ?? true
  }
  return out
}

function asObject(rows) {
  if (rows.length !== 1) {
    throw new ApiError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned',
      `The result contains ${rows.length} rows`)
  }
  return rows[0]
}

function checkColumns(cat, table, cols) {
  for (const c of cols) {
    if (!cat.columns[table][c]) {
      throw new ApiError(400, 'PGRST204', `Could not find the '${c}' column of '${table}' in the schema cache`)
    }
  }
}

function writeResponse(status, headers, rows, nodes, prefs) {
  if (prefs.return !== 'representation') return { status: status === 200 ? 204 : status, headers: {}, body: undefined }
  if (nodes.some(n => n.kind === 'embed')) throw new Error('local PostgREST: embed on write response not supported')
  const hasStar = nodes.some(n => n.kind === 'col' && n.name === '*')
  const shaped = hasStar ? rows : rows.map(r => Object.fromEntries(nodes.map(n => [n.alias || n.name, r[n.name]])))
  return { status, headers: {}, body: wantsObject(headers) ? asObject(shaped) : shaped }
}

export async function handleTable({ tx, cat, method, table, search, headers, body }) {
  if (!cat.columns[table]) {
    throw new ApiError(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`)
  }
  const prefs = prefer(headers)
  const alias = 'src'
  const nodes = parseSelect(search.get('select') || '*')

  if (method === 'GET' || method === 'HEAD') {
    const params = []
    const where = buildWhere(cat, table, alias, search, params)
    const json = selectJson(cat, table, nodes, alias)
    const order = buildOrder(cat, table, alias, search.get('order'))
    // Supabase's max-rows: no request returns more than 1000 rows, whatever
    // limit it asks for. Without this a screen that silently loses rows past
    // 1000 would pass every test.
    const limit = `LIMIT ${Math.min(Number(search.get('limit') || MAX_ROWS), MAX_ROWS)}`
    const offset = search.get('offset') ? `OFFSET ${Number(search.get('offset'))}` : ''
    const rows = (await tx.query(
      `SELECT ${json} AS row FROM public.${q(table)} ${alias} ${where} ${order} ${limit} ${offset}`, params,
    )).rows.map(r => r.row)
    const out = { status: 200, headers: {} }
    if (prefs.count) {
      const n = (await tx.query(`SELECT count(*)::int AS n FROM public.${q(table)} ${alias} ${where}`, params)).rows[0].n
      out.headers['content-range'] = `${rows.length ? `0-${rows.length - 1}` : '*'}/${n}`
    }
    out.body = method === 'HEAD' ? undefined : wantsObject(headers) ? asObject(rows) : rows
    return out
  }

  if (method === 'POST') {
    const list = Array.isArray(body) ? body : [body]
    const results = []
    for (const row of list) {
      const cols = Object.keys(row)
      checkColumns(cat, table, cols)
      const insertCols = cols.length ? `(${cols.map(q).join(', ')})` : ''
      const values = cols.length
        ? `SELECT ${cols.map(q).join(', ')} FROM jsonb_populate_record(NULL::public.${q(table)}, $1::jsonb)`
        : 'DEFAULT VALUES'
      let conflict = ''
      if (prefs.resolution) {
        const target = search.get('on_conflict')?.split(',') || cat.pks[table]
        const up = cols.filter(c => !target.includes(c))
        conflict = `ON CONFLICT (${target.map(q).join(', ')}) ` + (prefs.resolution === 'ignore-duplicates' || !up.length
          ? 'DO NOTHING'
          : `DO UPDATE SET ${up.map(c => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')}`)
      }
      const returning = prefs.return === 'representation' ? 'RETURNING to_jsonb(src) AS row' : ''
      const r = await tx.query(
        `INSERT INTO public.${q(table)} AS src ${insertCols} ${values} ${conflict} ${returning}`,
        cols.length ? [JSON.stringify(row)] : [],
      )
      results.push(...r.rows.map(x => x.row))
    }
    return writeResponse(201, headers, results, nodes, prefs)
  }

  if (method === 'PATCH') {
    const cols = Object.keys(body || {})
    checkColumns(cat, table, cols)
    const params = [JSON.stringify(body)]
    const where = buildWhere(cat, table, alias, search, params)
    const set = cols.map(c => `${q(c)} = (jsonb_populate_record(NULL::public.${q(table)}, $1::jsonb)).${q(c)}`).join(', ')
    const returning = prefs.return === 'representation' ? 'RETURNING to_jsonb(src) AS row' : ''
    const r = await tx.query(`UPDATE public.${q(table)} ${alias} SET ${set} ${where} ${returning}`, params)
    return writeResponse(200, headers, r.rows.map(x => x.row), nodes, prefs)
  }

  if (method === 'DELETE') {
    const params = []
    const where = buildWhere(cat, table, alias, search, params)
    const returning = prefs.return === 'representation' ? 'RETURNING to_jsonb(src) AS row' : ''
    const r = await tx.query(`DELETE FROM public.${q(table)} ${alias} ${where} ${returning}`, params)
    return writeResponse(200, headers, r.rows.map(x => x.row), nodes, prefs)
  }

  throw new Error(`local PostgREST: method ${method} not supported`)
}

export async function handleRpc({ tx, cat, name, args }) {
  const fn = cat.functions[name]
  const provided = Object.keys(args || {})
  const notFound = () => new ApiError(404, 'PGRST202',
    `Could not find the function public.${name}(${provided.join(', ')}) in the schema cache`)
  if (!fn) throw notFound()
  const inNames = fn.argnames.filter((_, i) => !fn.argmodes.length || ['i', 'b', 'v'].includes(fn.argmodes[i]))
  if (provided.some(k => !inNames.includes(k))) throw notFound()
  if (inNames.slice(0, inNames.length - fn.ndefaults).some(r => !provided.includes(r))) throw notFound()

  const params = []
  const argSql = provided.map(k => {
    const type = fn.argtypes[inNames.indexOf(k)]
    const v = args[k]
    if (v !== null && typeof v === 'object' && type.endsWith('[]')) {
      params.push(JSON.stringify(v))
      return `${q(k)} := (SELECT coalesce(array_agg(x::${type.slice(0, -2)}), '{}') FROM jsonb_array_elements_text($${params.length}::jsonb) x)`
    }
    params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v)
    return `${q(k)} := $${params.length}::${type}`
  }).join(', ')

  const call = `public.${q(name)}(${argSql})`
  const composite = fn.kind === 'c' || fn.ret === 'record'
  if (fn.setof) {
    const sql = composite ? `SELECT to_jsonb(r) AS v FROM ${call} r` : `SELECT to_jsonb(r.x) AS v FROM ${call} AS r(x)`
    return { status: 200, headers: {}, body: (await tx.query(sql, params)).rows.map(r => r.v) }
  }
  if (composite) {
    const row = (await tx.query(`SELECT to_jsonb(r) AS v FROM ${call} r`, params)).rows[0]
    return { status: 200, headers: {}, body: row?.v ?? null }
  }
  if (fn.ret === 'void') {
    await tx.query(`SELECT ${call}`, params)
    return { status: 204, headers: {}, body: undefined }
  }
  const row = (await tx.query(`SELECT to_jsonb(${call}) AS v`, params)).rows[0]
  return { status: 200, headers: {}, body: row.v }
}

const PG_STATUS = { 23505: 409, 23503: 409, 42501: 403, P0001: 400, 42883: 404, '42P01': 404 }

export function pgErrorToApi(e, role) {
  if (e instanceof ApiError || !e.code) return e
  let status = PG_STATUS[e.code] || 400
  if (e.code === '42501' && role === 'anon') status = 401
  return new ApiError(status, e.code, e.message, e.detail ?? null, e.hint ?? null)
}
