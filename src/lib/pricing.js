// What Beshola itself charges, per visitor country. Change a price here and the
// pricing cards, the Offer data for that country's page and the renewal message
// all follow. These are not the prices a clinic charges its own patients: that
// currency lives on the account (businesses.currency).

import { currencyFor, isArabCountry } from './countries.js'

export const PLANS = [
  // price: today's launch price. regularPrice: what new subscribers will pay once
  // the launch ends. It's a real plan, so raise to these when it does.
  { name: 'باقة الشهر الواحد', price: 299, regularPrice: 399, months: 1 },
  { name: 'باقة الـ 3 شهور', price: 749, regularPrice: 999, months: 3 },
  { name: 'باقة الـ 6 شهور', price: 1200, regularPrice: 1599, months: 6 },
]

// [1 month, 3 months, 6 months]. The launch discount is Egypt's, so these have
// no regularPrice and the page shows no crossed-out price next to them.
const REGIONAL_PRICES = {
  SA: { currency: 'SAR', prices: [99, 249, 399] },
  AE: { currency: 'AED', prices: [99, 249, 399] },
  QA: { currency: 'QAR', prices: [99, 249, 399] },
  KW: { currency: 'KWD', prices: [8, 20, 32] },
  BH: { currency: 'BHD', prices: [10, 25, 40] },
  OM: { currency: 'OMR', prices: [10, 25, 40] },
  JO: { currency: 'JOD', prices: [10, 25, 40] },
  MA: { currency: 'MAD', prices: [149, 375, 599] },
  TN: { currency: 'TND', prices: [39, 99, 159] },
}

// Arab countries whose currencies move too fast or have more than one rate.
const OTHER_ARAB_PRICES = { currency: 'USD', prices: [19, 48, 76] }

const EGYPT = { countryCode: 'EG', isEgypt: true, currency: 'EGP', label: currencyFor('EGP').label, plans: PLANS }

/** Egypt, and any country outside the Arab world, sees the Egyptian price list. */
export function getPricing(countryCode) {
  if (!isArabCountry(countryCode) || countryCode === 'EG') return EGYPT
  const { currency, prices } = REGIONAL_PRICES[countryCode] ?? OTHER_ARAB_PRICES
  return {
    countryCode,
    isEgypt: false,
    currency,
    label: currencyFor(currency).label,
    plans: PLANS.map((plan, i) => ({ name: plan.name, months: plan.months, price: prices[i] })),
  }
}

export const formatPrice = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 })

/** Small amounts keep one decimal: 20 dinars over 3 months reads 6.7, not 7. */
export const pricePerMonth = (plan) => {
  const perMonth = plan.price / plan.months
  return perMonth >= 20 ? Math.round(perMonth) : Math.round(perMonth * 10) / 10
}

/**
 * Marketing copy is written once in Egyptian pounds, and the prerendered pages
 * Google reads keep it. This rewrites that copy for a visitor from elsewhere.
 * A test runs every content file through it and fails if "جنيه" survives.
 */
export function localizeMoneyText(text, pricing) {
  if (pricing.isEgypt || typeof text !== 'string') return text
  const [one, three, six] = pricing.plans
  const known = {
    299: one.price,
    749: three.price,
    '1,200': six.price,
    250: pricePerMonth(three),
    200: pricePerMonth(six),
  }
  const { label, inWord } = currencyFor(pricing.currency)
  return text
    .replace(/،? ?بدلاً من [\d,]+ بعد الإطلاق/g, '')
    .replace(/[\d,]*\d(?= جنيه)/g, (n) => (n in known ? formatPrice(known[n]) : n))
    .replace(/749(?= لـ)/g, formatPrice(three.price))
    .replace(/1,200(?= لـ)/g, formatPrice(six.price))
    .replace(/بالجنيه المصري|بالجنيه/g, inWord)
    .replace(/لجنيهات/g, 'لمبلغ')
    .replace(/جنيه/g, label)
}
