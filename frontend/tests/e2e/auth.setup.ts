import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('sign in once and save the session', async ({ page }) => {
  const username = process.env.E2E_USERNAME
  const password = process.env.E2E_PASSWORD
  if (!username || !password) {
    throw new Error('Set E2E_USERNAME and E2E_PASSWORD in frontend/.env (see context/foundation/test-stack.md, ## E2E)')
  }

  await page.goto('/sign-in')
  await expect(async () => {
    await page.getByLabel('Email').fill('')
    await page.getByLabel('Email').fill(username)
    await page.getByLabel('Password', { exact: true }).fill('')
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 5_000 })
  }).toPass()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  await page.context().storageState({ path: authFile })
})
