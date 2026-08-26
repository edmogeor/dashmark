import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { expect } from 'vitest'
import { collectCustomMetric } from '@/lib/custom-metrics'
import type { MetricOverride } from '@/lib/config-file'

type MetricDefinition = {
  display: { label: string; chart?: string }
  value: {
    kind?: 'number' | 'string' | 'state'
    unit?: string
    transform?: { multiply?: number; add?: number }
    default_color?: 'success' | 'info' | 'warning' | 'error' | 'disabled'
    colors?: Record<string, 'success' | 'info' | 'warning' | 'error' | 'disabled'>
    labels?: Record<string, string>
  }
  extract: {
    jq?: string
    text?: true
    for_each?: { items: string; request: { url: string }; value: string; reduce: 'count' | 'sum' | 'average' | 'minimum' | 'maximum' }
  }
  parameters?: Record<string, { type: 'url_component' | 'json_value' }>
  source: {
    url: string
    method?: 'GET' | 'POST'
    headers?: Record<string, unknown>
    query?: Record<string, unknown>
    form?: Record<string, unknown>
    json?: Record<string, unknown>
    authentication?:
      | { kind: 'basic'; username: unknown; password: unknown }
      | { kind: 'token'; header: string; prefix?: string; value: unknown }
      | { kind: 'cookie_session'; requests: { url: string; method?: 'GET' | 'POST'; form?: Record<string, unknown>; extract?: Record<string, unknown> }[] }
  }
}

type ProviderDefinition = {
  source?: Pick<MetricDefinition['source'], 'headers' | 'authentication'> & { query?: Record<string, unknown> }
  charts?: Record<string, 'step' | 'line' | 'area'>
}

function loadDefinition(definitionUrl: URL): [MetricDefinition, ProviderDefinition] {
  const definition = yaml.load(readFileSync(definitionUrl, 'utf8')) as MetricDefinition
  const providerUrl = new URL('./provider.yml', definitionUrl)
  const provider = existsSync(providerUrl) ? yaml.load(readFileSync(providerUrl, 'utf8')) as ProviderDefinition : {}
  return [definition, provider]
}

function sourceFor(definition: MetricDefinition, provider: ProviderDefinition): MetricDefinition['source'] {
  const defaults = provider.source ?? {}
  return {
    ...defaults,
    ...definition.source,
    ...(defaults.headers || definition.source.headers ? { headers: { ...defaults.headers, ...definition.source.headers } } : {}),
    ...(defaults.query || definition.source.query ? { query: { ...defaults.query, ...definition.source.query } } : {})
  }
}

function parameterValues(definition: MetricDefinition): Record<string, string> {
  return Object.fromEntries(Object.keys(definition.parameters ?? {}).map(name => [name, `test-${name}`]))
}

function resolveParameterValues(value: unknown, values: Record<string, string>): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  if (Object.keys(value).length === 1 && typeof (value as { parameter?: unknown }).parameter === 'string') return values[(value as { parameter: string }).parameter]
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, resolveParameterValues(item, values)]))
}

function resolveUrl(url: string, baseUrl: string, values: Record<string, string>): string {
  return url.replace('{url}', baseUrl).replace('{metrics_url}', baseUrl).replace(/\{([a-z][a-z0-9_]*)\}/g, (_, name: string) => values[name] === undefined ? `{${name}}` : encodeURIComponent(values[name]))
}

function requestValues(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return values && Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value !== null && typeof value === 'object' && 'token' in value ? value : { value: 'test-secret' }]))
}

function loadMetric(definitionUrl: URL, baseUrl: string): MetricOverride {
  const [definition, provider] = loadDefinition(definitionUrl)
  const source = sourceFor(definition, provider)
  const parameters = parameterValues(definition)
  const headers = requestValues(source.headers)
  const query = requestValues(source.query)
  const form = requestValues(source.form)
  const basic = source.authentication?.kind === 'basic'
    ? { type: 'basic' as const, username: { value: 'test-username' }, password: { value: 'test-password' } }
    : undefined
  const token = source.authentication?.kind === 'token'
    ? { type: 'token' as const, header: source.authentication.header, ...(source.authentication.prefix ? { prefix: source.authentication.prefix } : {}), value: { value: 'test-token' } }
    : undefined
  const loginSteps = source.authentication?.kind === 'cookie_session' ? source.authentication.requests : []

  return {
    label: definition.display.label,
    valueType: definition.value.kind ?? 'number',
    unit: definition.value.unit ?? 'number',
    chart: provider.charts?.[definition.display.chart ?? ''] ?? definition.display.chart ?? 'step',
    ...(definition.display.chart && provider.charts?.[definition.display.chart] ? { chartGroup: definition.display.chart } : {}),
    ...(definition.value.transform ? { transform: definition.value.transform } : {}),
    source: {
      url: resolveUrl(source.url, baseUrl, parameters),
      ...(source.method ? { method: source.method } : {}),
      ...(headers ? { headers } : {}),
      ...(query ? { query } : {}),
      ...(form ? { form } : {}),
      ...(source.json ? { json: resolveParameterValues(source.json, parameters) } : {}),
      ...(basic ? { auth: basic } : {}),
      ...(token ? { auth: token } : {}),
      ...(loginSteps.length > 0
        ? {
            auth: {
              type: 'cookie_session',
              steps: loginSteps.map(step => ({
                url: resolveUrl(step.url, baseUrl, parameters),
                ...(step.method ? { method: step.method } : {}),
                ...(step.form ? { form: Object.fromEntries(Object.keys(step.form).map(name => [name, { value: `test-${name}` }])) } : {}),
                ...(step.extract ? { extract: step.extract } : {})
              }))
            }
          }
        : {})
    },
    ...(definition.extract.for_each
      ? { forEach: { items: { expression: definition.extract.for_each.items }, requestUrl: resolveUrl(definition.extract.for_each.request.url, baseUrl, parameters), value: { expression: definition.extract.for_each.value }, reduce: definition.extract.for_each.reduce } }
      : definition.extract.text ? { text: true } : { jq: { expression: definition.extract.jq! } }),
    ...(definition.value.default_color ? { color: definition.value.default_color } : {}),
    ...(definition.value.colors ? { stateColors: definition.value.colors } : {}),
    ...(definition.value.labels ? { stateLabels: definition.value.labels } : {})
  } as MetricOverride
}

export async function expectFixtureMetric(definitionUrl: URL, fixture: unknown, expected: number | string): Promise<void> {
  const [definition, provider] = loadDefinition(definitionUrl)
  const source = sourceFor(definition, provider)
  const parameters = parameterValues(definition)
  const expectedUrl = new URL(resolveUrl(source.url, 'http://metrics.test', parameters))
  for (const name of Object.keys(source.query ?? {})) expectedUrl.searchParams.set(name, 'test-secret')
  const expectedPath = `${expectedUrl.pathname}${expectedUrl.search}`
  const requiresCookieSession = source.authentication?.kind === 'cookie_session'
  const requiresBasicAuth = source.authentication?.kind === 'basic'
  const requiresTokenAuth = source.authentication?.kind === 'token'
  const tokenPrefix = source.authentication?.kind === 'token' ? source.authentication.prefix ?? '' : ''
  const loginPath = source.authentication?.kind === 'cookie_session'
    ? new URL(source.authentication.requests[0]?.url.replace('{url}', 'http://metrics.test').replace('{metrics_url}', 'http://metrics.test') ?? 'http://metrics.test/unconfigured').pathname
    : undefined
  const loginForm = source.authentication?.kind === 'cookie_session'
    ? source.authentication.requests[0]?.form
    : undefined
  const headerNames = Object.keys(source.headers ?? {})
  const sessionAuthorization = source.headers?.Authorization
  const sessionAuthorizationReference = sessionAuthorization as { token?: unknown; prefix?: unknown } | undefined
  const sessionTokenPrefix = typeof sessionAuthorizationReference?.token === 'string' && typeof sessionAuthorizationReference.prefix === 'string'
    ? sessionAuthorizationReference.prefix
    : undefined
  const server = createServer((request, response) => {
    if (request.url === loginPath) {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        if (loginForm) expect(body).toBe(new URLSearchParams(Object.keys(loginForm).map(name => [name, `test-${name}`])).toString())
        response.setHeader('Set-Cookie', 'metric-session=active; Path=/')
        response.end('{"token":"test-token"}')
      })
      return
    }

    if (definition.extract.for_each && request.url !== expectedPath) {
      expect(request.headers['x-plex-token']).toBe('test-secret')
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ MediaContainer: { size: 2 } }))
      return
    }
    expect(request.url).toBe(expectedPath)
    if (requiresCookieSession) expect(request.headers.cookie).toContain('metric-session=active')
    if (requiresBasicAuth) expect(request.headers.authorization).toBe(`Basic ${Buffer.from('test-username:test-password').toString('base64')}`)
    if (requiresTokenAuth) expect(request.headers.authorization).toBe(`${tokenPrefix}test-token`)
    for (const name of headerNames) {
      if (name === 'Authorization' && sessionTokenPrefix !== undefined) continue
      expect(request.headers[name.toLowerCase()]).toBe('test-secret')
    }
    if (sessionTokenPrefix !== undefined) expect(request.headers.authorization).toBe(`${sessionTokenPrefix}test-token`)
    response.setHeader('Content-Type', definition.extract.text ? 'text/plain' : 'application/json')
    response.end(definition.extract.text ? String(fixture) : JSON.stringify(fixture))
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await expect(collectCustomMetric(definitionUrl.pathname, loadMetric(definitionUrl, baseUrl))).resolves.toEqual({ value: expected })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
