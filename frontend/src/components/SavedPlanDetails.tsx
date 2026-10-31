import type { PlanForm } from '../lib/plan-generation'
import { EXPERIENCE_LABELS, formatSavedDate } from '../lib/saved-plan-format'

type SavedPlanDetailsProps = {
  createdAt: string
  form: PlanForm
}

export const SavedPlanDetails = ({ createdAt, form }: SavedPlanDetailsProps) => (
  <span className="saved-plans-details">
    <span className="saved-plans-date">{formatSavedDate(createdAt)}</span>
    <span>{`Experience: ${EXPERIENCE_LABELS[form.experience]}`}</span>
    <span>{`Days per week: ${form.currentFrequency} → ${form.desiredFrequency}`}</span>
    <span className="saved-plans-goals">{form.goals}</span>
  </span>
)
