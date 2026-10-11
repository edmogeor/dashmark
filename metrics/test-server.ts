import { createServer, type IncomingMessage } from 'node:http'
import { expect } from 'vitest'
import type { Server as SocketServer } from 'socket.io'
import type { MetricHttpRequest, MetricOverride } from '@/lib/config-file-types'
import { applyBasicAuth, applyTokenAuth, resolveBody, resolveHeaders, resolveQuery, resolveReferences, resolveSocketIoArguments } from '@/lib/custom-metric-references'

export type FixtureResponse = { body?: unknown; status?: number; headers?: Record<string, string | string[]> }
type HttpResponder = (request: IncomingMessage, body: string) => FixtureResponse | Promise<FixtureResponse>
type HttpFixture = FixtureResponse | FixtureResponse[] | HttpResponder
type SocketFixture = { body: unknown } | { body: unknown }[] | ((args: unknown[]) => unknown | Promise<unknown>)

export type FixtureServerOptions = {
  responses?: Record<string, HttpFixture>
  socketEvents?: Record<string, SocketFixture>
  tokens?: Record<string, string>
  onRequest?: (request: IncomingMessage, body: string) => unknown
}

export async function startMetricTestServer({
  metric,
  fixture,
  responses = {},
  socketEvents = {},
  tokens: suppliedTokens = {},
  onRequest
}: FixtureServerOptions & {
  metric: MetricOverride
  fixture: unknown
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const auth = metric.source.auth
  const tokens = {
    ...Object.fromEntries((auth?.type === 'cookie_session' ? auth.steps : []).flatMap((step) => Object.keys(step.extract ?? {}).map((name) => [name, 'test-token']))),
    ...suppliedTokens
  }
  const errors: unknown[] = []
  const responseCounts = new Map<string, number>()
  const sessionCookies = new Set<string>()

  function expectedRequest(source: MetricHttpRequest): { url: URL; headers: Headers; body?: string } {
    const url = new URL(source.url)
    const { headers, error } = resolveHeaders(metric, source.headers ?? {}, tokens)
    const queryError = resolveQuery(metric, url, source.query ?? {}, tokens)
    const body = resolveBody(metric, source.form, source.json, tokens)
    if (!headers || error || queryError || body.error || !body.value) throw new Error(error ?? queryError ?? body.error ?? 'Could not resolve fixture request')
    return { url, headers, body: body.value.form ? new URLSearchParams(body.value.form).toString() : body.value.json ? JSON.stringify(body.value.json) : undefined }
  }

  const expected = expectedRequest(metric.source)
  const basicError = applyBasicAuth(metric, expected.headers)
  const tokenError = applyTokenAuth(metric, expected.headers, expected.url)
  if (basicError || tokenError) throw new Error(basicError ?? tokenError)
  const expectedPath = expected.url.pathname + expected.url.search
  const loginSteps = (auth?.type === 'cookie_session' ? auth.steps : []).map((step) => ({ step, expected: expectedRequest(step) }))

  function assertRequest(request: IncomingMessage, body: string, source: MetricHttpRequest, prepared: ReturnType<typeof expectedRequest>): void {
    expect(request.method).toBe(source.method ?? 'GET')
    for (const [name, value] of prepared.headers) expect(request.headers[name]).toBe(value)
    if (prepared.body !== undefined) {
      if (source.json) expect(JSON.parse(body)).toEqual(JSON.parse(prepared.body))
      else expect(body).toBe(prepared.body)
    }
  }

  function authenticated(request: IncomingMessage): boolean {
    if (auth?.type === 'basic') return request.headers.authorization === expected.headers.get('authorization')
    if (auth?.type === 'token') {
      return auth.header
        ? request.headers[auth.header.toLowerCase()] === expected.headers.get(auth.header)
        : new URL(request.url ?? '/', 'http://metrics.test').searchParams.get(auth.query) === expected.url.searchParams.get(auth.query)
    }
    if (auth?.type === 'cookie_session') {
      const cookies = request.headers.cookie?.split(';').map((cookie) => cookie.trim()) ?? []
      return [...sessionCookies].some((cookie) => cookies.includes(cookie))
    }
    return true
  }

  async function fixtureResponse(request: IncomingMessage, body: string): Promise<FixtureResponse | undefined> {
    const pathname = new URL(request.url ?? '/', 'http://metrics.test').pathname
    const key = request.url && responses[request.url] !== undefined ? request.url : pathname
    const response = responses[key]
    if (typeof response === 'function') return response(request, body)
    if (!Array.isArray(response)) return response
    const index = responseCounts.get(key) ?? 0
    responseCounts.set(key, index + 1)
    if (response[index] === undefined) throw new Error(`Fixture response sequence exhausted: ${key}`)
    return response[index]
  }

  const server = createServer((request, response) => {
    void (async () => {
      let body = ''
      for await (const chunk of request) body += chunk.toString()
      await onRequest?.(request, body)
      const loginCandidates = loginSteps.filter(({ expected }) => request.url === expected.url.pathname + expected.url.search)
      const login = loginCandidates.find(({ step, expected }) => request.method === (step.method ?? 'GET') && (expected.body === undefined || expected.body === body)) ?? loginCandidates[0]
      if (login) assertRequest(request, body, login.step, login.expected)
      const configured = await fixtureResponse(request, body)
      if (!login && !configured && !authenticated(request)) {
        response.writeHead(401)
        response.end()
        return
      }
      if (!login && !configured) {
        expect(request.url).toBe(expectedPath)
        assertRequest(request, body, metric.source, expected)
      }
      const reply = configured ?? (login ? { body: { token: 'test-token' }, headers: { 'Set-Cookie': 'metric-session=active; Path=/' } } : { body: fixture })
      response.statusCode = reply.status ?? 200
      const plaintext = configured ? typeof reply.body === 'string' : !login && Boolean(metric.text || metric.prometheus)
      response.setHeader('Content-Type', plaintext ? 'text/plain' : 'application/json')
      for (const [name, value] of Object.entries(reply.headers ?? {})) response.setHeader(name, value)
      if (login && response.statusCode >= 200 && response.statusCode < 300) {
        const cookies = response.getHeader('Set-Cookie')
        if (cookies !== undefined) {
          for (const cookie of Array.isArray(cookies) ? cookies : [String(cookies)]) {
            const pair = cookie.split(';')[0].trim()
            if (pair) sessionCookies.add(pair)
          }
        }
      }
      const actualType = String(response.getHeader('Content-Type'))
      if (reply.body === undefined) response.end()
      else response.end(actualType.includes('json') ? JSON.stringify(reply.body) : String(reply.body))
    })().catch((error) => {
      errors.push(error)
      response.statusCode = 500
      response.end('Fixture request failed')
    })
  })

  let socketServer: SocketServer | undefined
  const socketio = metric.source.socketio
  if (metric.source.transport === 'socketio' && socketio) {
    const { Server } = await import('socket.io')
    socketServer = new Server(server, socketio.path ? { path: socketio.path } : {})
    const resolvedAuth = resolveReferences(metric, socketio.auth ?? {}, 'fixture socket auth', tokens)
    if (resolvedAuth.error || !resolvedAuth.values) throw new Error(resolvedAuth.error ?? 'Invalid fixture socket auth')
    socketServer.use((socket, next) => {
      try {
        expect(socket.handshake.auth).toEqual(resolvedAuth.values)
        for (const [name, value] of expected.headers) expect(socket.handshake.headers[name]).toBe(value)
        next()
      } catch (error) {
        errors.push(error)
        next(new Error('Fixture socket authentication failed'))
      }
    })
    socketServer.on('connection', (socket) => {
      socket.onAny((event: string, ...args: unknown[]) => {
        const acknowledge = args.pop()
        void (async () => {
          if (typeof acknowledge !== 'function') throw new Error(`Missing fixture acknowledgement: ${event}`)
          const declarations = [socketio.login, socketio.request].filter((entry) => entry?.event === event)
          const expectedArgs = declarations.map((entry) => {
            const resolved = resolveSocketIoArguments(metric, entry?.args)
            if (resolved.error || !resolved.values) throw new Error(resolved.error ?? 'Invalid fixture socket arguments')
            return resolved.values
          })
          if (expectedArgs.length > 0) expect(expectedArgs).toContainEqual(args)
          const configured = socketEvents[event]
          if (typeof configured === 'function') return acknowledge(await configured(args))
          if (Array.isArray(configured)) {
            const index = responseCounts.get(event) ?? 0
            responseCounts.set(event, index + 1)
            if (!configured[index]) throw new Error(`Fixture socket sequence exhausted: ${event}`)
            return acknowledge(configured[index].body)
          }
          if (configured) return acknowledge(configured.body)
          if (event === socketio.request.event) return acknowledge(fixture)
          if (event === socketio.login?.event) return acknowledge({ ok: true })
          throw new Error(`Unconfigured fixture socket event: ${event}`)
        })().catch((error) => {
          errors.push(error)
          if (typeof acknowledge === 'function') acknowledge({ error: 'Fixture event failed' })
        })
      })
    })
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture server did not provide an address')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      if (socketServer) await new Promise<void>((resolve) => socketServer!.close(() => resolve()))
      else await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
      if (errors.length > 0) throw errors[0]
    }
  }
}
