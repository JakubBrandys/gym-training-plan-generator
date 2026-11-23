import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

if (existsSync('.env')) process.loadEnvFile('.env')

const PORT = Number(process.env.E2E_PORT ?? 4173)
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100)
const MOCK_PORT = Number(process.env.E2E_OPENAI_MOCK_PORT ?? 3199)
const baseURL = `http://localhost:${PORT}`
const apiURL = `http://localhost:${API_PORT}`
const mockURL = `http://localhost:${MOCK_PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/mocks/openai-mock.mjs',
      env: { OPENAI_MOCK_PORT: String(MOCK_PORT) },
      url: mockURL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
      url: baseURL,
      env: { VITE_API_URL: apiURL },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run build && npm run start:prod',
      cwd: '../backend',
      url: apiURL,
      env: {
        PORT: String(API_PORT),
        FRONTEND_URL: baseURL,
        OPENAI_BASE_URL: `${mockURL}/v1`,
        OPENAI_API_KEY: 'e2e-mock-key',
        PLAN_DAILY_LIMIT: '1000',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
})
