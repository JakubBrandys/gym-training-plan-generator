import type { ExperienceLevel } from './plan-generation'

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
}

export const formatSavedDate = (createdAt: string): string =>
  new Date(createdAt).toLocaleDateString()

type SavedPlanLabelSource = {
  title?: string | null
  createdAt: string
}

export const savedPlanLabel = ({ title, createdAt }: SavedPlanLabelSource): string =>
  title ? title : `plan from ${formatSavedDate(createdAt)}`
