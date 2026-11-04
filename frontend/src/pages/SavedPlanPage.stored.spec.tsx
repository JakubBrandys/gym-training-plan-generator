import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { buildSamplePlan } from '../dev/sample-plan'
import { apiFetch } from '../lib/api'
import { SavedPlanPage } from './SavedPlanPage'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))

const apiFetchMock = vi.mocked(apiFetch)
const useAuthMock = vi.mocked(useAuth)
const signOut = vi.fn()

const storedForm = {
  experience: 'intermediate',
  currentFrequency: 3,
  desiredFrequency: 5,
  heightCm: 175,
  weightKg: 70,
  goals: 'Run a faster 5k',
}

const storedBody = (overrides: Record<string, unknown> = {}) => ({
  id: 'plan-1',
  createdAt: '2026-10-27T10:00:00.000Z',
  form: storedForm,
  title: null,
  plan: JSON.parse(JSON.stringify(buildSamplePlan())),
  ...overrides,
})

const serveStored = (body: unknown) =>
  apiFetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  )

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/plans/plan-1']}>
      <Routes>
        <Route path="/plans/:id" element={<SavedPlanPage />} />
      </Routes>
    </MemoryRouter>,
  )

const week1 = () => screen.findByRole('heading', { level: 2, name: 'Week 1' })

const firstExercise = buildSamplePlan().weeks[0].sessions[0].exercises[0]
const imageAlt = `${firstExercise.name}, start and end position`

describe('SavedPlanPage with a stored body through the real fetch', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    signOut.mockReset()
    useAuthMock.mockReturnValue({
      session: null,
      loading: false,
      signOutReason: null,
      signOut,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the first week with the exercise name and its stored image', async () => {
    serveStored(storedBody())
    renderPage()

    await week1()
    expect(screen.getByText(firstExercise.name)).toBeTruthy()
    const image = screen.getByAltText(imageAlt)
    expect(firstExercise.imageKey).toBeTruthy()
    expect(image.getAttribute('src')).toBe(`/${firstExercise.imageKey}`)
  })

  it('shows the same heading and image when the plan is opened again in a later session', async () => {
    serveStored(storedBody())
    const first = renderPage()
    await week1()
    first.unmount()

    renderPage()

    await week1()
    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByAltText(imageAlt).getAttribute('src')).toBe(`/${firstExercise.imageKey}`)
  })

  it('renders exercises stored without imageKey and note, with no image and no alert', async () => {
    serveStored(
      storedBody({
        plan: {
          weeks: [
            {
              week: 1,
              goal: 'Build a base',
              sessions: [
                {
                  title: 'Full body',
                  exercises: [
                    { slug: 'goblet-squat', name: 'Goblet squat', sets: 3, reps: '8-10', restSeconds: 90 },
                    { slug: 'push-up', name: 'Push-up', sets: 3, reps: '10', restSeconds: 60 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    )
    renderPage()

    await week1()
    expect(screen.getByText('Goblet squat')).toBeTruthy()
    expect(screen.getByText('Push-up')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each<[string, Record<string, unknown>]>([
    [
      'a week without sessions',
      { plan: { weeks: [{ week: 1, goal: 'Build a base' }] } },
    ],
    [
      'a session without exercises',
      {
        plan: {
          weeks: [{ week: 1, goal: 'Build a base', sessions: [{ title: 'Full body' }] }],
        },
      },
    ],
    ['a null form', { form: null }],
    ['a plan without weeks', { plan: {} }],
  ])('ends in the generic error without crashing for %s', async (_name, overrides) => {
    serveStored(storedBody(overrides))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Something went wrong, try again')
    expect(screen.queryByRole('heading', { level: 2, name: 'Week 1' })).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
