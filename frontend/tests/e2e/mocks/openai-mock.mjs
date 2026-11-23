import { createServer } from 'node:http'

const PORT = Number(process.env.OPENAI_MOCK_PORT ?? 3199)
const WEEK_COUNT = 8
const SESSIONS_PER_WEEK = 3
const EXERCISES_PER_SESSION = 4
const CHUNK_SIZE = 240
const CHUNK_DELAY_MS = 5
const TOKEN_PATTERN = /E2E-[A-Za-z0-9]+/
const HOLD_PREFIX = 'E2E-hold'
const RELEASE_PATH = /^\/e2e\/release\/(E2E-[A-Za-z0-9]+)$/

const readBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })

const findSlugs = (node) => {
  if (!node || typeof node !== 'object') return null
  const slug = node.properties?.slug
  if (slug && Array.isArray(slug.enum)) return slug.enum
  for (const value of Object.values(node)) {
    const found = findSlugs(value)
    if (found) return found
  }
  return null
}

const buildPlan = (slugs, token) => ({
  weeks: Array.from({ length: WEEK_COUNT }, (_, weekIndex) => ({
    week: weekIndex + 1,
    goal: `Week ${weekIndex + 1} goal ${token}`,
    sessions: Array.from({ length: SESSIONS_PER_WEEK }, (_, sessionIndex) => ({
      title: `Session ${sessionIndex + 1} ${token}`,
      exercises: Array.from({ length: EXERCISES_PER_SESSION }, (_, exerciseIndex) => ({
        slug: slugs[(weekIndex + sessionIndex * EXERCISES_PER_SESSION + exerciseIndex) % slugs.length],
        sets: 3 + (exerciseIndex % 2),
        reps: exerciseIndex % 2 === 0 ? '8-10' : '12',
        restSeconds: 60 + exerciseIndex * 15,
        note: exerciseIndex === 0 ? null : `Note ${exerciseIndex} ${token}`,
      })),
    })),
  })),
})

const send = (response, type, data) => {
  response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const releasedTokens = new Set()
const waitingForRelease = new Map()

const isHeld = (token) => token.startsWith(HOLD_PREFIX) && !releasedTokens.has(token)

const waitForRelease = (token) =>
  new Promise((resolve) => {
    waitingForRelease.set(token, [...(waitingForRelease.get(token) ?? []), resolve])
  })

const release = (token) => {
  releasedTokens.add(token)
  for (const resolve of waitingForRelease.get(token) ?? []) resolve()
  waitingForRelease.delete(token)
}

const streamPlan = async (response, model, text) => {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  send(response, 'response.created', {
    response: { id: 'resp_e2e', created_at: Math.floor(Date.now() / 1000), model },
  })
  send(response, 'response.output_item.added', {
    output_index: 0,
    item: { type: 'message', id: 'msg_e2e' },
  })
  for (let start = 0; start < text.length; start += CHUNK_SIZE) {
    send(response, 'response.output_text.delta', {
      item_id: 'msg_e2e',
      output_index: 0,
      delta: text.slice(start, start + CHUNK_SIZE),
    })
    await pause(CHUNK_DELAY_MS)
  }
  send(response, 'response.output_item.done', {
    output_index: 0,
    item: { type: 'message', id: 'msg_e2e' },
  })
  send(response, 'response.completed', {
    response: {
      usage: {
        input_tokens: 1,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 1,
        output_tokens_details: { reasoning_tokens: 0 },
      },
    },
  })
  response.end()
}

const rejectUnknown = (response, status, message) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: { message, type: 'e2e_mock_error' } }))
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ok')
    return
  }
  const releaseMatch = request.method === 'POST' ? request.url?.match(RELEASE_PATH) : null
  if (releaseMatch) {
    release(releaseMatch[1])
    console.log(`[openai-mock] released ${releaseMatch[1]}`)
    response.writeHead(204)
    response.end()
    return
  }
  if (request.method !== 'POST' || !request.url?.endsWith('/responses')) {
    console.log(`[openai-mock] rejected ${request.method} ${request.url}`)
    rejectUnknown(response, 503, `The e2e mock does not serve ${request.method} ${request.url}`)
    return
  }
  const raw = await readBody(request)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    rejectUnknown(response, 400, 'The e2e mock received a body that is not JSON')
    return
  }
  const slugs = findSlugs(body)
  if (!slugs) {
    console.log('[openai-mock] rejected a request without a slug enum in its schema')
    rejectUnknown(response, 503, 'The e2e mock found no exercise slug enum in the request schema')
    return
  }
  const token = raw.match(TOKEN_PATTERN)?.[0] ?? 'E2E-none'
  console.log(`[openai-mock] POST ${request.url} model=${body.model} token=${token} slugs=${slugs.length}`)
  if (isHeld(token)) {
    console.log(`[openai-mock] holding ${token} until released`)
    await waitForRelease(token)
  }
  await streamPlan(response, body.model ?? 'e2e-mock', JSON.stringify(buildPlan(slugs, token)))
})

server.listen(PORT, () => {
  console.log(`[openai-mock] listening on ${PORT}`)
})
