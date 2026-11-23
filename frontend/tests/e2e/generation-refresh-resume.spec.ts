import { test, expect } from '@playwright/test'

const MOCK_URL = `http://localhost:${process.env.E2E_OPENAI_MOCK_PORT ?? 3199}`
const JOB_PATH = /\/plans\/generate\/[0-9a-f-]{36}$/

test('risk #1: a refresh during live generation resumes the same job instead of losing it', async ({ page, request }) => {
  const token = `E2E-hold${Date.now()}`
  test.info().annotations.push({ type: 'test-data', description: token })
  let released = false

  const releaseModel = async () => {
    const response = await request.post(`${MOCK_URL}/e2e/release/${token}`)
    expect(response).toBeOK()
    released = true
  }

  try {
    await page.goto('/plans/new')
    await page.getByLabel('Current days per week').fill('3')
    await page.getByLabel('Desired days per week').fill('3')
    await page.getByLabel('Height (cm)').fill('180')
    await page.getByLabel('Weight (kg)').fill('80')
    await page.getByLabel('Goals', { exact: true }).fill(`Build strength ${token}`)
    await page.getByRole('button', { name: 'Generate plan' }).click()

    await page.waitForURL(JOB_PATH)
    const jobPath = new URL(page.url()).pathname
    await expect(page.getByRole('status')).toContainText('Drafting your plan')
    await expect(page.getByRole('progressbar', { name: 'Plan progress' })).toBeVisible()

    await page.reload()

    await expect(page).toHaveURL(new RegExp(`${jobPath}$`))
    await expect(page.getByRole('status')).toContainText('Drafting your plan')
    await expect(page.getByRole('progressbar', { name: 'Plan progress' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)

    await releaseModel()

    await expect(page.getByRole('button', { name: 'Save plan' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('main').getByText(`Week 1 goal ${token}`)).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Plan progress' })).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`${jobPath}$`))
  } finally {
    if (!released) {
      await releaseModel()
    }
  }
})
