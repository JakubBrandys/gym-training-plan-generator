import { test, expect } from '@playwright/test'

test('risk #2: an unusable model result ends in a failure message, never in a plan the user can save', async ({ page }) => {
  const token = `E2E-short${Date.now()}`
  test.info().annotations.push({ type: 'test-data', description: token })

  await page.goto('/plans/new')
  await page.getByLabel('Current days per week').fill('3')
  await page.getByLabel('Desired days per week').fill('3')
  await page.getByLabel('Height (cm)').fill('180')
  await page.getByLabel('Weight (kg)').fill('80')
  await page.getByLabel('Goals', { exact: true }).fill(`Build strength ${token}`)
  await page.getByRole('button', { name: 'Generate plan' }).click()

  await expect(page.getByRole('alert')).toHaveText('We could not build a valid plan this time. Try again.', { timeout: 30_000 })
  await expect(page.getByRole('progressbar', { name: 'Plan progress' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Save plan' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^Week \d/, level: 2 })).toHaveCount(0)
  await expect(page.getByText(`Week 1 goal ${token}`)).toHaveCount(0)

  await page.getByRole('link', { name: 'Start again' }).click()

  await expect(page).toHaveURL(/\/plans\/new$/)
})
