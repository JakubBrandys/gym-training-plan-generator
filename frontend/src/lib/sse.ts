export type SseFrame = {
  id: string | null
  event: string
  data: string
}

export type SseParser = {
  feed: (text: string) => SseFrame[]
}

type PendingFrame = {
  id: string | null
  event: string | null
  dataLines: string[]
  dataChars: number
  hasField: boolean
}

export const MAX_SSE_PENDING_CHARS = 64 * 1024

const LINE_BREAK = /\r\n|\n|\r/

const emptyFrame = (): PendingFrame => ({ id: null, event: null, dataLines: [], dataChars: 0, hasField: false })

const takeLine = (buffer: string): { line: string; rest: string } | null => {
  const match = LINE_BREAK.exec(buffer)
  if (!match) return null
  const endsBuffer = match.index + match[0].length === buffer.length
  if (match[0] === '\r' && endsBuffer) return null
  return { line: buffer.slice(0, match.index), rest: buffer.slice(match.index + match[0].length) }
}

export const createSseParser = (): SseParser => {
  let buffer = ''
  let pending = emptyFrame()

  const applyLine = (line: string): SseFrame | null => {
    if (line === '') {
      const frame = pending
      pending = emptyFrame()
      if (!frame.hasField) return null
      return {
        id: frame.id,
        event: frame.event ?? 'message',
        data: frame.dataLines.join('\n'),
      }
    }

    if (line.startsWith(':')) return null

    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    const rawValue = separator === -1 ? '' : line.slice(separator + 1)
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue

    if (field === 'id') {
      pending.id = value
      pending.hasField = true
    } else if (field === 'event') {
      pending.event = value
      pending.hasField = true
    } else if (field === 'data') {
      pending.dataLines.push(value)
      pending.dataChars += value.length
      pending.hasField = true
      if (pending.dataChars > MAX_SSE_PENDING_CHARS) throw new Error('SSE frame is too large')
    }
    return null
  }

  const feed = (text: string): SseFrame[] => {
    buffer += text
    const frames: SseFrame[] = []
    let next = takeLine(buffer)
    while (next) {
      buffer = next.rest
      const frame = applyLine(next.line)
      if (frame) frames.push(frame)
      next = takeLine(buffer)
    }
    if (buffer.length > MAX_SSE_PENDING_CHARS) throw new Error('SSE line is too long')
    return frames
  }

  return { feed }
}
