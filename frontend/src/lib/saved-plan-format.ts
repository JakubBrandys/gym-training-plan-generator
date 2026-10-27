import type { ExperienceLevel } from './plan-generation'

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
}

export const formatSavedDate = (createdAt: string): string =>
  new Date(createdAt).toLocaleDateString()
