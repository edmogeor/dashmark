import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { expect } from 'vitest'
import { collectCustomMetric } from '@/lib/custom-metrics'
import type { MetricOverride } from '@/lib/config-file'

type MetricDefinition = {
  label: string
  value_type?: 'number' | 'string' | 'state'
  color?: 'success' | 'info' | 'warning' | 'error' | 'disabled'
  unit?: string
  chart?: 'step' | 'line' | 'area' | 'none'
  chart_group?: string
  transform?: { multiply?: number; add?: number }
  jq?: string
  text?: true
  parameters?: Record<string, { type: 'url_component' | 'json_value' }>
  source: {
    url: string
    method?: 'GET' | 'POST'
    headers?: Record<string, unknown>
    json?: Record<string, unknown>
    auth?:
      | { type: 'basic'; username: unknown; password: unknown }
      | { type: 'token'; header: string; prefix?: string; value: unknown }
      | { type: 'cookie_session'; login?: { url: string; method: 'POST'; form?: Record<string, unknown>; extract?: Record<string, unknown> }; steps?: { url: string; method?: 'GET' | 'POST'; form?: Record<string, unknown>; extract?: Record<string, unknown> }[] }
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
  return url.replace('{url}', baseUrl).replace('{metrics_url}', baseUrl).replace(/\{([a-z][a-z0-9_]*)\}/g, (_, name: string) => encodeURIComponent(values[name] ?? `{${name}}`))
}

function loadMetric(definitionUrl: URL, baseUrl: string): MetricOverride {
  const definition = yaml.load(readFileSync(definitionUrl, 'utf8')) as MetricDefinition
  const source = definition.source
  const parameters = parameterValues(definition)
  const headers = source.headers && Object.fromEntries(Object.entries(source.headers).map(([name, value]) => [name, value !== null && typeof value === 'object' && 'token' in value ? value : { value: 'test-secret' }]))
  const basic = source.auth?.type === 'basic'
    ? { type: 'basic' as const, username: { value: 'test-username' }, password: { value: 'test-password' } }
    : undefined
  const token = source.auth?.type === 'token'
    ? { type: 'token' as const, header: source.auth.header, ...(source.auth.prefix ? { prefix: source.auth.prefix } : {}), value: { value: 'test-token' } }
    : undefined
  const loginSteps = source.auth?.type === 'cookie_session' ? source.auth.steps ?? (source.auth.login ? [source.auth.login] : []) : []

  return {
    label: definition.label,
    valueType: definition.value_type ?? 'number',
    unit: definition.unit ?? 'number',
    chart: definition.chart ?? 'step',
    ...(definition.chart_group ? { chartGroup: definition.chart_group } : {}),
    ...(definition.transform ? { transform: definition.transform } : {}),
    source: {
      url: resolveUrl(source.url, baseUrl, parameters),
      ...(source.method ? { method: source.method } : {}),
      ...(headers ? { headers } : {}),
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
    ...(definition.text ? { text: true } : { jq: { expression: definition.jq! } }),
    ...(definition.color ? { color: definition.color } : {})
  } as MetricOverride
}

export async function expectFixtureMetric(definitionUrl: URL, fixture: unknown, expected: number | string): Promise<void> {
  const definition = yaml.load(readFileSync(definitionUrl, 'utf8')) as MetricDefinition
  const parameters = parameterValues(definition)
  const expectedUrl = new URL(resolveUrl(definition.source.url, 'http://metrics.test', parameters))
  const expectedPath = `${expectedUrl.pathname}${expectedUrl.search}`
  const requiresCookieSession = definition.source.auth?.type === 'cookie_session'
  const requiresBasicAuth = definition.source.auth?.type === 'basic'
  const requiresTokenAuth = definition.source.auth?.type === 'token'
  const tokenPrefix = definition.source.auth?.type === 'token' ? definition.source.auth.prefix ?? '' : ''
  const loginPath = definition.source.auth?.type === 'cookie_session'
    ? new URL((definition.source.auth.steps ?? (definition.source.auth.login ? [definition.source.auth.login] : []))[0]?.url.replace('{url}', 'http://metrics.test').replace('{metrics_url}', 'http://metrics.test') ?? 'http://metrics.test/unconfigured').pathname
    : undefined
  const loginForm = definition.source.auth?.type === 'cookie_session'
    ? (definition.source.auth.steps ?? (definition.source.auth.login ? [definition.source.auth.login] : []))[0]?.form
    : undefined
  const headerNames = Object.keys(definition.source.headers ?? {})
  const sessionAuthorization = definition.source.headers?.Authorization
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

    expect(request.url).toBe(expectedPath)
    if (requiresCookieSession) expect(request.headers.cookie).toContain('metric-session=active')
    if (requiresBasicAuth) expect(request.headers.authorization).toBe(`Basic ${Buffer.from('test-username:test-password').toString('base64')}`)
    if (requiresTokenAuth) expect(request.headers.authorization).toBe(`${tokenPrefix}test-token`)
    for (const name of headerNames) {
      if (name === 'Authorization' && sessionTokenPrefix !== undefined) continue
      expect(request.headers[name.toLowerCase()]).toBe('test-secret')
    }
    if (sessionTokenPrefix !== undefined) expect(request.headers.authorization).toBe(`${sessionTokenPrefix}test-token`)
    response.setHeader('Content-Type', definition.text ? 'text/plain' : 'application/json')
    response.end(definition.text ? String(fixture) : JSON.stringify(fixture))
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await expect(collectCustomMetric(definitionUrl.pathname, loadMetric(definitionUrl, baseUrl))).resolves.toEqual({ value: expected })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
