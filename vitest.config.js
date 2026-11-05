import { defineConfig } from 'vitest/config'

// Unit tests (src/**/*.test.js) and SQL tests against an in-process Postgres
// (tests/sql). The Playwright suite in tests/e2e runs separately via
// `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'tests/sql/**/*.test.js'],
    testTimeout: 30000,
  },
})
