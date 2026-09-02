import * as cheerio from 'cheerio'
import got from 'got'
import { CookieJar } from 'tough-cookie'
import type { MetricOverride } from './config-file-types'
import { applyBasicAuth, applyTokenAuth, type JsonValue, resolveBody, resolveHeaders, resolveQuery } from './custom-metric-references'
import { runJq } from './jq'

const REQUEST_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 1_048_576
const REQUESTS_PER_ORIGIN = 2
const cookieJars = new Map<string, CookieJar>()
const requestSemaphores = new Map<string, { active: number; waiting: (() => void)[] }>()

type RequestBody = { form?: Record<string, string>; json?: Record<string, JsonValue> }
type PreparedMetricRequest = { url: URL; headers: Headers; body?: RequestBody }
type HttpResponse = { status: number; text: string }

async function queueRequest<T>(origin: string, request: () => Promise<T>): Promise<T> {
  const semaphore = requestSemaphores.get(origin) ?? { active: 0, waiting: [] }
  requestSemaphores.set(origin, semaphore)
  if (semaphore.active >= REQUESTS_PER_ORIGIN) await new Promise<void>((resolve) => semaphore.waiting.push(resolve))
  semaphore.active++
  try {
    return await request()
  } finally {
    semaphore.active--
    const next = semaphore.waiting.shift()
    if (next) next()
    else if (semaphore.active === 0) requestSemaphores.delete(origin)
  }
}

export function getMetricCookieJar(key: string, url: string): CookieJar {
  const jarKey = `${key}\0${url}`
  const cookieJar = cookieJars.get(jarKey) ?? new CookieJar()
  cookieJars.set(jarKey, cookieJar)
  return cookieJar
}

async function requestText(url: URL, headers: Headers, cookieJar: CookieJar, method: 'GET' | 'POST', body?: RequestBody): Promise<HttpResponse> {
  return queueRequest(url.origin, async () => {
    const controller = new AbortController()
    let responseTooLarge = false
    const request = got(url, {
      headers: Object.fromEntries(headers),
      cookieJar,
      followRedirect: false,
      retry: { limit: 0 },
      throwHttpErrors: false,
      timeout: { request: REQUEST_TIMEOUT_MS },
      signal: controller.signal,
      resolveBodyOnly: false,
      responseType: 'buffer',
      method,
      ...(body?.form ? { form: body.form } : {}),
      ...(body?.json ? { json: body.json } : {})
    })
    request.on('downloadProgress', ({ total, transferred }) => {
      if ((total !== undefined && total > MAX_RESPONSE_BYTES) || transferred > MAX_RESPONSE_BYTES) {
        responseTooLarge = true
        controller.abort()
      }
    })
    try {
      const response = await request
      return { status: response.statusCode, text: Buffer.from(response.body).toString() }
    } catch (error) {
      if (responseTooLarge) throw new Error(`response exceeds ${MAX_RESPONSE_BYTES} bytes`)
      throw error
    }
  })
}

async function extractTokens(
  text: string,
  extract: NonNullable<Extract<NonNullable<MetricOverride['source']['auth']>, { type: 'cookie_session' }>['steps'][number]['extract']>
): Promise<{ tokens?: Record<string, string>; error?: string }> {
  const tokens: Record<string, string> = {}
  for (const [name, extractor] of Object.entries(extract)) {
    if ('jq' in extractor) {
      try {
        const value = await runJq(extractor.jq, JSON.parse(text))
        if (typeof value !== 'string' || !value) return { error: `Token ${name} was not found` }
        tokens[name] = value
      } catch {
        return { error: `Token ${name} could not be extracted from JSON` }
      }
    } else {
      const element = cheerio.load(text)(extractor.cheerio.selector).first()
      const value = extractor.cheerio.attribute === undefined ? element.text() : element.attr(extractor.cheerio.attribute)
      if (!value) return { error: `Token ${name} was not found` }
      tokens[name] = value
    }
  }
  return { tokens }
}

async function login(metric: MetricOverride, cookieJar: CookieJar): Promise<{ tokens?: Record<string, string>; error?: string }> {
  const auth = metric.source.auth
  if (!auth || auth.type !== 'cookie_session') return { tokens: {} }
  const tokens: Record<string, string> = {}
  for (const step of auth.steps) {
    const url = new URL(step.url)
    const { headers, error: headerError } = resolveHeaders(metric, step.headers ?? {}, tokens)
    if (headerError || !headers) return { error: headerError ?? 'Could not resolve an authentication value' }
    const queryError = resolveQuery(metric, url, step.query ?? {}, tokens)
    if (queryError) return { error: queryError }
    const body = resolveBody(metric, step.form, step.json, tokens)
    if (body.error || !body.value) return { error: body.error ?? 'Could not resolve an authentication value' }
    const response = await requestText(url, headers, cookieJar, step.method ?? 'GET', body.value)
    if (response.status < 200 || response.status >= 300) return { error: `Authentication returned HTTP ${response.status}` }
    if (step.extract) {
      const result = await extractTokens(response.text, step.extract)
      if (result.error || !result.tokens) return { error: result.error ?? 'Authentication token extraction failed' }
      Object.assign(tokens, result.tokens)
    }
  }
  return { tokens }
}

export async function prepareMetricRequest(
  metric: MetricOverride,
  cookieJar: CookieJar,
  targetUrl: URL,
  authenticated: boolean,
  includeSourceValues: boolean,
  query = metric.source.query
): Promise<{ request?: PreparedMetricRequest; error?: string }> {
  const authResult = authenticated ? await login(metric, cookieJar) : { tokens: {} }
  if (authResult.error) return { error: authResult.error }
  const url = new URL(targetUrl)
  const { headers, error: headerError } = resolveHeaders(metric, metric.source.headers ?? {}, authResult.tokens)
  if (headerError || !headers) return { error: headerError ?? 'Could not resolve a metric value' }
  if (authenticated) {
    const basicAuthError = applyBasicAuth(metric, headers)
    if (basicAuthError) return { error: basicAuthError }
    const tokenAuthError = applyTokenAuth(metric, headers, url)
    if (tokenAuthError) return { error: tokenAuthError }
  }
  if (!includeSourceValues) return { request: { url, headers } }
  const queryError = resolveQuery(metric, url, query ?? {}, authResult.tokens)
  if (queryError) return { error: queryError }
  const body = resolveBody(metric, metric.source.form, metric.source.json, authResult.tokens ?? {})
  if (body.error || !body.value) return { error: body.error ?? 'Could not resolve a metric value' }
  return { request: { url, headers, body: body.value } }
}

export async function requestMetric(
  metric: MetricOverride,
  cookieJar: CookieJar,
  targetUrl: URL,
  includeSourceValues: boolean,
  query = metric.source.query
): Promise<{ response?: HttpResponse; error?: string }> {
  const optional = metric.source.auth?.optional === true
  let prepared = await prepareMetricRequest(metric, cookieJar, targetUrl, !optional, includeSourceValues, query)
  if (prepared.error || !prepared.request) return { error: prepared.error ?? 'Could not prepare metric request' }
  let response = await requestText(prepared.request.url, prepared.request.headers, cookieJar, includeSourceValues ? (metric.source.method ?? 'GET') : 'GET', prepared.request.body)
  if (!optional || (response.status !== 401 && response.status !== 403)) return { response }
  prepared = await prepareMetricRequest(metric, cookieJar, targetUrl, true, includeSourceValues, query)
  if (prepared.error || !prepared.request) return { error: `Authentication is required, but ${prepared.error ?? 'credentials are unavailable'}` }
  response = await requestText(prepared.request.url, prepared.request.headers, cookieJar, includeSourceValues ? (metric.source.method ?? 'GET') : 'GET', prepared.request.body)
  return { response }
}
