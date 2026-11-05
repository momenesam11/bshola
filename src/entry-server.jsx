/* eslint-disable react-refresh/only-export-components -- build entry, never hot-reloaded */
// Renders a public page to HTML at build time (scripts/prerender.mjs), so Google
// and link previews get the real text without having to run any JavaScript.
// Mirrors main.jsx + App.jsx: same tree, with a router that takes the path.

import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './App.jsx'

export { ALL_MARKETING_PAGES } from './content/marketingPages'
export { LEGAL_PAGES } from './content/legalPages'
export { HOME_META, PRODUCT_META, FAQ_META, CALCULATOR_META, GUIDES_META } from './content/pageMeta'
export { SITE_NAME, absoluteUrl } from './lib/seo'

export function render(path) {
  const helmetContext = {}
  const html = renderToString(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <HelmetProvider context={helmetContext}>
          <StaticRouter location={path}>
            <AppRoutes />
          </StaticRouter>
        </HelmetProvider>
      </QueryClientProvider>
    </StrictMode>
  )
  return { html, helmet: helmetContext.helmet }
}
