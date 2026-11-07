import { defineConfig } from 'vitest/config'

// Unit tests (src/**/*.test.js) and SQL tests against an in-process Postgres
// (tests/sql). The Playwright suite in tests/e2e runs separately via
// `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'tests/sql/**/*.test.js', 'scripts/**/*.test.mjs'],
    testTimeout: 30000,
    // Each SQL test starts its own in-process Postgres in a beforeEach, and with
    // many running at once that can pass the default 10 seconds.
    hookTimeout: 30000,
  },
})
