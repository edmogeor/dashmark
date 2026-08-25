import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { expect } from 'vitest'
import { collectCustomMetric } from '@/lib/custom-metrics'
import type { MetricOverride } from '@/lib/config-file'

type MetricDefinition = {
  label: string
  unit?: string
  chart?: 'step' | 'line' | 'area' | 'none'
  chart_group?: string
  transform?: { multiply?: number; add?: number }
  jq: string
  source: {
    url: string
    headers?: Record<string, unknown>
    auth?:
      | { type: 'basic'; username: unknown; password: unknown }
      | { type: 'cookie_session'; login: { url: string; method: 'POST'; form: Record<string, unknown> } }
  }
}

function loadMetric(definitionUrl: URL, baseUrl: string): MetricOverride {
  const definition = yaml.load(readFileSync(definitionUrl, 'utf8')) as MetricDefinition
  const source = definition.source
  const headers = source.headers && Object.fromEntries(Object.keys(source.headers).map(name => [name, { value: 'test-secret' }]))
  const basic = source.auth?.type === 'basic'
    ? { type: 'basic' as const, username: { value: 'test-username' }, password: { value: 'test-password' } }
    : undefined
  const login = source.auth?.type === 'cookie_session' ? source.auth.login : undefined

  return {
    label: definition.label,
    valueType: 'number',
    unit: definition.unit ?? 'number',
    chart: definition.chart ?? 'step',
    ...(definition.chart_group ? { chartGroup: definition.chart_group } : {}),
    ...(definition.transform ? { transform: definition.transform } : {}),
    source: {
      url: source.url.replace('{url}', baseUrl).replace('{metrics_url}', baseUrl),
      ...(headers ? { headers } : {}),
      ...(basic ? { auth: basic } : {}),
      ...(login
        ? {
            auth: {
              type: 'cookie_session',
              steps: [{
                url: login.url.replace('{url}', baseUrl).replace('{metrics_url}', baseUrl),
                method: login.method,
                form: Object.fromEntries(Object.keys(login.form).map(name => [name, { value: `test-${name}` }]))
              }]
            }
          }
        : {})
    },
    jq: { expression: definition.jq }
  } as MetricOverride
}

export async function expectFixtureMetric(definitionUrl: URL, fixture: unknown, expected: number): Promise<void> {
  const definition = yaml.load(readFileSync(definitionUrl, 'utf8')) as MetricDefinition
  const expectedPath = new URL(definition.source.url.replace('{url}', 'http://metrics.test').replace('{metrics_url}', 'http://metrics.test')).pathname
  const requiresCookieSession = definition.source.auth?.type === 'cookie_session'
  const requiresBasicAuth = definition.source.auth?.type === 'basic'
  const headerNames = Object.keys(definition.source.headers ?? {})
  const server = createServer((request, response) => {
    if (request.url === '/api/v2/auth/login') {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        expect(body).toBe('username=test-username&password=test-password')
        response.setHeader('Set-Cookie', 'metric-session=active; Path=/')
        response.end('Ok.')
      })
      return
    }

    expect(request.url).toBe(expectedPath)
    if (requiresCookieSession) expect(request.headers.cookie).toContain('metric-session=active')
    if (requiresBasicAuth) expect(request.headers.authorization).toBe(`Basic ${Buffer.from('test-username:test-password').toString('base64')}`)
    for (const name of headerNames) expect(request.headers[name.toLowerCase()]).toBe('test-secret')
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(fixture))
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await expect(collectCustomMetric(definitionUrl.pathname, loadMetric(definitionUrl, baseUrl))).resolves.toEqual({ value: expected })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
