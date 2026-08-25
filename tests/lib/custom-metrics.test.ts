import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server as SocketIoServer } from 'socket.io'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { collectCustomMetric } from '@/lib/custom-metrics'
import type { MetricOverride } from '@/lib/config-file'

let server: Server
let baseUrl: string
let cookieRequests: string[] = []
let loginRequests: { body: string; cookie: string }[] = []
let socketServer: SocketIoServer
let socketEvents: { event: string; args: unknown[] }[] = []
let socketHeaders: Record<string, string | string[] | undefined>[] = []
let forEachRequests: string[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = request.url ?? ''
    if (path === '/cookies') {
      cookieRequests.push(request.headers.cookie ?? '')
      if (!request.headers.cookie?.includes('metric-session=active')) response.setHeader('Set-Cookie', 'metric-session=active; Path=/')
      setTimeout(() => response.end(JSON.stringify({ value: request.headers.cookie?.includes('metric-session=active') ? 2 : 1 })), 10)
      return
    }
    if (path === '/large') {
      response.end(JSON.stringify({ value: 'x'.repeat(1_048_577) }))
      return
    }
    if (path === '/login') {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        loginRequests.push({ body, cookie: request.headers.cookie ?? '' })
        if (body === 'username=admin&password=secret') response.setHeader('Set-Cookie', 'metric-session=authenticated; Path=/')
        response.end(body === 'username=admin&password=secret' ? 'Ok.' : 'Fails.')
      })
      return
    }
    if (path === '/protected') {
      response.statusCode = request.headers.cookie?.includes('metric-session=authenticated') ? 200 : 403
      response.end(JSON.stringify({ value: 7 }))
      return
    }
    if (path === '/basic') {
      response.statusCode = request.headers.authorization === `Basic ${Buffer.from('api-key:api-secret').toString('base64')}` ? 200 : 401
      response.end(JSON.stringify({ value: 8 }))
      return
    }
    if (path === '/csrf') {
      response.setHeader('Set-Cookie', 'csrf-session=active; Path=/')
      response.end('<input name="csrf" value="csrf-token">')
      return
    }
    if (path === '/session') {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        const valid = request.headers.cookie?.includes('csrf-session=active') && body === 'csrf=csrf-token'
        if (valid) response.setHeader('Set-Cookie', 'metric-session=token; Path=/')
        response.statusCode = valid ? 200 : 403
        response.end(JSON.stringify({ token: valid ? 'api-token' : '' }))
      })
      return
    }
    if (path === '/post-metric?token=api-token') {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        const valid = request.headers.cookie?.includes('metric-session=token')
          && request.headers['x-api-token'] === 'api-token'
          && body === JSON.stringify({ token: 'api-token' })
        response.statusCode = valid ? 200 : 403
        response.end(JSON.stringify({ value: valid ? 11 : 0 }))
      })
      return
    }
    if (path === '/form-metric') {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => response.end(JSON.stringify({ value: body === 'scope=metrics' ? 13 : 0 })))
      return
    }
    if (path === '/token') {
      response.statusCode = request.headers.authorization === 'Bearer metric-token' && request.headers.accept === 'application/json' ? 200 : 401
      response.end(JSON.stringify({ value: 14 }))
      return
    }
    if (path === '/json-metric') {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        response.end(JSON.stringify({ value: body === JSON.stringify({ method: 'status', params: [], credentials: { token: 'nested-token' } }) ? 15 : 0 }))
      })
      return
    }
    if (path === '/for-each/discover') {
      response.end(JSON.stringify({ ids: ['movie', 'music / 1', 'movie'] }))
      return
    }
    if (path.startsWith('/for-each/')) {
      forEachRequests.push(path)
      response.statusCode = request.headers.authorization === 'Bearer aggregate-token' ? 200 : 401
      response.end(JSON.stringify({ total: path === '/for-each/movie' ? 2 : 3 }))
      return
    }
    const responses: Record<string, string> = {
      '/data': '{"stats":{"value":12.5}}',
      '/sum': '{"items":[{"value":2},{"value":3}]}',
      '/megabytes': '{"megabytes":2}',
      '/items': '{"items":[1,2]}',
      '/queue': '# HELP queue_depth Current queue depth\nqueue_depth{queue="primary",instance="one"} 2\nqueue_depth{queue="secondary"} 9\nqueue_depth{queue="primary",instance="two"} 4 1710000000\n',
      '/status': '{"status":"healthy"}',
      '/text-state': 'open\n',
      '/text-number': ' 21.5 ',
      '/metrics': 'build_info{version="1.2.3"} 1\n'
    }
    response.end(responses[path] ?? '')
  })
  socketServer = new SocketIoServer(server)
  socketServer.use((socket, next) => socket.handshake.auth.token === 'socket-token' ? next() : next(new Error('Unauthorized')))
  socketServer.on('connection', socket => {
    socketHeaders.push(socket.handshake.headers)
    socket.on('login', (...args) => {
      const callback = args.pop()
      socketEvents.push({ event: 'login', args })
      callback({ ok: true })
    })
    socket.on('metric', (...args) => {
      const callback = args.pop()
      socketEvents.push({ event: 'metric', args })
      callback({ value: 42 })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>(resolve => socketServer.close(() => resolve()))
})

function metric(extractor: Pick<MetricOverride, 'jq'> | Pick<MetricOverride, 'prometheus'>): MetricOverride {
  return { label: 'Test metric', unit: 'number', source: { url: `${baseUrl}/data` }, ...extractor } as MetricOverride
}

describe('collectCustomMetric', () => {
  it('extracts scalar and aggregated JSON values with jq', async () => {
    await expect(collectCustomMetric('scalar', metric({ jq: { expression: '.stats.value' } }))).resolves.toEqual({ value: 12.5 })
    await expect(collectCustomMetric('sum', { ...metric({ jq: { expression: '[.items[].value] | add' } }), source: { url: `${baseUrl}/sum` } })).resolves.toEqual({ value: 5 })
  })

  it('collects bounded, encoded child requests and reduces their numeric values', async () => {
    forEachRequests = []
    await expect(collectCustomMetric('for-each', {
      label: 'Library items', valueType: 'number', unit: 'count', chart: 'step',
      source: { url: `${baseUrl}/for-each/discover`, auth: { type: 'token', header: 'Authorization', prefix: 'Bearer ', value: { value: 'aggregate-token' } } },
      forEach: {
        items: { expression: '.ids' },
        requestUrl: `${baseUrl}/for-each/{item}`,
        value: { expression: '.total' },
        reduce: 'sum'
      }
    })).resolves.toEqual({ value: 5 })
    expect(forEachRequests.sort()).toEqual(['/for-each/movie', '/for-each/music%20%2F%201'])
  })

  it('applies numeric transforms after extraction', async () => {
    await expect(collectCustomMetric('bytes', {
      label: 'Bytes', valueType: 'number', unit: 'bytes', chart: 'step',
      source: { url: `${baseUrl}/megabytes` }, transform: { multiply: 1_048_576 },
      jq: { expression: '.megabytes' }
    })).resolves.toEqual({ value: 2_097_152 })
  })

  it('reports an unavailable metric when jq produces a non-numeric value', async () => {
    await expect(collectCustomMetric('items', { ...metric({ jq: { expression: '.items' } }), source: { url: `${baseUrl}/items` } })).resolves.toMatchObject({ error: 'jq extraction did not produce a finite number' })
  })

  it('parses Prometheus samples, labels, comments, and reductions', async () => {
    await expect(collectCustomMetric('queue', {
      ...metric({ prometheus: { name: 'queue_depth', labels: { queue: 'primary' }, reduce: 'average' } }),
      source: { url: `${baseUrl}/queue` }
    })).resolves.toEqual({ value: 3 })
  })

  it('extracts text values without coercing them to numeric samples', async () => {
    await expect(collectCustomMetric('status', {
      label: 'Status', valueType: 'string', source: { url: `${baseUrl}/status` }, jq: { expression: '.status' }
    })).resolves.toEqual({ value: 'healthy' })
    await expect(collectCustomMetric('version', {
      label: 'Version', valueType: 'string', source: { url: `${baseUrl}/metrics` }, prometheus: { name: 'build_info', valueLabel: 'version' }
    })).resolves.toEqual({ value: '1.2.3' })
  })

  it('extracts plain-text state and numeric values', async () => {
    await expect(collectCustomMetric('text-state', {
      label: 'State', valueType: 'state', color: 'info', source: { url: `${baseUrl}/text-state` }, text: true
    })).resolves.toEqual({ value: 'open' })
    await expect(collectCustomMetric('text-number', {
      label: 'Temperature', valueType: 'number', unit: 'celsius', chart: 'line', source: { url: `${baseUrl}/text-number` }, text: true
    })).resolves.toEqual({ value: 21.5 })
  })

  it('caches cookies for each metric key and source', async () => {
    cookieRequests = []
    const cookieMetric = { ...metric({ jq: { expression: '.value' } }), source: { url: `${baseUrl}/cookies` } }

    await expect(collectCustomMetric('cookie', cookieMetric)).resolves.toEqual({ value: 1 })
    await expect(collectCustomMetric('cookie', cookieMetric)).resolves.toEqual({ value: 2 })
    await expect(collectCustomMetric('other-cookie', cookieMetric)).resolves.toEqual({ value: 1 })
    expect(cookieRequests).toEqual(['', 'metric-session=active', ''])
  })

  it('logs in with form credentials before collecting a cookie-session metric', async () => {
    loginRequests = []
    const cookieMetric = {
      ...metric({ jq: { expression: '.value' } }),
      source: {
        url: `${baseUrl}/protected`,
        auth: {
          type: 'cookie_session' as const,
          steps: [{
            url: `${baseUrl}/login`, method: 'POST' as const,
            form: { username: { value: 'admin' }, password: { value: 'secret' } }
          }]
        }
      }
    }

    await expect(collectCustomMetric('authenticated', cookieMetric)).resolves.toEqual({ value: 7 })
    await expect(collectCustomMetric('authenticated', cookieMetric)).resolves.toEqual({ value: 7 })
    expect(loginRequests).toEqual([
      { body: 'username=admin&password=secret', cookie: '' },
      { body: 'username=admin&password=secret', cookie: 'metric-session=authenticated' }
    ])
  })

  it('uses HTTP Basic credentials from secret references', async () => {
    await expect(collectCustomMetric('basic', {
      ...metric({ jq: { expression: '.value' } }),
      source: {
        url: `${baseUrl}/basic`,
        auth: { type: 'basic', username: { value: 'api-key' }, password: { value: 'api-secret' } }
      }
    })).resolves.toEqual({ value: 8 })
  })

  it('sends static headers and prefixed token authentication', async () => {
    await expect(collectCustomMetric('token', {
      ...metric({ jq: { expression: '.value' } }),
      source: {
        url: `${baseUrl}/token`, headers: { Accept: 'application/json' },
        auth: { type: 'token', header: 'Authorization', prefix: 'Bearer ', value: { value: 'metric-token' } }
      }
    })).resolves.toEqual({ value: 14 })
  })

  it('uses shared cookies and extracted HTML and JSON tokens in later requests', async () => {
    const authenticatedPostMetric = {
      label: 'Authenticated POST metric', valueType: 'number' as const, unit: 'count', chart: 'step' as const,
      source: {
        url: `${baseUrl}/post-metric`, method: 'POST' as const,
        headers: { 'X-Api-Token': { token: 'api-token' } },
        query: { token: { token: 'api-token' } },
        json: { token: { token: 'api-token' } },
        auth: {
          type: 'cookie_session' as const,
          steps: [
            { url: `${baseUrl}/csrf`, method: 'GET' as const, extract: { csrf: { cheerio: { selector: 'input[name="csrf"]', attribute: 'value' } } } },
            { url: `${baseUrl}/session`, method: 'POST' as const, form: { csrf: { token: 'csrf' } }, extract: { 'api-token': { jq: '.token' } } }
          ]
        }
      },
      jq: { expression: '.value' }
    } as MetricOverride

    await expect(collectCustomMetric('csrf-post', authenticatedPostMetric)).resolves.toEqual({ value: 11 })
  })

  it('sends form POST metric sources', async () => {
    await expect(collectCustomMetric('form-post', {
      label: 'Form POST metric', valueType: 'number', unit: 'count', chart: 'step',
      source: { url: `${baseUrl}/form-metric`, method: 'POST', form: { scope: { value: 'metrics' } } },
      jq: { expression: '.value' }
    } as MetricOverride)).resolves.toEqual({ value: 13 })
  })

  it('sends literal and secret values in nested JSON request bodies', async () => {
    await expect(collectCustomMetric('json-post', {
      label: 'JSON POST metric', valueType: 'number', unit: 'count', chart: 'step',
      source: {
        url: `${baseUrl}/json-metric`, method: 'POST',
        json: { method: 'status', params: [], credentials: { token: { value: 'nested-token' } } }
      },
      jq: { expression: '.value' }
    } as MetricOverride)).resolves.toEqual({ value: 15 })
  })

  it('collects a Socket.IO acknowledgement with handshake auth and login', async () => {
    socketEvents = []
    socketHeaders = []
    const socketMetric = {
      label: 'Socket metric', valueType: 'number' as const, unit: 'count', chart: 'step' as const,
      source: {
        url: baseUrl,
        transport: 'socketio' as const,
        socketio: {
          auth: { token: { value: 'socket-token' } },
          login: { event: 'login', args: ['metric-reader'] },
          request: { event: 'metric', args: [42] }
        }
      },
      jq: { expression: '.value' }
    } as MetricOverride

    await expect(collectCustomMetric('socket', socketMetric)).resolves.toEqual({ value: 42 })
    expect(socketEvents).toEqual([
      { event: 'login', args: ['metric-reader'] },
      { event: 'metric', args: [42] }
    ])
  })

  it('uses cookie-session authentication and explicit headers for Socket.IO metrics', async () => {
    socketHeaders = []
    const socketMetric = {
      label: 'Socket session metric', valueType: 'number' as const, unit: 'count', chart: 'step' as const,
      source: {
        url: baseUrl, transport: 'socketio' as const, headers: { 'X-Metric-Client': 'dashmark' },
        auth: {
          type: 'cookie_session' as const,
          steps: [{ url: `${baseUrl}/login`, method: 'POST' as const, form: { username: { value: 'admin' }, password: { value: 'secret' } } }]
        },
        socketio: { path: '/socket.io', auth: { token: { value: 'socket-token' } }, request: { event: 'metric' } }
      },
      jq: { expression: '.value' }
    } as MetricOverride

    await expect(collectCustomMetric('socket-session', socketMetric)).resolves.toEqual({ value: 42 })
    expect(socketHeaders).toContainEqual(expect.objectContaining({ cookie: expect.stringContaining('metric-session=authenticated'), 'x-metric-client': 'dashmark' }))
  })

  it('rejects responses larger than one megabyte', async () => {
    await expect(collectCustomMetric('large', { ...metric({ jq: { expression: '.value' } }), source: { url: `${baseUrl}/large` } })).resolves.toEqual({ error: 'Could not reach metric source' })
  })
})
