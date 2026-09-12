import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { DEFAULT_OG_IMAGE, SITE_LOCALE, SITE_NAME, absoluteUrl } from '../../lib/seo'

// Head tags that exist statically in index.html *and* are emitted per-route by
// this component. Helmet only manages tags it rendered itself, so without this
// cleanup every route ended up with two canonicals and two descriptions — with
// the static ones pointing at the home page, which told Google that every
// solution/feature page was a duplicate of "/" and must not rank.
//
// The static tags stay in index.html on purpose: scrapers that don't run JS
// (WhatsApp, Facebook link previews) read only the raw HTML.
const DUPLICATED_STATIC_TAGS = [
  'link[rel="canonical"]',
  'meta[name="description"]',
  'meta[property="og:type"]',
  'meta[property="og:url"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:locale"]',
  'meta[property="og:image"]',
  'meta[name="twitter:card"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'meta[name="twitter:image"]',
]

// Snapshotted at module-evaluation time, which happens before React mounts and
// therefore before Helmet has injected anything: whatever matches now came from
// index.html. (We cannot filter by Helmet's marker attribute instead —
// react-helmet-async v3 does not add one, so a `:not([data-rh])` filter would
// delete Helmet's own tags along with the static ones.)
const staticHeadTags =
  typeof document === 'undefined'
    ? []
    : DUPLICATED_STATIC_TAGS.flatMap((selector) => [...document.head.querySelectorAll(selector)])

/** Drops the index.html copies once a route has rendered its own head tags. */
function useStaticHeadTagCleanup() {
  useEffect(() => {
    while (staticHeadTags.length) staticHeadTags.pop().remove()
  }, [])
}

/**
 * One place that emits every head tag a public page needs: title, description,
 * canonical, robots, Open Graph, Twitter card, hreflang and JSON-LD.
 *
 * Private/app routes pass noindex; public routes pass `path` so the canonical
 * always points at the clean URL (no query strings, no trailing duplicates).
 *
 * @param {object[]} schemas - JSON-LD objects; nulls are dropped so callers can
 *   pass a builder result directly without guarding it.
 */
export default function Seo({
  title,
  description,
  path = '/',
  image = DEFAULT_OG_IMAGE,
  noindex = false,
  ogType = 'website',
  schemas = [],
}) {
  useStaticHeadTagCleanup()

  const url = absoluteUrl(path)
  const fullTitle = title?.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`
  const graph = schemas.filter(Boolean)

  return (
    <Helmet prioritizeSeoTags>
      <html lang="ar" dir="rtl" />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {/* A noindex page gets no canonical: pointing one at itself while asking
          to be excluded sends Google two contradictory signals. */}
      {!noindex && <link rel="canonical" href={url} />}
      <meta
        name="robots"
        content={noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1'}
      />
      {!noindex && <link rel="alternate" hrefLang="ar" href={url} />}
      {!noindex && <link rel="alternate" hrefLang="x-default" href={url} />}

      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content={SITE_LOCALE} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {graph.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  )
}
