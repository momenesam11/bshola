import { defineConfig } from 'vitest/config'

// Unit tests (src/**/*.test.js) and SQL tests against an in-process Postgres
// (tests/sql). The Playwright suite in tests/e2e runs separately via
// `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'tests/sql/**/*.test.js', 'scripts/**/*.test.mjs'],
    testTimeout: 30000,
    // Booting Postgres takes a while when many test files start at once.
    hookTimeout: 120000,
    // The Supabase client refuses to load without these; no test talks to it.
    env: { VITE_SUPABASE_URL: 'http://localhost:9', VITE_SUPABASE_ANON_KEY: 'test' },
  },
})
