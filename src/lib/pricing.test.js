import { describe, it, expect } from 'vitest'
import { getPricing, localizeMoneyText, pricePerMonth, PLANS } from './pricing'
import { softwareApplicationSchema, COUNTRY_PAGE_PATHS, REGIONAL_ALTERNATES } from './seo'
import { ALL_MARKETING_PAGES, PRICING_PAGE, pageBySlug } from '../content/marketingPages'
import { COUNTRY_PAGES } from '../content/countryPages'
import { FAQS } from '../content/faqs'

const pageTexts = (page) => [
  page.intro,
  ...page.sections.filter((s) => !s.egyptOnly).flatMap((s) => [s.body, ...(s.bullets ?? [])]),
  ...(page.faqs ?? []).map((f) => f.a),
]

describe('price per country', () => {
  it('gives each country its agreed price list', () => {
    const prices = (code) => getPricing(code).plans.map((p) => p.price)
    expect(prices('SA')).toEqual([99, 249, 399])
    expect(getPricing('SA').currency).toBe('SAR')
    expect(prices('AE')).toEqual([99, 249, 399])
    expect(getPricing('AE').currency).toBe('AED')
    expect(prices('KW')).toEqual([8, 20, 32])
    expect(prices('BH')).toEqual([10, 25, 40])
    expect(prices('OM')).toEqual([10, 25, 40])
    expect(prices('JO')).toEqual([10, 25, 40])
    expect(prices('MA')).toEqual([149, 375, 599])
    expect(prices('TN')).toEqual([39, 99, 159])
  })

  it('prices other Arab countries in dollars', () => {
    for (const code of ['LB', 'SY', 'IQ', 'YE', 'SD', 'LY', 'DZ']) {
      expect(getPricing(code).currency).toBe('USD')
      expect(getPricing(code).plans.map((p) => p.price)).toEqual([19, 48, 76])
    }
  })

  it('keeps Egypt and non-Arab visitors on the Egyptian list', () => {
    for (const code of ['EG', 'US', 'DE', null, undefined]) {
      expect(getPricing(code).isEgypt).toBe(true)
      expect(getPricing(code).plans).toBe(PLANS)
    }
  })

  it('shows no launch discount outside Egypt', () => {
    expect(getPricing('SA').plans.every((p) => p.regularPrice === undefined)).toBe(true)
  })

  it('keeps a decimal on small monthly amounts only', () => {
    expect(pricePerMonth({ price: 20, months: 3 })).toBe(6.7)
    expect(pricePerMonth({ price: 749, months: 3 })).toBe(250)
    expect(pricePerMonth({ price: 1200, months: 6 })).toBe(200)
  })
})

describe('marketing copy for a visitor outside Egypt', () => {
  it('leaves Egyptian copy untouched for Egypt', () => {
    const text = PRICING_PAGE.faqs[0].a
    expect(localizeMoneyText(text, getPricing('EG'))).toBe(text)
  })

  it('swaps prices and drops the launch price', () => {
    const sa = getPricing('SA')
    expect(localizeMoneyText('باقة شهر واحد: 299 جنيه شهرياً، بدلاً من 399 بعد الإطلاق', sa)).toBe('باقة شهر واحد: 99 ريال شهرياً')
    expect(localizeMoneyText('باقة 3 شهور: 749 جنيه، بدلاً من 999 بعد الإطلاق (ما يعادل 250 جنيه شهرياً)', sa)).toBe('باقة 3 شهور: 249 ريال (ما يعادل 83 ريال شهرياً)')
    expect(localizeMoneyText('299 جنيه للشهر، 749 لـ3 شهور، و1,200 لـ6 شهور.', getPricing('KW'))).toBe('8 دينار للشهر، 20 لـ3 شهور، و32 لـ6 شهور.')
    expect(localizeMoneyText('اشتراك ثابت بالجنيه', sa)).toBe('اشتراك ثابت بالريال')
    expect(localizeMoneyText('مبلغ ثابت بالجنيه المصري', getPricing('AE'))).toBe('مبلغ ثابت بالدرهم')
  })

  it('leaves no pound, launch price or Egyptian price in any page', () => {
    const pages = [...ALL_MARKETING_PAGES.filter((p) => !p.country), { intro: '', sections: [], faqs: FAQS }]
    for (const code of ['SA', 'KW', 'LB']) {
      for (const page of pages) {
        for (const text of pageTexts(page)) {
          const out = localizeMoneyText(text, getPricing(code))
          expect(out, `${code}: ${text}`).not.toMatch(/جنيه|بعد الإطلاق|\b299\b/)
        }
      }
    }
  })
})

describe('Gulf country pages', () => {
  it('has one page per Gulf country, at the paths hreflang points to', () => {
    expect(COUNTRY_PAGES.map((p) => p.country).sort()).toEqual(Object.keys(COUNTRY_PAGE_PATHS).sort())
    for (const [code, path] of Object.entries(COUNTRY_PAGE_PATHS)) {
      expect(pageBySlug(path.slice(1))?.country).toBe(code)
    }
    for (const { path } of REGIONAL_ALTERNATES) {
      if (path !== '/') expect(pageBySlug(path.slice(1))).toBeTruthy()
    }
  })

  it('states the local currency and price, never the pound', () => {
    const sa = pageBySlug('solutions/clinics-saudi-arabia')
    const text = pageTexts(sa).join(' ')
    expect(text).toContain('99 ريال')
    expect(text).toContain('+966')
    for (const page of COUNTRY_PAGES) {
      expect(pageTexts(page).join(' ')).not.toMatch(/جنيه/)
    }
  })

  it('says what the system is not connected to on every page', () => {
    for (const page of COUNTRY_PAGES) {
      expect(page.sections.map((s) => s.body).join(' ')).toContain('لا نضمن حالياً تخزين البيانات داخل')
    }
  })

  it('does not reuse a title, heading or intro across countries', () => {
    for (const field of ['title', 'h1', 'intro', 'keyword', 'description']) {
      expect(new Set(COUNTRY_PAGES.map((p) => p[field])).size).toBe(COUNTRY_PAGES.length)
    }
  })

  it('lists the page\'s currency in its structured data', () => {
    const schema = softwareApplicationSchema('AE')
    expect(schema.offers.priceCurrency).toBe('AED')
    expect(schema.offers.lowPrice).toBe(99)
    expect(schema.offers.offers[0].url).toContain('/solutions/clinics-uae')
    expect(softwareApplicationSchema().offers.priceCurrency).toBe('EGP')
    expect(softwareApplicationSchema().offers.lowPrice).toBe(299)
  })
})
