import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from './tests/e2e/helpers/env'

loadEnv()

const PORT = process.env.E2E_PORT || 5173
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // shared Supabase project — avoid cross-test data races
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port ' + PORT,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
