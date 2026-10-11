import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { collectCustomMetric } from '@/lib/custom-metrics'
import { expectFixtureMetric } from '../../metrics/test-utils'
import { loadMetric } from '../../metrics/test-metric'
import { startMetricTestServer } from '../../metrics/test-server'

const directories: string[] = []

function definition(metric: string, provider = ''): URL {
  const directory = mkdtempSync(join(tmpdir(), 'dashmark-fixture-'))
  directories.push(directory)
  const providerDirectory = join(directory, 'example')
  mkdirSync(providerDirectory)
  writeFileSync(join(providerDirectory, 'metric.yml'), metric)
  if (provider) writeFileSync(join(providerDirectory, 'provider.yml'), provider)
  return pathToFileURL(join(providerDirectory, 'metric.yml'))
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it('uses production parsing and preserves literals, typed inputs, provider charts, transforms, and rate flags', async () => {
  vi.stubEnv('FIXTURE_API_KEY', 'real-secret-that-must-not-be-used')
  const url = definition(
    `
display: { label: Count, chart: traffic }
value: { rate: true }
parameters:
  name: { label: Name, type: url_component, transform: key }
  limit: { label: Limit, type: json_value }
source:
  url: '{metric_source}/data/{name}'
  method: POST
  query: { pageSize: 100, active: true, disabled: false }
  headers: { X-Literal: fixed, X-Number: 0, X-Flag: false }
  json:
    method: count
    enabled: false
    values: [0, true, null, { parameter: limit }]
    credential: { file: /nonexistent/fixture-secret }
extract: { jq: .count }
`,
    `
source:
  headers: { Accept: application/json }
  authentication:
    kind: token
    header: Authorization
    prefix: 'Bearer '
    value: { env: FIXTURE_API_KEY }
charts:
  traffic: { chart: line, unit: bytes }
transforms:
  key:
    trim: true
    lowercase: true
    replace: { _: '-' }
`
  )
  const options = { inputs: { name: ' Foo_Bar ', limit: 7 } }
  const parsed = loadMetric(url, 'http://metrics.test', options)
  expect(parsed).toMatchObject({ valueType: 'number', unit: 'bytes', chart: 'line', chartGroup: 'traffic', rate: true, source: { url: 'http://metrics.test/data/foo-bar' } })
  await expectFixtureMetric(url, { count: 8 }, 8, {
    ...options,
    onRequest(request, body) {
      const requestUrl = new URL(request.url!, 'http://metrics.test')
      expect(requestUrl.pathname).toBe('/data/foo-bar')
      expect(Object.fromEntries(requestUrl.searchParams)).toEqual({ pageSize: '100', active: 'true', disabled: 'false' })
      expect(request.headers.accept).toBe('application/json')
      expect(request.headers['x-literal']).toBe('fixed')
      expect(request.headers['x-number']).toBe('0')
      expect(request.headers['x-flag']).toBe('false')
      expect(request.headers.authorization).toBe('Bearer test-secret')
      expect(JSON.parse(body)).toEqual({ method: 'count', enabled: false, values: [0, true, null, 7], credential: 'test-secret' })
    }
  })
})

it('supports Prometheus fixtures without replacing literal headers', async () => {
  const url = definition(`
display: { label: Queue }
value: { unit: count }
source: { url: '{url}/metrics', headers: { Accept: text/plain } }
extract:
  prometheus: { name: queue_depth, labels: { queue: primary }, reduce: sum }
`)
  await expectFixtureMetric(url, 'queue_depth{queue="primary"} 2\nqueue_depth{queue="other"} 20\nqueue_depth{queue="primary"} 3\n', 5, {
    onRequest: (request) => expect(request.headers.accept).toBe('text/plain')
  })
})

it('uses provider-owned child responses and non-Plex authentication for for_each metrics', async () => {
  const url = definition(
    `
display: { label: Total }
value: { unit: count }
source: { url: '{url}/items' }
extract:
  for_each:
    items: .ids
    request: { url: '{url}/items/{item}' }
    value: .count
    reduce: sum
`,
    `
source:
  authentication:
    kind: token
    header: X-Example-Key
    value: { env: UNUSED_EXAMPLE_KEY }
`
  )
  await expectFixtureMetric(url, { ids: ['a', 'b'] }, 10, {
    responses: {
      '/items/a': { body: { count: 4 } },
      '/items/b': async (request) => {
        expect(request.headers['x-example-key']).toBe('test-secret')
        return { body: { count: 6 } }
      }
    },
    onRequest: (request) => expect(request.headers['x-example-key']).toBe('test-secret')
  })
})

it('serves multiple uptime pages from a response sequence', async () => {
  const url = definition(`
display: { label: History }
value: { kind: uptime }
source: { url: '{url}/history', query: { limit: 2 } }
extract:
  pagination: { items: .checks, next: .next }
  jq: '[.items[] | {timestamp: .at, status: .state}]'
`)
  const pages: string[] = []
  await expectFixtureMetric(
    url,
    null,
    {
      observations: [
        { timestamp: Date.parse('2026-10-11T12:00:00Z'), status: 'down' },
        { timestamp: Date.parse('2026-10-11T12:01:00Z'), status: 'up' }
      ]
    },
    {
      responses: {
        '/history': [{ body: { checks: [{ at: '2026-10-11T12:01:00Z', state: 'up' }], next: 2 } }, { body: { checks: [{ at: '2026-10-11T12:00:00Z', state: 'down' }], next: 0 } }]
      },
      onRequest(request) {
        const requestUrl = new URL(request.url!, 'http://metrics.test')
        expect(requestUrl.searchParams.get('limit')).toBe('2')
        pages.push(requestUrl.searchParams.get('page') ?? '1')
      }
    }
  )
  expect(pages).toEqual(['1', '2'])
})

it('serves errors, empty arrays, and zero values from a reusable response sequence', async () => {
  const url = definition(`
display: { label: Value }
source: { url: '{url}/value' }
extract: { jq: length }
`)
  const server = await startMetricTestServer({
    metric: loadMetric(url, 'http://metrics.test'),
    fixture: null,
    responses: { '/value': [{ status: 503 }, { body: [] }, { body: [1, 2, 3, 4, 5, 6, 7] }] }
  })
  try {
    const metric = loadMetric(url, server.baseUrl)
    expect(await collectCustomMetric('example/value', metric)).toEqual({ error: 'collection_failed' })
    expect(await collectCustomMetric('example/value', metric)).toEqual({ value: 0 })
    expect(await collectCustomMetric('example/value', metric)).toEqual({ value: 7 })
  } finally {
    await server.close()
  }
})

it('lets explicit fixtures model anonymous success for optional authentication', async () => {
  const url = definition(`
display: { label: Value }
source:
  url: '{url}/value'
  authentication:
    kind: token
    optional: true
    header: Authorization
    value: { env: EXAMPLE_TOKEN }
extract: { jq: .value }
`)
  let requests = 0
  await expectFixtureMetric(url, null, 5, {
    responses: { '/value': { body: { value: 5 } } },
    onRequest(request) {
      requests++
      expect(request.headers.authorization).toBeUndefined()
    }
  })
  expect(requests).toBe(1)
})

it('supports multiple authentication steps with configured responses and extracted tokens', async () => {
  const url = definition(
    `
display: { label: Value }
source:
  url: '{url}/value'
  headers: { Authorization: { token: access, prefix: 'Bearer ' } }
extract: { jq: .value }
`,
    `
source:
  authentication:
    kind: cookie_session
    requests:
      - url: '{url}/csrf'
        extract: { csrf: { cheerio: { selector: 'input[name=csrf]', attribute: value } } }
      - url: '{url}/login'
        method: POST
        form: { csrf: { token: csrf }, username: { env: EXAMPLE_USERNAME }, mode: literal }
        extract: { access: { jq: .token } }
`
  )
  const paths: string[] = []
  await expectFixtureMetric(url, { value: 9 }, 9, {
    secrets: { EXAMPLE_USERNAME: 'fixture-user' },
    tokens: { csrf: 'csrf-token', access: 'access-token' },
    responses: {
      '/csrf': { body: '<input name="csrf" value="csrf-token">', headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'nonce=ready; Path=/' } },
      '/login': (request, body) => {
        expect(request.headers.cookie).toContain('nonce=ready')
        expect(Object.fromEntries(new URLSearchParams(body))).toEqual({ csrf: 'csrf-token', username: 'fixture-user', mode: 'literal' })
        return { body: { token: 'access-token' }, headers: { 'Set-Cookie': 'session=ready; Path=/' } }
      }
    },
    onRequest: (request) => paths.push(new URL(request.url!, 'http://metrics.test').pathname)
  })
  expect(paths).toEqual(['/csrf', '/login', '/value'])
})

it('supports Socket.IO uptime fixtures with provider-owned events, literal arguments, and acknowledgement callbacks', async () => {
  const url = definition(`
display: { label: History }
value: { kind: uptime }
source:
  url: '{metric_source}'
  type: socket_io
  headers: { X-Literal: fixed }
  socket:
    path: /fixture-socket
    auth: { token: { env: EXAMPLE_TOKEN }, mode: literal }
    login: { event: sign-in, args: [{ env: EXAMPLE_USERNAME }, 0, false] }
    request: { event: fetch-history, args: [42, 1] }
extract: { jq: .observations }
`)
  const events: string[] = []
  await expectFixtureMetric(
    url,
    null,
    { observations: [{ timestamp: Date.parse('2026-10-11T12:00:00Z'), status: 'unknown' }] },
    {
      secrets: { EXAMPLE_USERNAME: 'fixture-user' },
      socketEvents: {
        'sign-in': (args) => {
          expect(args).toEqual(['fixture-user', 0, false])
          events.push('login')
          return { ok: true }
        },
        'fetch-history': async (args) => {
          expect(args).toEqual([42, 1])
          events.push('history')
          return { observations: [{ timestamp: '2026-10-11T12:00:00Z', status: 'unknown' }] }
        }
      }
    }
  )
  expect(events).toEqual(['login', 'history'])
})

it('serves Socket.IO acknowledgement sequences across repeated collections', async () => {
  const url = definition(`
display: { label: Value }
source:
  url: '{url}'
  type: socket_io
  socket: { request: { event: read-value, args: [1] } }
extract: { jq: .value }
`)
  const server = await startMetricTestServer({
    metric: loadMetric(url, 'http://metrics.test'),
    fixture: null,
    socketEvents: { 'read-value': [{ body: { value: 0 } }, { body: { value: 10 } }] }
  })
  try {
    const metric = loadMetric(url, server.baseUrl)
    expect(await collectCustomMetric('example/socket', metric)).toEqual({ value: 0 })
    expect(await collectCustomMetric('example/socket', metric)).toEqual({ value: 10 })
  } finally {
    await server.close()
  }
})

it('rejects invalid definitions through production validation instead of casting them into metrics', () => {
  const url = definition(`
display: { label: Broken }
source: { url: '{url}/value' }
extract: { jq: .value, text: true }
`)
  expect(() => loadMetric(url, 'http://metrics.test')).toThrow('metric rejected by production validation')
})

it('rejects misspelled fixture inputs instead of silently using a default', () => {
  const url = definition(`
display: { label: Value }
parameters: { name: { label: Name, type: url_component } }
source: { url: '{url}/value/{name}' }
extract: { jq: .value }
`)
  expect(() => loadMetric(url, 'http://metrics.test', { inputs: { typo: 'value' } })).toThrow('unknown fixture input typo')
})

it('surfaces failed request assertions even when collection failure was expected', async () => {
  const url = definition(`
display: { label: Value }
source: { url: '{url}/value' }
extract: { jq: .value }
`)
  await expect(
    expectFixtureMetric(
      url,
      { value: 1 },
      { error: 'collection_failed' },
      {
        onRequest: async (request) => expect(request.method).toBe('POST')
      }
    )
  ).rejects.toThrow('POST')
})
