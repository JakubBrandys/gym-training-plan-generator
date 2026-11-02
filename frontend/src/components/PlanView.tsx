import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import type { PlanResult, PlanResultExercise, PlanResultWeek } from '../lib/plan-generation'
import { formatCount } from '../lib/plan-stats'
import { weekFromHash } from '../lib/week-hash'
import { Card } from './Card'
import { Chip } from './Chip'
import { PlanSummary } from './PlanSummary'
import { WeekPager } from './WeekPager'
import { WeekSwitcher } from './WeekSwitcher'

const EXERCISE_IMAGE_SIZE = 64

const ExerciseImage = ({ exercise }: { exercise: PlanResultExercise }) => {
  const [failed, setFailed] = useState(false)

  if (!exercise.imageKey || failed) return null

  return (
    <img
      className="plan-exercise-image"
      src={`/${exercise.imageKey}`}
      alt={`${exercise.name}, start and end position`}
      width={EXERCISE_IMAGE_SIZE}
      height={EXERCISE_IMAGE_SIZE}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

const ExerciseRow = ({ exercise }: { exercise: PlanResultExercise }) => (
  <li className="plan-exercise">
    <ExerciseImage exercise={exercise} />
    <div className="plan-exercise-text">
      <strong>{exercise.name}</strong>
      <div className="plan-exercise-meta">
        <Chip>
          {exercise.sets} × {exercise.reps}
        </Chip>
        <Chip>rest {exercise.restSeconds} s</Chip>
      </div>
      {exercise.note && <p className="hint">{exercise.note}</p>}
    </div>
  </li>
)

const WeekSection = ({ week }: { week: PlanResultWeek }) => {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownWeek = useRef(week.week)

  useEffect(() => {
    if (shownWeek.current === week.week) return

    shownWeek.current = week.week
    headingRef.current?.focus()
  }, [week.week])

  return (
    <section id={`week-${week.week}`}>
      <h2 ref={headingRef} tabIndex={-1}>
        Week {week.week}
      </h2>
      <p className="hint">{week.goal}</p>
      <ul className="plan-sessions">
        {week.sessions.map((session, sessionIndex) => (
          <li key={`${week.week}-${sessionIndex}`}>
            <Card>
              <div className="plan-session-header">
                <h3>
                  Session {sessionIndex + 1} · {session.title}
                </h3>
                <span className="hint">{formatCount(session.exercises.length, 'exercise')}</span>
              </div>
              <ul className="plan-exercises">
                {session.exercises.map((exercise) => (
                  <ExerciseRow key={exercise.slug} exercise={exercise} />
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

type PlanViewContentProps = {
  plan: PlanResult
  week: number
  details?: ReactNode
}

export const PlanViewContent = ({ plan, week, details }: PlanViewContentProps) => {
  const selected = plan.weeks.find((candidate) => candidate.week === week) ?? plan.weeks[0]

  return (
    <div className="plan-view">
      <PlanSummary plan={plan}>{details}</PlanSummary>
      <WeekSwitcher weekCount={plan.weeks.length} current={week} />
      {selected && <WeekSection week={selected} />}
      <WeekPager weekCount={plan.weeks.length} current={week} />
    </div>
  )
}

type PlanViewProps = {
  plan: PlanResult
  details?: ReactNode
}

export const PlanView = ({ plan, details }: PlanViewProps) => {
  const { hash } = useLocation()

  return <PlanViewContent plan={plan} week={weekFromHash(hash, plan.weeks.length)} details={details} />
}
