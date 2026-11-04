import { Link } from 'react-router'
import type { SavedPlanSummary } from '../lib/saved-plans'
import { savedPlanLabel } from '../lib/saved-plan-format'
import { DeletePlanControl, type DeletePhase } from './DeletePlanControl'
import { SavedPlanDetails } from './SavedPlanDetails'

type SavedPlanListItemProps = {
  plan: SavedPlanSummary
  deletePhase: DeletePhase
  deleteDisabled: boolean
  onDeleteStart: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}

export const SavedPlanListItem = ({
  plan,
  deletePhase,
  deleteDisabled,
  onDeleteStart,
  onDeleteConfirm,
  onDeleteCancel,
}: SavedPlanListItemProps) => (
  <li>
    <Link to={`/plans/${encodeURIComponent(plan.id)}`}>
      <SavedPlanDetails createdAt={plan.createdAt} form={plan.form} title={plan.title} />
    </Link>
    <div className="saved-plans-actions">
      <DeletePlanControl
        label={savedPlanLabel(plan)}
        phase={deletePhase}
        disabled={deleteDisabled}
        onStart={onDeleteStart}
        onConfirm={onDeleteConfirm}
        onCancel={onDeleteCancel}
      />
    </div>
  </li>
)
