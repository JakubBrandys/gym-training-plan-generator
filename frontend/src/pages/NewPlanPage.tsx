import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { handleAuthFailure } from '../lib/auth-failure'
import {
  startPlanGeneration,
  type ExperienceLevel,
  type LimitReason,
} from '../lib/plan-generation'

const GENERIC_PLAN_ERROR = 'Something went wrong, try again'
const MISSING_GOALS_ERROR = 'Describe your goals to continue'

const LIMIT_MESSAGES: Record<LimitReason, string> = {
  active_job: 'You already have a plan being generated. Wait for it to finish.',
  daily_limit: "You have reached today's plan limit. Try again tomorrow.",
}

export const NewPlanPage = () => {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [experience, setExperience] = useState<ExperienceLevel>('beginner')
  const [currentFrequency, setCurrentFrequency] = useState('')
  const [desiredFrequency, setDesiredFrequency] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [goals, setGoals] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedGoals = goals.trim()
    if (!trimmedGoals) {
      setError(MISSING_GOALS_ERROR)
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await startPlanGeneration({
        experience,
        currentFrequency: Number(currentFrequency),
        desiredFrequency: Number(desiredFrequency),
        heightCm: Number(heightCm),
        weightKg: Number(weightKg),
        goals: trimmedGoals,
      })

      if (result.kind === 'unauthorized' || result.kind === 'blocked') {
        await handleAuthFailure(result.status, signOut)
        return
      }

      if (result.kind === 'limit') {
        setError(LIMIT_MESSAGES[result.reason])
        return
      }

      if (result.kind === 'error') {
        setError(GENERIC_PLAN_ERROR)
        return
      }

      navigate(`/plans/generate/${encodeURIComponent(result.jobId)}`)
    } catch {
      setError(GENERIC_PLAN_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="plan-form">
      <h1>New training plan</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="plan-experience">Experience level</label>
        <select
          id="plan-experience"
          required
          value={experience}
          onChange={(event) => setExperience(event.target.value as ExperienceLevel)}
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="expert">Expert</option>
        </select>
        <fieldset>
          <legend>Weekly training frequency</legend>
          <label htmlFor="plan-current-frequency">Current days per week</label>
          <input
            id="plan-current-frequency"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={7}
            step={1}
            value={currentFrequency}
            onChange={(event) => setCurrentFrequency(event.target.value)}
          />
          <label htmlFor="plan-desired-frequency">Desired days per week</label>
          <input
            id="plan-desired-frequency"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={7}
            step={1}
            aria-describedby="plan-frequency-hint"
            value={desiredFrequency}
            onChange={(event) => setDesiredFrequency(event.target.value)}
          />
          <p id="plan-frequency-hint" className="hint">
            Between 1 and 7 days.
          </p>
        </fieldset>
        <label htmlFor="plan-height">Height (cm)</label>
        <input
          id="plan-height"
          type="number"
          inputMode="numeric"
          required
          min={100}
          max={250}
          step={1}
          value={heightCm}
          onChange={(event) => setHeightCm(event.target.value)}
        />
        <label htmlFor="plan-weight">Weight (kg)</label>
        <input
          id="plan-weight"
          type="number"
          inputMode="decimal"
          required
          min={30}
          max={300}
          step="any"
          value={weightKg}
          onChange={(event) => setWeightKg(event.target.value)}
        />
        <label htmlFor="plan-goals">Goals</label>
        <textarea
          id="plan-goals"
          required
          maxLength={500}
          rows={4}
          aria-describedby="plan-goals-hint"
          value={goals}
          onChange={(event) => setGoals(event.target.value)}
        />
        <p id="plan-goals-hint" className="hint">
          Up to 500 characters.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? 'Starting…' : 'Generate plan'}
        </button>
      </form>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  )
}
