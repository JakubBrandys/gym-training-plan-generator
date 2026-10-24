import type { PlanResult } from '../lib/plan-generation'

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
                    <strong>{exercise.name}</strong>
                    <span>
                      {' '}
                      {exercise.sets} × {exercise.reps}, rest {exercise.restSeconds} s
                    </span>
                    {exercise.note && <p className="hint">{exercise.note}</p>}
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
