import type { PlanForm } from '../src/plan-generation/plan-form.schema.js';
import type { PlanJobStage } from '../src/plan-generation/plan-job.store.js';
import type { PlanResult } from '../src/plan-generation/plan.schema.js';

export type EvalTier = 'smoke' | 'full';

export interface EvalJobSpec {
  inputId: string;
  repeat: number;
  form: PlanForm;
}

export interface RecordedCall {
  stage: PlanJobStage | null;
  attempt: number;
  ok: boolean;
  issueCount: number;
  errorCode: string | null;
  finishReason: string | null;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  output: unknown;
}

export interface RecordedJob extends EvalJobSpec {
  status: 'running' | 'completed' | 'failed';
  errorCode: string | null;
  plan: PlanResult | null;
  calls: RecordedCall[];
}

export interface RunMeta {
  tier: EvalTier;
  startedAt: string;
  draftModel: string;
  reviewModel: string;
  gitCommit: string | null;
  promptHash: string;
  concurrency: number;
}

export interface GeneratedRun {
  meta: RunMeta;
  jobs: RecordedJob[];
}

export interface CriterionScore {
  score: number;
  reason: string;
}

export interface JudgeScores {
  goalsFit: CriterionScore;
  experienceFit: CriterionScore;
}

export interface JudgedJob {
  inputId: string;
  repeat: number;
  matched: JudgeScores | null;
  mismatched: JudgeScores | null;
  errors: string[];
}
