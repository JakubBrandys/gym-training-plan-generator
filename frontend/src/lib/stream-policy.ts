export const SILENCE_TIMEOUT_MS = 30_000
export const BASE_BACKOFF_MS = 1000
export const MAX_STREAM_FAILURES = 3
export const MIN_STABLE_CONNECTION_MS = 1000

export const nextBackoffMs = (consecutiveFailures: number): number =>
  BASE_BACKOFF_MS * 2 ** Math.max(0, consecutiveFailures - 1)

export const shouldFallBackToPolling = (consecutiveFailures: number): boolean =>
  consecutiveFailures >= MAX_STREAM_FAILURES

export const isNewEvent = (lastEventId: number, eventId: number): boolean => eventId > lastEventId

export const nextFailureCount = (
  previousFailures: number,
  receivedEvent: boolean,
): number => (receivedEvent ? 1 : previousFailures + 1)

export const isStableConnection = (connectionMs: number): boolean =>
  connectionMs >= MIN_STABLE_CONNECTION_MS
