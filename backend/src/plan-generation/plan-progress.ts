import type { PlanJobErrorCode, PlanJobStage } from './plan-job.store.js';
import { WEEK_COUNT } from './plan.validator.js';

export type PlanProgressInput =
  | { type: 'stage'; stage: PlanJobStage }
  | { type: 'week'; stage: PlanJobStage; week: number }
  | { type: 'validating'; stage: PlanJobStage }
  | { type: 'retrying'; stage: PlanJobStage; attempt: number }
  | { type: 'completed' }
  | { type: 'failed'; code: PlanJobErrorCode };

export type PlanProgressType = PlanProgressInput['type'];

export type TerminalPlanProgressType = 'completed' | 'failed';

export type PlanProgressDraft = Exclude<
  PlanProgressInput,
  { type: TerminalPlanProgressType }
>;

export type PlanProgressEvent = PlanProgressInput & {
  id: number;
  at: string;
};

export type PlanProgressListener = (event: PlanProgressEvent) => void;

export const isTerminalProgressEvent = (
  event: Pick<PlanProgressEvent, 'type'>,
): boolean => event.type === 'completed' || event.type === 'failed';

export const isValidWeekNumber = (week: number): boolean =>
  Number.isInteger(week) && week >= 1 && week <= WEEK_COUNT;
