// Writes one complete HTML file per public page: the real page text plus that
// page's own title, description, canonical, Open Graph and JSON-LD.
//
// Why: this is a client-rendered app, so without this step every URL was served
// an empty <div id="root">. Google only saw the content after a second, slower
// rendering pass and competitors with plain HTML had the edge; link previews
// never saw it at all. main.jsx hydrates these files, so nothing repaints.
//
// Also writes:
//   dist/app.html  the empty shell for app pages (login, dashboard, booking…),
//                  which vercel.json rewrites to explicitly
//   dist/404.html  so an unknown URL gets a real 404 status, not a 200 home page
//
// Runs after both vite builds, via the `postbuild` npm script.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const ssrDir = join(root, 'dist-ssr')

const ssr = await import(pathToFileURL(join(ssrDir, 'entry-server.js')).href)
const template = readFileSync(join(distDir, 'index.html'), 'utf8')

const STATIC_HEAD_TAG = /[ \t]*<[^>]*data-static-head[^>]*>\s*/g
const TITLE = /<title>[^<]*<\/title>/
const ROOT = '<div id="root"></div>'

for (const required of [TITLE, ROOT]) {
  if (!template.match(required)) throw new Error(`prerender: ${required} not found in dist/index.html`)
}
if (!template.includes('data-static-head')) throw new Error('prerender: index.html has no data-static-head tags')

// React places a page's <title>, <meta> and <link> tags at the very start of its
// output. Those belong in <head>; the rest goes inside #root.
const LEADING_HEAD_TAG = /^(?:<title[^>]*>[^<]*<\/title>|<meta [^>]*\/>|<link [^>]*\/>)/
function splitHead(html) {
  let rest = html
  let head = ''
  for (let m = rest.match(LEADING_HEAD_TAG); m; m = rest.match(LEADING_HEAD_TAG)) {
    head += m[0]
    rest = rest.slice(m[0].length)
  }
  return { head, body: rest }
}

// Reveal.jsx hides sections until they scroll into view, which only works with
// JavaScript. Without it, show everything.
const NOSCRIPT = '<noscript><style>.opacity-0{opacity:1!important;transform:none!important}</style></noscript>'

function page(path) {
  const { head, body } = splitHead(ssr.render(path).html)
  if (!head.includes('<title')) throw new Error(`prerender: ${path} rendered no <title>`)
  if (!body.includes('<h1')) throw new Error(`prerender: ${path} rendered no <h1>`)
  return template
    .replace(STATIC_HEAD_TAG, '')
    .replace(TITLE, () => '')
    .replace('</head>', () => `${head}${NOSCRIPT}</head>`)
    .replace(ROOT, () => `<div id="root">${body}</div>`)
}

const routes = [
  ssr.HOME_META.path,
  ssr.PRODUCT_META.path,
  ssr.FAQ_META.path,
  ssr.CALCULATOR_META.path,
  ssr.GUIDES_META.path,
  ...ssr.ALL_MARKETING_PAGES.map((p) => `/${p.slug}`),
  ...ssr.LEGAL_PAGES.map((p) => `/${p.slug}`),
]

// The app shell first: it needs the untouched template.
writeFileSync(
  join(distDir, 'app.html'),
  template.replace(/[ \t]*<link rel="canonical"[^>]*>\s*/, '').replace(/[ \t]*<meta property="og:url"[^>]*>\s*/, ''),
  'utf8'
)

for (const path of routes) {
  const file = path === '/' ? 'index.html' : `${path.slice(1)}.html`
  const out = join(distDir, file)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, page(path), 'utf8')
}

writeFileSync(join(distDir, '404.html'), page('/__not_found__'), 'utf8')

rmSync(ssrDir, { recursive: true, force: true })
console.log(`prerender: wrote ${routes.length} pages, 404.html and app.html`)
