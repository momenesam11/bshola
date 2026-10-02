// Single source of truth for SEO constants + JSON-LD builders.
// Every public page pulls its meta/schema from here so titles, canonicals
// and structured data can never drift apart across routes.

// The live site serves from www — the apex 308-redirects there — so every
// canonical, og:url and sitemap entry must use www or Google is told the real
// page is a URL that redirects away.
export const SITE_URL = 'https://www.beshola.co'
export const SITE_NAME = 'بسهولة'
export const SITE_LOCALE = 'ar_EG'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`

// Passes an already-absolute URL (e.g. a YouTube thumbnail) straight through
// instead of prefixing SITE_URL onto it, which would otherwise turn
// `https://img.youtube.com/...` into a broken `https://beshola.co/https://...`.
export const absoluteUrl = (path = '/') =>
  /^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`

// Plans mirrored from the pricing section of the landing page. Kept here so
// the Offer schema Google reads and the prices users see share one source.
export const PLANS = [
  { name: 'باقة الشهر الواحد', price: 299, months: 1 },
  { name: 'باقة الـ 3 شهور', price: 749, months: 3 },
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
      'نظام حجز مواعيد وإدارة عملاء أونلاين بتذكير واتساب من رقمك بضغطة زر، يناسب العيادات والصالونات ومراكز اللياقة والمراكز التعليمية وحجز الملاعب.',
    // Same rules as the visible page (MARKETING_CLAIMS.md §8): no "automatic"
    // reminders and no staff management — Google shows this text too.
    featureList: [
      'صفحة حجز أونلاين برابط خاص بكل بيزنس',
      'تذكير مواعيد بالواتساب من رقمك بضغطة زر',
      'قائمة انتظار',
      'ملف عميل كامل بتاريخ الزيارات',
      'تقارير الحضور والغياب وتصدير CSV',
      'إدارة فروع متعددة',
      'خطة زيارات وكشف حساب لكل عميل',
    ],
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'EGP',
      // Derived so the range always brackets the Offer prices listed below.
      lowPrice: Math.min(...PLANS.map((p) => p.price)),
      highPrice: Math.max(...PLANS.map((p) => p.price)),
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
 * Pass either `youtubeId` (preferred — see src/content/landingVideos.js) or a
 * self-hosted `contentUrl`. Only emit this for a video that actually exists —
 * structured data describing a missing video is invalid and can cost the
 * whole page its rich results.
 */
export function videoObjectSchema({
  name,
  description,
  youtubeId,
  thumbnailUrl,
  contentUrl,
  uploadDate,
  duration,
}) {
  if (!youtubeId && !contentUrl) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name,
    description,
    thumbnailUrl: absoluteUrl(thumbnailUrl ?? `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`),
    ...(youtubeId
      ? {
          embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
          // A resolvable page URL for the video, which VideoObject also
          // accepts in place of a direct file — we don't have one for a
          // self-hosted contentUrl, so that branch omits it.
          contentUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
        }
      : { contentUrl: absoluteUrl(contentUrl) }),
    ...(uploadDate ? { uploadDate } : {}),
    ...(duration ? { duration } : {}),
    inLanguage: 'ar',
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}
