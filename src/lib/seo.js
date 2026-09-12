// Single source of truth for SEO constants + JSON-LD builders.
// Every public page pulls its meta/schema from here so titles, canonicals
// and structured data can never drift apart across routes.

export const SITE_URL = 'https://beshola.co'
export const SITE_NAME = 'بسهولة'
export const SITE_LOCALE = 'ar_EG'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`

export const absoluteUrl = (path = '/') =>
  `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`

// Plans mirrored from the pricing section of the landing page. Kept here so
// the Offer schema Google reads and the prices users see share one source.
export const PLANS = [
  { name: 'باقة الشهر الواحد', price: 299, months: 1 },
  { name: 'باقة الـ 3 شهور', price: 650, months: 3 },
  { name: 'باقة الـ 6 شهور', price: 1200, months: 6 },
]

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: 'Beshola',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      'بسهولة نظام حجز مواعيد وإدارة عملاء عربي بالكامل للعيادات والصالونات ومراكز اللياقة والمراكز التعليمية.',
    areaServed: [
      { '@type': 'Country', name: 'Egypt' },
      { '@type': 'Country', name: 'Saudi Arabia' },
    ],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        telephone: '+201021179969',
        availableLanguage: ['ar', 'en'],
      },
    ],
  }
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    inLanguage: 'ar',
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}

// SoftwareApplication is the type Google uses for SaaS rich results —
// it is what surfaces price and rating next to the listing.
export function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Appointment Scheduling Software',
    operatingSystem: 'Web',
    url: SITE_URL,
    inLanguage: 'ar',
    description:
      'نظام حجز مواعيد وإدارة عملاء أونلاين بتذكير واتساب أوتوماتيك، يناسب العيادات والصالونات ومراكز اللياقة والمراكز التعليمية وحجز الملاعب.',
    featureList: [
      'صفحة حجز أونلاين برابط خاص بكل بيزنس',
      'تذكير مواعيد تلقائي بالواتساب',
      'ملف عميل كامل بتاريخ الزيارات',
      'تقارير أداء ودخل يومية وشهرية',
      'إدارة فروع متعددة وموظفين',
      'إدارة اشتراكات وخطط العملاء',
    ],
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'EGP',
      lowPrice: 200,
      highPrice: 299,
      offerCount: PLANS.length,
      offers: PLANS.map((p) => ({
        '@type': 'Offer',
        name: p.name,
        price: p.price,
        priceCurrency: 'EGP',
        url: absoluteUrl('/pricing'),
        availability: 'https://schema.org/InStock',
      })),
    },
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}

export function faqSchema(faqs = []) {
  if (!faqs.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

// items: [{ name, path }] — path omitted on the current (last) crumb.
export function breadcrumbSchema(items = []) {
  if (!items.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.path ? { item: absoluteUrl(item.path) } : {}),
    })),
  }
}

/**
 * VideoObject for an explainer video on the landing page.
 *
 * Only emit this for a video that actually exists and is reachable at
 * `contentUrl` — structured data describing a missing file is invalid and can
 * cost the whole page its rich results.
 */
export function videoObjectSchema({ name, description, thumbnailUrl, contentUrl, uploadDate, duration }) {
  if (!contentUrl) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name,
    description,
    thumbnailUrl: absoluteUrl(thumbnailUrl),
    contentUrl: absoluteUrl(contentUrl),
    ...(uploadDate ? { uploadDate } : {}),
    ...(duration ? { duration } : {}),
    inLanguage: 'ar',
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}
