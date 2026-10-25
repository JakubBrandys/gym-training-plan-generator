import { apiFetch } from './api'
import type { AuthFailureResult } from './plan-generation'
import { isTerminalEvent, parseProgressEvent, type PlanProgressEvent } from './plan-progress'
import { createSseParser } from './sse'
import { SILENCE_TIMEOUT_MS, isNewEvent } from './stream-policy'

export type StreamOutcome =
  | { kind: 'terminal'; event: PlanProgressEvent }
  | { kind: 'closed' }
  | { kind: 'failed' }
  | { kind: 'not-found' }
  | AuthFailureResult

type StreamRequest = {
  jobId: string
  lastEventId: number
  signal: AbortSignal
  onEvent: (event: PlanProgressEvent) => void
  silenceMs?: number
}

export const streamPlanEvents = async ({
  jobId,
  lastEventId,
  signal,
  onEvent,
  silenceMs = SILENCE_TIMEOUT_MS,
}: StreamRequest): Promise<StreamOutcome> => {
  const connection = new AbortController()
  const abortConnection = () => connection.abort()
  signal.addEventListener('abort', abortConnection)
  let silenceTimer: number | undefined

  const armSilenceTimer = () => {
    window.clearTimeout(silenceTimer)
    silenceTimer = window.setTimeout(abortConnection, silenceMs)
  }

  try {
    armSilenceTimer()

    const headers: Record<string, string> = { Accept: 'text/event-stream' }
    if (lastEventId > 0) headers['Last-Event-ID'] = String(lastEventId)

    const response = await apiFetch(`/plan-generations/${encodeURIComponent(jobId)}/events`, {
      headers,
      signal: connection.signal,
    })

    if (response.status === 401) return { kind: 'unauthorized', status: 401 }
    if (response.status === 403) return { kind: 'blocked', status: 403 }
    if (response.status === 404) return { kind: 'not-found' }
    if (!response.ok || !response.body) return { kind: 'failed' }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const parser = createSseParser()
    let seenId = lastEventId

    for (;;) {
      const { done, value } = await reader.read()
      if (done) return { kind: 'failed' }
      armSilenceTimer()

      for (const frame of parser.feed(decoder.decode(value, { stream: true }))) {
        if (frame.event === 'reconnect') return { kind: 'closed' }

        const event = parseProgressEvent(frame.data)
        if (!event || !isNewEvent(seenId, event.id)) continue

        seenId = event.id
        onEvent(event)
        if (isTerminalEvent(event)) return { kind: 'terminal', event }
      }
    }
  } catch {
    return { kind: 'failed' }
  } finally {
    window.clearTimeout(silenceTimer)
    signal.removeEventListener('abort', abortConnection)
    connection.abort()
  }
}
