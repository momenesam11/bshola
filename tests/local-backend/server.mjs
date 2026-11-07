// Local stand-in for the Supabase project: REST, Auth, Storage and the real Edge
// Functions, over a throwaway in-memory Postgres. It listens on loopback only and
// holds no production credentials, so nothing a test does can reach the live site.

import http from 'node:http'
import { Buffer } from 'node:buffer'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { transformSync } from 'esbuild'
import { bootDatabase } from './schema.mjs'
import { handleTable, handleRpc, loadCatalog, pgErrorToApi, ApiError } from './postgrest.mjs'

export const ANON_KEY = 'local-anon-key'
export const SERVICE_KEY = 'local-service-role-key'
export const ADMIN_PASSWORD = 'local-admin-password'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function makeJwt(user) {
  const now = Math.floor(Date.now() / 1000)
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600,
    user_metadata: user.raw_user_meta_data || {},
  })}.local`
}
function readJwt(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return p.exp && p.exp * 1000 > Date.now() ? p : null
  } catch { return null }
}

export async function startBackend({ port = 0, log = () => {} } = {}) {
  const db = await bootDatabase()
  const cat = await loadCatalog(db)
  const files = new Map() // storage bytes: `${bucket}/${name}` -> { bytes, type }
  const refreshTokens = new Map()
  const requestLog = []
  const edgeRoutes = {}
  const passwords = new Map()
  const sentEmails = []

  function identify(headers) {
    const auth = (headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (auth === SERVICE_KEY || headers.apikey === SERVICE_KEY) return { role: 'service_role', sub: null }
    if (auth && auth !== ANON_KEY) {
      const claims = readJwt(auth)
      if (!claims) throw new ApiError(401, 'PGRST301', 'JWT expired')
      return { role: 'authenticated', sub: claims.sub, claims }
    }
    return { role: 'anon', sub: null }
  }

  function asRole(who, headers, fn) {
    return db.transaction(async (tx) => {
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true),
        set_config('request.jwt.claim.role', $2, true),
        set_config('request.jwt.claims', $3, true),
        set_config('request.headers', $4, true)`,
      [who.sub || '', who.role, JSON.stringify(who.claims || { role: who.role }), JSON.stringify({
        'x-forwarded-for': headers['x-test-ip'] || `test-${who.sub || 'visitor'}-${randomUUID()}`,
      })])
      await tx.exec(`SET LOCAL ROLE ${who.role}`)
      return fn(tx)
    })
  }

  const publicUser = (u) => ({
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: u.created_at, confirmed_at: u.created_at, created_at: u.created_at,
    updated_at: u.updated_at, user_metadata: u.raw_user_meta_data || {},
    app_metadata: { provider: 'email', providers: ['email'] }, identities: [],
  })
  function session(u) {
    const refresh = randomUUID()
    refreshTokens.set(refresh, u.id)
    return {
      access_token: makeJwt(u), token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: refresh, user: publicUser(u),
    }
  }
  const authError = (status, code, msg) => Object.assign(new ApiError(status, code, msg), { authShape: true })

  async function createUser({ email, password, data = {} }) {
    const { rows } = await db.query(
      'INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2::jsonb) RETURNING *',
      [email.toLowerCase(), JSON.stringify(data)])
    passwords.set(rows[0].id, password)
    return rows[0]
  }
  const userById = async (id) => (await db.query('SELECT * FROM auth.users WHERE id = $1', [id])).rows[0]

  async function handleAuth(method, path, url, headers, body) {
    if (path === '/settings') return { status: 200, body: { external: { google: true, email: true }, disable_signup: false } }
    if (path === '/signup' && method === 'POST') {
      if ((await db.query('SELECT 1 FROM auth.users WHERE email = $1', [body.email?.toLowerCase()])).rows.length) {
        throw authError(422, 'user_already_exists', 'User already registered')
      }
      if (!body.password || body.password.length < 6) {
        throw authError(422, 'weak_password', 'Password should be at least 6 characters.')
      }
      return { status: 200, body: session(await createUser({ email: body.email, password: body.password, data: body.data })) }
    }
    if (path === '/token' && method === 'POST') {
      const grant = url.searchParams.get('grant_type')
      if (grant === 'password') {
        const u = (await db.query('SELECT * FROM auth.users WHERE email = $1', [body.email?.toLowerCase()])).rows[0]
        if (!u || passwords.get(u.id) !== body.password) throw authError(400, 'invalid_credentials', 'Invalid login credentials')
        return { status: 200, body: session(u) }
      }
      if (grant === 'refresh_token') {
        const id = refreshTokens.get(body.refresh_token)
        const u = id && await userById(id)
        if (!u) throw authError(400, 'refresh_token_not_found', 'Invalid Refresh Token')
        return { status: 200, body: session(u) }
      }
    }
    if (path === '/user') {
      const who = identify(headers)
      if (!who.sub) throw authError(401, 'no_authorization', 'missing session')
      if (method === 'PUT') {
        if (body.password) passwords.set(who.sub, body.password)
        if (body.data) {
          await db.query('UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || $2::jsonb WHERE id = $1',
            [who.sub, JSON.stringify(body.data)])
        }
      }
      const u = await userById(who.sub)
      if (!u) throw authError(403, 'user_not_found', 'user not found')
      return { status: 200, body: publicUser(u) }
    }
    if (path === '/logout') return { status: 204 }
    if (path === '/recover' && method === 'POST') {
      sentEmails.push({ kind: 'recover', to: body.email, redirect: url.searchParams.get('redirect_to') })
      return { status: 200, body: {} }
    }
    throw new Error(`local Auth: ${method} ${path} not supported`)
  }

  async function handleStorage(method, path, headers, rawBody) {
    const who = identify(headers)
    const parts = path.split('/').filter(Boolean)
    if (parts[0] === 'object' && parts[1] === 'sign' && method === 'POST') {
      const [bucket, ...rest] = parts.slice(2)
      const name = rest.join('/')
      const seen = await asRole(who, headers, tx =>
        tx.query('SELECT 1 FROM storage.objects WHERE bucket_id=$1 AND name=$2', [bucket, name]))
      if (!seen.rows.length) throw new ApiError(400, 'not_found', 'Object not found')
      return { status: 200, body: { signedURL: `/object/sign/${bucket}/${name}?token=local` } }
    }
    if (parts[0] === 'object' && (parts[1] === 'public' || parts[1] === 'sign') && method === 'GET') {
      const f = files.get(parts.slice(2).join('/'))
      if (parts[1] === 'public') {
        const bucket = (await db.query('SELECT public FROM storage.buckets WHERE id=$1', [parts[2]])).rows[0]
        if (!bucket?.public) throw new ApiError(400, 'not_found', 'Object not found')
      }
      if (!f) throw new ApiError(400, 'not_found', 'Object not found')
      return { status: 200, raw: f.bytes, contentType: f.type }
    }
    if (parts[0] === 'object' && (method === 'POST' || method === 'PUT') && parts.length >= 3) {
      const bucket = parts[1]
      const name = parts.slice(2).join('/')
      const upsert = headers['x-upsert'] === 'true' || method === 'PUT'
      // Checked before the transaction: PGlite has one connection, so a query on
      // `db` inside it would wait for the transaction forever.
      const exists = (await db.query('SELECT 1 FROM storage.objects WHERE bucket_id=$1 AND name=$2', [bucket, name])).rows.length
      await asRole(who, headers, async (tx) => {
        if (exists && !upsert) throw new ApiError(409, 'Duplicate', 'The resource already exists')
        if (exists) {
          const r = await tx.query('UPDATE storage.objects SET updated_at = now() WHERE bucket_id=$1 AND name=$2 RETURNING id', [bucket, name])
          if (!r.rows.length) throw new ApiError(403, 'Unauthorized', 'new row violates row-level security policy')
        } else {
          await tx.query('INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1,$2,$3)', [bucket, name, who.sub])
        }
      })
      files.set(`${bucket}/${name}`, { bytes: rawBody, type: headers['content-type'] })
      return { status: 200, body: { Key: `${bucket}/${name}`, Id: randomUUID() } }
    }
    if (parts[0] === 'object' && method === 'DELETE') {
      const bucket = parts[1]
      const prefixes = JSON.parse(rawBody.toString() || '{}').prefixes || []
      const removed = []
      await asRole(who, headers, async (tx) => {
        for (const p of prefixes) {
          const r = await tx.query('DELETE FROM storage.objects WHERE bucket_id=$1 AND name=$2 RETURNING name', [bucket, p])
          if (r.rows.length) { files.delete(`${bucket}/${p}`); removed.push({ name: p }) }
        }
      })
      return { status: 200, body: removed }
    }
    throw new Error(`local Storage: ${method} ${path} not supported`)
  }

  async function loadEdgeFunction(name, baseUrl) {
    if (edgeRoutes[name]) return edgeRoutes[name]
    // The real function file, with only its Deno imports swapped, so the password
    // check, session check and every action run exactly as written.
    const sdk = pathToFileURL(join(root, 'node_modules/@supabase/supabase-js/dist/index.mjs')).href
    const code = readFileSync(join(root, 'supabase', 'functions', name, 'index.ts'), 'utf8')
      .replace(/import \{ serve \} from '[^']+'/, 'const serve = (h) => { globalThis.__edgeHandler = h }')
      .replace(/from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2'/, `from ${JSON.stringify(sdk)}`)
    globalThis.Deno = {
      env: {
        get: (k) => ({
          SUPABASE_URL: baseUrl,
          SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
          ADMIN_DASHBOARD_PASSWORD: ADMIN_PASSWORD,
        }[k]),
      },
    }
    const js = transformSync(code, { loader: 'ts', format: 'esm' }).code
    const dir = join(tmpdir(), `beshola-edge-${process.pid}`)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${name}-${Date.now()}.mjs`)
    writeFileSync(file, js)
    await import(pathToFileURL(file).href)
    edgeRoutes[name] = globalThis.__edgeHandler
    rmSync(file, { force: true })
    return edgeRoutes[name]
  }

  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const rawBody = Buffer.concat(chunks)
    const url = new URL(req.url, 'http://x')
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
      'Access-Control-Expose-Headers': 'content-range, content-profile',
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }

    const record = (status, error) => requestLog.push({
      method: req.method, path: url.pathname + url.search, status, ...(status >= 300 ? { error } : {}),
    })
    const send = (status, body, headers = {}) => {
      if (!url.pathname.startsWith('/__test/')) record(status, body)
      if (body === undefined) { res.writeHead(status, { ...cors, ...headers }); return res.end() }
      res.writeHead(status, { 'Content-Type': 'application/json', ...cors, ...headers })
      res.end(JSON.stringify(body))
    }
    const json = () => (rawBody.length ? JSON.parse(rawBody.toString()) : {})

    let who = { role: 'anon' }
    try {
      // Test-only door: lets a test seed rows and check results as the database
      // superuser. The server only ever listens on loopback.
      if (url.pathname === '/__test/sql') {
        const { sql, params } = json()
        return send(200, (await db.query(sql, params || [])).rows)
      }
      if (url.pathname === '/__test/user') return send(200, await createUser(json()))
      if (url.pathname === '/__test/session') {
        const { id, expired, badRefresh } = json()
        const s = session(await userById(id))
        // An access token that ran out an hour ago, as after a laptop sleeps.
        if (expired) {
          const claims = JSON.parse(Buffer.from(s.access_token.split('.')[1], 'base64url').toString())
          claims.exp = Math.floor(Date.now() / 1000) - 3600
          s.access_token = `${s.access_token.split('.')[0]}.${b64(claims)}.local`
          s.expires_at = claims.exp
        }
        if (badRefresh) s.refresh_token = 'revoked'
        return send(200, s)
      }
      if (url.pathname === '/__test/emails') return send(200, sentEmails)
      if (url.pathname === '/__test/log') {
        const out = requestLog.slice()
        if (url.searchParams.get('clear')) requestLog.length = 0
        return send(200, out)
      }

      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        who = identify(req.headers)
        const name = url.pathname.slice('/rest/v1/rpc/'.length)
        const args = req.method === 'GET' ? Object.fromEntries(url.searchParams) : json()
        const r = await asRole(who, req.headers, tx => handleRpc({ tx, cat, name, args }))
        return send(r.status, r.body, r.headers)
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        who = identify(req.headers)
        const table = url.pathname.slice('/rest/v1/'.length)
        const r = await asRole(who, req.headers, tx => handleTable({
          tx, cat, method: req.method, table, search: url.searchParams, headers: req.headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? null : json(),
        }))
        return send(r.status, r.body, r.headers)
      }
      if (url.pathname === '/auth/v1/authorize') {
        res.writeHead(302, { ...cors, Location: `${url.searchParams.get('redirect_to')}#error=local_oauth_stub` })
        return res.end()
      }
      if (url.pathname.startsWith('/auth/v1/')) {
        const r = await handleAuth(req.method, url.pathname.slice('/auth/v1'.length), url, req.headers, json())
        return send(r.status, r.body)
      }
      if (url.pathname.startsWith('/storage/v1/')) {
        const r = await handleStorage(req.method, url.pathname.slice('/storage/v1'.length), req.headers, rawBody)
        if (r.raw) {
          record(r.status)
          res.writeHead(r.status, { ...cors, 'Content-Type': r.contentType || 'application/octet-stream' })
          return res.end(r.raw)
        }
        return send(r.status, r.body)
      }
      if (url.pathname.startsWith('/functions/v1/')) {
        const name = url.pathname.slice('/functions/v1/'.length)
        const base = `http://127.0.0.1:${server.address().port}`
        const handler = await loadEdgeFunction(name, base)
        const out = await handler(new Request(base + url.pathname, {
          method: req.method,
          headers: { 'content-type': 'application/json', 'x-real-ip': String(req.headers['x-test-ip'] || req.socket.remoteAddress) },
          body: rawBody.length ? rawBody : undefined,
        }))
        const text = await out.text()
        record(out.status, text)
        res.writeHead(out.status, { ...cors, 'Content-Type': 'application/json' })
        return res.end(text)
      }
      return send(404, { message: `local backend: unknown path ${url.pathname}` })
    } catch (e) {
      const err = pgErrorToApi(e, who.role)
      if (err instanceof ApiError) {
        if (err.authShape) return send(err.status, { code: err.status, error_code: err.code, msg: err.message })
        if (url.pathname.startsWith('/storage/')) {
          return send(err.status, { statusCode: String(err.status), error: err.code, message: err.message })
        }
        return send(err.status, { code: err.code, message: err.message, details: err.details, hint: err.hint })
      }
      log(`BACKEND BUG ${req.method} ${req.url}: ${e.stack}`)
      return send(500, { code: 'LOCAL_BACKEND_BUG', message: String(e.message) })
    }
  })

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  const actualPort = server.address().port
  return {
    url: `http://127.0.0.1:${actualPort}`,
    port: actualPort, db, requestLog, createUser,
    close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.() }),
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.LOCAL_BACKEND_PORT || 54399)
  const b = await startBackend({ port, log: console.error })
  if (process.env.LOCAL_SEED) {
    const { seedDemoData } = await import('./seed.mjs')
    await seedDemoData(b.db, b.createUser)
  }
  console.log(`local backend ready on ${b.url}`)
}
