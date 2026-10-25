import { describe, expect, it } from 'vitest'
import { createSseParser } from './sse'

describe('createSseParser', () => {
  it('parses a complete frame with id, event and data', () => {
    const parser = createSseParser()

    expect(parser.feed('id: 3\nevent: week\ndata: {"week":2}\n\n')).toEqual([
      { id: '3', event: 'week', data: '{"week":2}' },
    ])
  })

  it('handles chunk boundaries inside a line and inside a frame', () => {
    const parser = createSseParser()

    expect(parser.feed('id: 1\nev')).toEqual([])
    expect(parser.feed('ent: stage\nda')).toEqual([])
    expect(parser.feed('ta: {"a":1}\n')).toEqual([])
    expect(parser.feed('\n')).toEqual([{ id: '1', event: 'stage', data: '{"a":1}' }])
  })

  it('handles CRLF line endings, including a split CRLF', () => {
    const parser = createSseParser()

    expect(parser.feed('id: 2\r\nevent: stage\r\ndata: x\r')).toEqual([])
    expect(parser.feed('\n\r\n')).toEqual([{ id: '2', event: 'stage', data: 'x' }])
  })

  it('ignores comment frames', () => {
    const parser = createSseParser()

    expect(parser.feed(': connected\n\n: heartbeat\n\n')).toEqual([])
  })

  it('ignores comment lines inside a frame', () => {
    const parser = createSseParser()

    expect(parser.feed('id: 4\n: note\nevent: stage\ndata: y\n\n')).toEqual([
      { id: '4', event: 'stage', data: 'y' },
    ])
  })

  it('joins multi-line data with newlines', () => {
    const parser = createSseParser()

    expect(parser.feed('event: stage\ndata: one\ndata: two\n\n')).toEqual([
      { id: null, event: 'stage', data: 'one\ntwo' },
    ])
  })

  it('returns frames without an id', () => {
    const parser = createSseParser()

    expect(parser.feed('event: reconnect\ndata: {}\n\n')).toEqual([
      { id: null, event: 'reconnect', data: '{}' },
    ])
  })

  it('returns several frames from a single chunk', () => {
    const parser = createSseParser()

    const frames = parser.feed(': connected\n\nid: 1\nevent: stage\ndata: a\n\nid: 2\nevent: week\ndata: b\n\n')

    expect(frames).toEqual([
      { id: '1', event: 'stage', data: 'a' },
      { id: '2', event: 'week', data: 'b' },
    ])
  })

  it('does not emit a frame until its terminating blank line arrives', () => {
    const parser = createSseParser()

    expect(parser.feed('id: 9\nevent: stage\ndata: z\n')).toEqual([])
    expect(parser.feed('\n')).toHaveLength(1)
  })

  it('defaults the event name to message and strips one leading space only', () => {
    const parser = createSseParser()

    expect(parser.feed('data:  spaced\n\n')).toEqual([{ id: null, event: 'message', data: ' spaced' }])
  })
})
