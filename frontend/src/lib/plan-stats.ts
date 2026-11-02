import type { PlanResult } from './plan-generation'

export type PlanStats = {
  weeks: number
  firstWeekSessions: number
  lastWeekSessions: number
  sessions: number
  differentExercises: number
}

export const planStats = (plan: PlanResult): PlanStats => {
  const weeks = plan.weeks
  const slugs = new Set<string>()
  let sessions = 0

  for (const week of weeks) {
    sessions += week.sessions.length
    for (const session of week.sessions) {
      for (const exercise of session.exercises) {
        slugs.add(exercise.slug)
      }
    }
  }

  return {
    weeks: weeks.length,
    firstWeekSessions: weeks[0]?.sessions.length ?? 0,
    lastWeekSessions: weeks[weeks.length - 1]?.sessions.length ?? 0,
    sessions,
    differentExercises: slugs.size,
  }
}

export const formatCount = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

export const formatRamp = (stats: PlanStats): string =>
  stats.firstWeekSessions === stats.lastWeekSessions
    ? `${formatCount(stats.firstWeekSessions, 'session')} a week`
    : `${stats.firstWeekSessions}→${formatCount(stats.lastWeekSessions, 'session')} a week`
