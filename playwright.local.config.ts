import { defineConfig, devices } from '@playwright/test'

// Every button, against a throwaway local copy of the backend. Unlike
// playwright.config.ts this needs no credentials and can't reach the live
// database: the app is pointed at tests/local-backend and fixtures.ts aborts any
// request that tries to leave the machine.
const API_PORT = 54399
const WEB_PORT = 5199

export default defineConfig({
  testDir: './tests/qa',
  fullyParallel: false,
  workers: 1, // one shared in-memory database
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/qa-results.json' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile.spec/ },
    // Phones: Safari's engine on an iPhone, Chrome on an Android.
    { name: 'iphone', use: { ...devices['iPhone 13'] }, testMatch: /mobile.spec/ },
    { name: 'android', use: { ...devices['Pixel 7'] }, testMatch: /mobile.spec/ },
  ],
  webServer: [
    {
      command: 'node tests/local-backend/server.mjs',
      url: `http://127.0.0.1:${API_PORT}/__test/emails`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { LOCAL_BACKEND_PORT: String(API_PORT) },
    },
    {
      // A production build, not the dev server: pages load in a fraction of the
      // time and it is what visitors actually run.
      command: `npx vite build --outDir dist-qa --emptyOutDir && npx vite preview --outDir dist-qa --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      // Real environment variables win over .env, so the live project's URL in
      // .env is never used by these tests.
      env: {
        VITE_SUPABASE_URL: `http://127.0.0.1:${API_PORT}`,
        VITE_SUPABASE_ANON_KEY: 'local-anon-key',
      },
    },
  ],
})
