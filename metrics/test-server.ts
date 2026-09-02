import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect } from 'vitest'
import type { MetricDefinition } from './fixture-loader'
import { resolveUrl, resolvedJsonRequestValues } from './test-metric'

type TestServerOptions = {
  definition: MetricDefinition
  source: MetricDefinition['source']
  parameters: Record<string, string>
  fixture: unknown
}

export async function startMetricTestServer({ definition, source, parameters, fixture }: TestServerOptions): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const expectedUrl = new URL(resolveUrl(source.url, 'http://metrics.test', parameters))
  for (const name of Object.keys(source.query ?? {})) expectedUrl.searchParams.set(name, 'test-secret')
  if (source.authentication?.kind === 'token' && typeof source.authentication.query === 'string') expectedUrl.searchParams.set(source.authentication.query, 'test-token')
  const expectedPath = `${expectedUrl.pathname}${expectedUrl.search}`
  const requiresCookieSession = source.authentication?.kind === 'cookie_session'
  const requiresBasicAuth = source.authentication?.kind === 'basic'
  const requiresTokenAuth = source.authentication?.kind === 'token'
  const tokenPrefix = source.authentication?.kind === 'token' ? (source.authentication.prefix ?? '') : ''
  const tokenHeader = source.authentication?.kind === 'token' && 'header' in source.authentication ? source.authentication.header : undefined
  const tokenQuery = source.authentication?.kind === 'token' && 'query' in source.authentication ? source.authentication.query : undefined
  const optionalAuthentication = source.authentication?.optional === true
  const loginPath =
    source.authentication?.kind === 'cookie_session'
      ? new URL(source.authentication.requests[0]?.url.replace('{url}', 'http://metrics.test').replace('{metric_source}', 'http://metrics.test') ?? 'http://metrics.test/unconfigured').pathname
      : undefined
  const loginForm = source.authentication?.kind === 'cookie_session' ? source.authentication.requests[0]?.form : undefined
  const loginJson = source.authentication?.kind === 'cookie_session' ? source.authentication.requests[0]?.json : undefined
  const headerNames = Object.keys(source.headers ?? {})
  const sessionAuthorization = source.headers?.Authorization
  const sessionAuthorizationReference = sessionAuthorization as { token?: unknown; prefix?: unknown } | undefined
  const sessionTokenPrefix = typeof sessionAuthorizationReference?.token === 'string' && typeof sessionAuthorizationReference.prefix === 'string' ? sessionAuthorizationReference.prefix : undefined
  const server = createServer((request, response) => {
    if (request.url === loginPath) {
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        if (loginForm) expect(body).toBe(new URLSearchParams(Object.keys(loginForm).map((name) => [name, `test-${name}`])).toString())
        if (loginJson) expect(JSON.parse(body)).toEqual(resolvedJsonRequestValues(loginJson))
        response.setHeader('Set-Cookie', 'metric-session=active; Path=/')
        response.end('{"token":"test-token"}')
      })
      return
    }

    if (definition.extract.for_each && request.url !== expectedPath) {
      if (optionalAuthentication && request.headers['x-plex-token'] !== 'test-token') {
        response.statusCode = 401
        response.end()
        return
      }
      expect(request.headers['x-plex-token']).toBe('test-token')
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ MediaContainer: { size: 2 } }))
      return
    }
    const hasAuthentication =
      (requiresCookieSession && request.headers.cookie?.includes('metric-session=active')) ||
      (requiresBasicAuth && request.headers.authorization === `Basic ${Buffer.from('test-username:test-password').toString('base64')}`) ||
      (requiresTokenAuth &&
        (tokenQuery ? new URL(request.url ?? '/', 'http://metrics.test').searchParams.get(tokenQuery) === 'test-token' : request.headers[tokenHeader!.toLowerCase()] === `${tokenPrefix}test-token`))
    if (optionalAuthentication && !hasAuthentication) {
      response.statusCode = 401
      response.end()
      return
    }
    expect(request.url).toBe(expectedPath)
    if (requiresCookieSession) expect(request.headers.cookie).toContain('metric-session=active')
    if (requiresBasicAuth) expect(request.headers.authorization).toBe(`Basic ${Buffer.from('test-username:test-password').toString('base64')}`)
    if (requiresTokenAuth && tokenQuery) expect(new URL(request.url ?? '/', 'http://metrics.test').searchParams.get(tokenQuery)).toBe('test-token')
    if (requiresTokenAuth && !tokenQuery) expect(request.headers[tokenHeader!.toLowerCase()]).toBe(`${tokenPrefix}test-token`)
    for (const name of headerNames) {
      if (name === 'Authorization' && sessionTokenPrefix !== undefined) continue
      expect(request.headers[name.toLowerCase()]).toBe('test-secret')
    }
    if (sessionTokenPrefix !== undefined) expect(request.headers.authorization).toBe(`${sessionTokenPrefix}test-token`)
    response.setHeader('Content-Type', definition.extract.text ? 'text/plain' : 'application/json')
    response.end(definition.extract.text ? String(fixture) : JSON.stringify(fixture))
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}
