import type { ReactNode } from 'react'
import type { PlanResult } from '../lib/plan-generation'
import { formatCount, formatRamp, planStats } from '../lib/plan-stats'
import { Card } from './Card'

type PlanSummaryProps = {
  plan: PlanResult
  children?: ReactNode
}

export const PlanSummary = ({ plan, children }: PlanSummaryProps) => {
  const stats = planStats(plan)

  return (
    <Card className="plan-summary" role="group" aria-label="Plan summary">
      <p className="plan-summary-stats">{`${formatCount(stats.weeks, 'week')} · ${formatRamp(stats)}`}</p>
      <p className="plan-summary-stats">
        {`${formatCount(stats.sessions, 'session')} · ${formatCount(stats.differentExercises, 'different exercise')}`}
      </p>
      {children}
    </Card>
  )
}
