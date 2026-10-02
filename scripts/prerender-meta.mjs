// Writes one static HTML file per public marketing route, each carrying that
// route's own <title>, description, canonical and Open Graph tags.
//
// Why: this is a client-rendered SPA, so before this step every URL was served
// the same dist/index.html — the home page's title and a canonical pointing at
// "/". Google only saw the right tags after rendering JS (a second, slower
// pass), and WhatsApp/Facebook link previews never run JS at all, so a link to
// /solutions/salons previewed as the home page. Seo.jsx still renders the same
// tags at runtime and removes these static copies, so nothing is duplicated.
//
// Output is dist/<slug>.html; vercel.json's `cleanUrls` serves it at /<slug>,
// and anything without a file falls through to the SPA rewrite as before.
//
// Runs after `vite build` via the `postbuild` npm script.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_MARKETING_PAGES } from '../src/content/marketingPages.js'
import { LEGAL_PAGES } from '../src/content/legalPages.js'
import { HOME_META, PRODUCT_META, FAQ_META } from '../src/content/pageMeta.js'
import { SITE_NAME, absoluteUrl } from '../src/lib/seo.js'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const template = readFileSync(join(distDir, 'index.html'), 'utf8')

const routes = [
  { ...HOME_META, ogType: 'website' },
  { ...PRODUCT_META, ogType: 'website' },
  { ...FAQ_META, ogType: 'website' },
  ...ALL_MARKETING_PAGES.map((p) => ({
    path: `/${p.slug}`,
    title: p.title,
    description: p.description,
    ogType: 'article',
  })),
  ...LEGAL_PAGES.map((p) => ({
    path: `/${p.slug}`,
    title: p.metaTitle,
    description: p.metaDescription,
    ogType: 'website',
  })),
]

const escapeAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Replaces exactly one tag; throws if index.html stops containing it, so a
// template edit can't silently ship pages that all fall back to the home tags.
function replaceOne(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`prerender-meta: ${label} not found in dist/index.html`)
  return html.replace(pattern, replacement)
}

function renderRoute({ path, title, description, ogType }) {
  // Same title rule as Seo.jsx.
  const fullTitle = escapeAttr(title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`)
  const desc = escapeAttr(description)
  const url = escapeAttr(absoluteUrl(path))
  const meta = (attr, key) => new RegExp(`<meta ${attr}="${key}" content="[^"]*" />`)

  let html = template
  html = replaceOne(html, /<title>[^<]*<\/title>/, `<title>${fullTitle}</title>`, 'title')
  html = replaceOne(html, meta('name', 'description'), `<meta name="description" content="${desc}" />`, 'description')
  html = replaceOne(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`, 'canonical')
  html = replaceOne(html, meta('property', 'og:type'), `<meta property="og:type" content="${ogType}" />`, 'og:type')
  html = replaceOne(html, meta('property', 'og:url'), `<meta property="og:url" content="${url}" />`, 'og:url')
  html = replaceOne(html, meta('property', 'og:title'), `<meta property="og:title" content="${fullTitle}" />`, 'og:title')
  html = replaceOne(html, meta('property', 'og:description'), `<meta property="og:description" content="${desc}" />`, 'og:description')
  html = replaceOne(html, meta('name', 'twitter:title'), `<meta name="twitter:title" content="${fullTitle}" />`, 'twitter:title')
  html = replaceOne(html, meta('name', 'twitter:description'), `<meta name="twitter:description" content="${desc}" />`, 'twitter:description')
  return html
}

for (const route of routes) {
  const file = route.path === '/' ? 'index.html' : `${route.path.slice(1)}.html`
  const out = join(distDir, file)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, renderRoute(route), 'utf8')
}

console.log(`prerender-meta: wrote static head tags for ${routes.length} routes`)
