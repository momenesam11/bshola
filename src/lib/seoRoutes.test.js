import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ALL_MARKETING_PAGES } from '../content/marketingPages'
import { GUIDES } from '../content/guides'
import { PLANS } from './seo'

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
const appRoutes = [...read('src/App.jsx').matchAll(/path="([^"]+)"/g)].map((m) => m[1])
const rewrites = JSON.parse(read('vercel.json')).rewrites
const prerendered = ['/', '/product', '/faq', '/guides', '/tools/no-show-calculator', '*']

const covered = (route) => {
  const url = route.replace(/:[A-Za-z]+/, 'x')
  return rewrites.some((r) => new RegExp(`^${r.source.replace('/:path*', '(/.*)?')}$`).test(url))
}

describe('every route reaches the browser', () => {
  // Unknown URLs now get a real 404, so an app page missing from vercel.json
  // would be a dead page in production.
  it('app pages are all in the vercel.json rewrites', () => {
    const missing = appRoutes.filter((r) => !prerendered.includes(r) && !covered(r))
    expect(missing).toEqual([])
    expect(appRoutes).toContain('/login') // the pattern above still finds routes
  })

  it('no rewrite would shadow a prerendered page', () => {
    const pages = [...prerendered.filter((p) => p !== '*'), ...ALL_MARKETING_PAGES.map((p) => `/${p.slug}`)]
    expect(pages.filter(covered)).toEqual([])
  })
})

describe('launch prices', () => {
  it('every plan saves the 25% the page promises, against a round later price', () => {
    for (const p of PLANS) {
      expect(p.regularPrice, p.name).toBeGreaterThan(p.price)
      expect(Math.round((1 - p.price / p.regularPrice) * 100), p.name).toBe(25)
      expect(p.regularPrice % 100, p.name).toBe(99)
    }
  })
})

describe('guides', () => {
  it('have unique slugs, titles and search terms', () => {
    for (const key of ['slug', 'title', 'keyword']) {
      expect(new Set(ALL_MARKETING_PAGES.map((p) => p[key])).size).toBe(ALL_MARKETING_PAGES.length)
    }
  })

  it('fit in search results and link to pages that exist', () => {
    const slugs = new Set(ALL_MARKETING_PAGES.map((p) => p.slug))
    for (const g of GUIDES) {
      expect(g.title.length, g.slug).toBeLessThanOrEqual(70)
      expect(g.description.length, g.slug).toBeLessThanOrEqual(170)
      for (const r of g.related) expect(slugs.has(r), `${g.slug} → ${r}`).toBe(true)
    }
  })

  it('never promise what the product does not do', () => {
    // MARKETING_CLAIMS.md: no result percentages, no automatic reminders.
    const text = JSON.stringify(GUIDES)
    expect(text).not.toMatch(/\d+\s*[%٪]/)
    expect(text).not.toMatch(/تذكير[^"]{0,20}(تلقائي|أوتوماتيك)/)
    expect(text).not.toMatch(/(تلقائي|أوتوماتيك)[^"]{0,20}تذكير/)
  })
})
