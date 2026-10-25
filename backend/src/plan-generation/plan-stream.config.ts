import type { Provider } from '@nestjs/common';

export const PLAN_STREAM_HEARTBEAT_MS = 12_000;
export const PLAN_STREAM_WINDOW_MS = 240_000;

export const PLAN_STREAM_CONFIG = Symbol('PLAN_STREAM_CONFIG');

export interface PlanStreamConfig {
  heartbeatMs: number;
  windowMs: number;
}

export const planStreamConfigProvider: Provider<PlanStreamConfig> = {
  provide: PLAN_STREAM_CONFIG,
  useValue: {
    heartbeatMs: PLAN_STREAM_HEARTBEAT_MS,
    windowMs: PLAN_STREAM_WINDOW_MS,
  },
};
