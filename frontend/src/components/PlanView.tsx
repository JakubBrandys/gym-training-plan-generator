import { useState } from 'react'
import type { PlanResult, PlanResultExercise } from '../lib/plan-generation'

const EXERCISE_IMAGE_SIZE = 112

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

export const PlanView = ({ plan }: { plan: PlanResult }) => (
  <div className="plan-view">
    {plan.weeks.map((week) => (
      <section key={week.week}>
        <h2>Week {week.week}</h2>
        <p className="hint">{week.goal}</p>
        <ul className="plan-sessions">
          {week.sessions.map((session, sessionIndex) => (
            <li key={`${week.week}-${sessionIndex}`}>
              <h3>{session.title}</h3>
              <ul className="plan-exercises">
                {session.exercises.map((exercise) => (
                  <li key={exercise.slug}>
                    <ExerciseImage exercise={exercise} />
                    <div className="plan-exercise-text">
                      <strong>{exercise.name}</strong>
                      <span>
                        {' '}
                        {exercise.sets} × {exercise.reps}, rest {exercise.restSeconds} s
                      </span>
                      {exercise.note && <p className="hint">{exercise.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
)
