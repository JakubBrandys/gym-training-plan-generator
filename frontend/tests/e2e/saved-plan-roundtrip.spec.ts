import { test, expect, type Page } from '@playwright/test'

const SESSIONS_PER_WEEK = 3
const CHECKED_WEEKS = [1, 8]
const AUTH_FILE = 'playwright/.auth/user.json'

type WeekSnapshot = {
  goal: string
  sessionTitles: string[]
  exerciseNames: string[]
  notes: string[]
  imageCount: number
}

const readWeek = async (page: Page, week: number): Promise<WeekSnapshot> => {
  await page.getByRole('link', { name: `W${week}, week ${week}` }).click()
  await expect(page.getByRole('heading', { name: `Week ${week}`, level: 2 })).toBeVisible()
  const main = page.getByRole('main')
  return {
    goal: (await main.getByText(`Week ${week} goal`).textContent()) ?? '',
    sessionTitles: await main.getByRole('heading', { level: 3 }).allTextContents(),
    exerciseNames: await main.getByRole('strong').allTextContents(),
    notes: await main.getByText(/^Note \d /).allTextContents(),
    imageCount: await main.getByRole('img').count(),
  }
}

const readWeeks = async (page: Page): Promise<Record<number, WeekSnapshot>> => {
  const weeks: Record<number, WeekSnapshot> = {}
  for (const week of CHECKED_WEEKS) {
    weeks[week] = await readWeek(page, week)
  }
  return weeks
}

const expectIntactPlan = async (page: Page, token: string, expected: Record<number, WeekSnapshot>) => {
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Saved plan', level: 1 })).toBeVisible()
  await expect(main.getByText('8 weeks · 3 sessions a week')).toBeVisible()
  await expect(main.getByText('24 sessions')).toBeVisible()
  await expect(main.getByText('Days per week: 3 → 3')).toBeVisible()
  await expect(main.getByText(`Build strength ${token}`)).toBeVisible()
  const actual = await readWeeks(page)
  for (const week of CHECKED_WEEKS) {
    expect(actual[week].goal).toBe(`Week ${week} goal ${token}`)
    expect(actual[week].sessionTitles).toHaveLength(SESSIONS_PER_WEEK)
    expect(actual[week].notes.length).toBeGreaterThan(0)
    expect(actual[week]).toEqual(expected[week])
  }
  await expect(main.getByText(/\b(null|undefined)\b/)).toHaveCount(0)
}

const deletePlan = async (page: Page, planPath: string, token: string) => {
  await page.goto(planPath)
  await page.getByRole('button', { name: /^Delete plan from/ }).click()
  await page.getByRole('button', { name: /^Confirm deleting plan/ }).click()
  await expect(page).toHaveURL(/\/plans$/)
  await expect(page.getByRole('heading', { name: 'My plans', level: 1 })).toBeVisible()
  await expect(page.getByText('Loading…')).toBeHidden()
  await expect(page.getByText(`Build strength ${token}`)).toBeHidden()
}

test('risk #3: a plan saved after generation reloads intact, now and in a later session', async ({ page, browser, baseURL }) => {
  const token = `E2E-${Date.now()}`
  test.info().annotations.push({ type: 'test-data', description: token })
  let savedPath: string | undefined

  try {
    await page.goto('/plans/new')
    await page.getByLabel('Current days per week').fill('3')
    await page.getByLabel('Desired days per week').fill('3')
    await page.getByLabel('Height (cm)').fill('180')
    await page.getByLabel('Weight (kg)').fill('80')
    await page.getByLabel('Goals', { exact: true }).fill(`Build strength ${token}`)
    await page.getByRole('button', { name: 'Generate plan' }).click()

    await expect(page.getByRole('button', { name: 'Save plan' })).toBeVisible({ timeout: 30_000 })
    const generated = await readWeeks(page)

    await page.getByRole('button', { name: 'Save plan' }).click()
    await page.waitForURL(/\/plans\/[0-9a-f-]{36}$/)
    savedPath = new URL(page.url()).pathname

    await expectIntactPlan(page, token, generated)

    await page.reload()
    await expectIntactPlan(page, token, generated)

    const laterContext = await browser.newContext({ baseURL, storageState: AUTH_FILE })
    try {
      const laterPage = await laterContext.newPage()
      await laterPage.goto(savedPath)
      await expectIntactPlan(laterPage, token, generated)
    } finally {
      await laterContext.close()
    }
  } finally {
    if (savedPath) {
      await deletePlan(page, savedPath, token)
    }
  }
})
