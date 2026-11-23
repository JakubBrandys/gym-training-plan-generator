import { test, expect } from '@playwright/test'

test('risk #1: a generation job that no longer exists ends in a start-again state, not endless progress', async ({ page }) => {
  const missingJobId = crypto.randomUUID()

  await page.goto(`/plans/generate/${missingJobId}`)

  await expect(page.getByRole('heading', { name: 'Your training plan', level: 1 })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveText('This plan could not be found or has expired.')
  await expect(page.getByRole('progressbar', { name: 'Plan progress' })).toBeHidden()

  await page.getByRole('link', { name: 'Start again' }).click()

  await expect(page).toHaveURL(/\/plans\/new$/)
})
