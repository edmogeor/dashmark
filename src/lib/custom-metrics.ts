import { readFileSync } from 'node:fs'
import * as cheerio from 'cheerio'
import got from 'got'
import { io } from 'socket.io-client'
import { CookieJar } from 'tough-cookie'
import type { CustomMetricReduction, MetricOverride } from './config-file'
import { runJq } from './jq'
import { logger } from './logger'
import type { UptimeObservation, UptimeStatus } from './status'

const REQUEST_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 1_048_576
const MAX_FOR_EACH_ITEMS = 32
const FOR_EACH_CONCURRENCY = 4
const MAX_PAGINATION_PAGES = 32
const cookieJars = new Map<string, CookieJar>()

export type MetricResult = { value: number | string } | { observations: UptimeObservation[] } | { error: string }

function unavailable(key: string, detail: string): MetricResult {
  logger.error('metrics', 'custom metric collection failed', { key, detail })
  return { error: detail }
}

function reduce(values: number[], reduction: CustomMetricReduction | undefined): number | undefined {
  if (values.length === 0 || (!reduction && values.length !== 1)) return undefined
  if (!reduction) return values[0]
  if (reduction === 'count') return values.length
  if (reduction === 'sum' || reduction === 'average') {
    const sum = values.reduce((total, value) => total + value, 0)
    return reduction === 'sum' ? sum : sum / values.length
  }
  if (reduction === 'minimum') return Math.min(...values)
  return Math.max(...values)
}

async function extractJqValue(key: string, document: unknown, metric: MetricOverride): Promise<MetricResult> {
  if (!metric.jq) return unavailable(key, 'jq extractor was not configured')
  try {
    const value = await runJq(metric.jq.expression, document)
    if (metric.valueType === 'string' || metric.valueType === 'state') return typeof value === 'string' ? { value } : unavailable(key, 'jq extraction did not produce a string')
    return typeof value === 'number' && Number.isFinite(value) ? { value } : unavailable(key, 'jq extraction did not produce a finite number')
  } catch {
    return unavailable(key, 'jq extraction failed')
  }
}

async function extractJq(key: string, text: string, metric: MetricOverride): Promise<MetricResult> {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return unavailable(key, 'response is not valid JSON')
  }
  return extractJqValue(key, document, metric)
}

function uptimeTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 100_000_000_000 ? value * 1_000 : value
  if (typeof value === 'string') {
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : undefined
  }
  return undefined
}

function uptimeStatus(value: unknown): UptimeStatus | undefined {
  if (value === true || value === 'up') return 'up'
  if (value === false || value === 'down') return 'down'
  if (value === 'unknown') return 'unknown'
  return undefined
}

async function extractUptime(key: string, text: string, metric: Extract<MetricOverride, { valueType: 'uptime' }>): Promise<MetricResult> {
  try {
    const document = JSON.parse(text)
    return extractUptimeDocument(key, document, metric)
  } catch {
    return unavailable(key, 'response is not valid JSON')
  }
}

async function extractUptimeDocument(key: string, document: unknown, metric: Extract<MetricOverride, { valueType: 'uptime' }>): Promise<MetricResult> {
  try {
    const items = await runJq(metric.jq.expression, document)
    if (!Array.isArray(items)) return unavailable(key, 'uptime observation extraction did not produce an array')
    const observations: UptimeObservation[] = []
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return unavailable(key, 'uptime observation extraction produced an invalid item')
      const observation = item as { timestamp?: unknown; status?: unknown; responseTimeMs?: unknown }
      const timestamp = uptimeTimestamp(observation.timestamp)
      const status = uptimeStatus(observation.status)
      if (timestamp === undefined || !status) return unavailable(key, 'uptime observation timestamp or status is invalid')
      const responseTime = observation.responseTimeMs
      if (responseTime !== undefined && (typeof responseTime !== 'number' || !Number.isFinite(responseTime))) return unavailable(key, 'uptime observation response time is invalid')
      observations.push({ timestamp, status, ...(responseTime === undefined ? {} : { responseTimeMs: responseTime }) })
    }
    return { observations: observations.sort((a, b) => a.timestamp - b.timestamp) }
  } catch {
    return unavailable(key, 'uptime extraction failed')
  }
}

async function collectPaginatedJq(key: string, text: string, metric: MetricOverride, request: (url: URL) => Promise<{ status: number; text: string }>): Promise<MetricResult> {
  if (!metric.pagination || !('jq' in metric)) return unavailable(key, 'pagination requires a jq extractor')
  try {
    const items: unknown[] = []
    let document = JSON.parse(text)
    for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
      const pageItems = await runJq(metric.pagination.items.expression, document)
      if (!Array.isArray(pageItems)) return unavailable(key, 'pagination item extraction did not produce an array')
      items.push(...pageItems)
      const next = await runJq(metric.pagination.next.expression, document)
      if (next === 0 || next === null) {
        return metric.valueType === 'uptime' ? extractUptimeDocument(key, { items }, metric) : extractJqValue(key, { items }, metric)
      }
      if (typeof next !== 'number' || !Number.isInteger(next) || next < 1) return unavailable(key, 'pagination next extraction did not produce a page number')
      const url = new URL(metric.source.url)
      url.searchParams.set('page', String(next))
      const response = await request(url)
      if (response.status < 200 || response.status >= 300) return unavailable(key, `pagination request returned HTTP ${response.status}`)
      document = JSON.parse(response.text)
    }
    return unavailable(key, `pagination exceeded the ${MAX_PAGINATION_PAGES} page limit`)
  } catch {
    return unavailable(key, 'pagination collection failed')
  }
}

async function collectForEachMetric(key: string, text: string, metric: MetricOverride, request: (url: URL) => Promise<{ status: number; text: string }>): Promise<MetricResult> {
  const forEach = metric.forEach
  if (!forEach) return unavailable(key, 'for_each extractor was not configured')

  try {
    const document = JSON.parse(text)
    const extracted = await runJq(forEach.items.expression, document)
    if (!Array.isArray(extracted) || !extracted.every((item) => typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)))) {
      return unavailable(key, 'for_each item extraction did not produce an array of strings or finite numbers')
    }
    const items = [...new Set(extracted.map(String))]
    if (items.length === 0) return unavailable(key, 'for_each item extraction did not produce any items')
    if (items.length > MAX_FOR_EACH_ITEMS) return unavailable(key, `for_each item extraction exceeded the ${MAX_FOR_EACH_ITEMS} item limit`)

    const values: number[] = []
    for (let index = 0; index < items.length; index += FOR_EACH_CONCURRENCY) {
      const batch = await Promise.all(
        items.slice(index, index + FOR_EACH_CONCURRENCY).map(async (item) => {
          const url = new URL(forEach.requestUrl.replaceAll('{item}', encodeURIComponent(item)))
          const response = await request(url)
          if (response.status < 200 || response.status >= 300) throw new Error(`child request returned HTTP ${response.status}`)
          const childDocument = JSON.parse(response.text)
          const value = await runJq(forEach.value.expression, childDocument)
          if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('child value extraction did not produce a finite number')
          return value
        })
      )
      values.push(...batch)
    }
    const value = reduce(values, forEach.reduce)
    return value === undefined ? unavailable(key, 'for_each reduction did not produce a value') : { value }
  } catch {
    return unavailable(key, 'for_each collection failed')
  }
}

function extractText(key: string, text: string, metric: MetricOverride): MetricResult {
  const value = text.trim()
  if (metric.valueType === 'string' || metric.valueType === 'state') return value ? { value } : unavailable(key, 'text extraction did not produce a string')
  const number = Number(value)
  return Number.isFinite(number) ? { value: number } : unavailable(key, 'text extraction did not produce a finite number')
}

function parseLabels(input: string): Record<string, string> | undefined {
  const labels: Record<string, string> = {}
  let index = 0
  while (index < input.length) {
    while (/\s/.test(input[index] ?? '')) index++
    const name = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(input.slice(index))?.[0]
    if (!name) return undefined
    index += name.length
    while (/\s/.test(input[index] ?? '')) index++
    if (input[index++] !== '=') return undefined
    while (/\s/.test(input[index] ?? '')) index++
    if (input[index++] !== '"') return undefined
    let value = ''
    let closed = false
    while (index < input.length) {
      const character = input[index++]
      if (character === '"') {
        closed = true
        break
      }
      if (character === '\\') {
        const escaped = input[index++]
        if (escaped === undefined) return undefined
        value += escaped === 'n' ? '\n' : escaped
      } else value += character
    }
    if (!closed) return undefined
    labels[name] = value
    while (/\s/.test(input[index] ?? '')) index++
    if (index === input.length) break
    if (input[index++] !== ',') return undefined
  }
  return labels
}

function extractPrometheus(key: string, text: string, metric: MetricOverride): MetricResult {
  const extractor = metric.prometheus
  if (!extractor) return unavailable(key, 'Prometheus extractor was not configured')
  const values: number[] = []
  const textValues: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)(?:\s+\d+)?\s*$/.exec(trimmed)
    if (!match || match[1] !== extractor.name) continue
    const labels = match[2] === undefined ? {} : parseLabels(match[2])
    if (!labels || !Object.entries(extractor.labels ?? {}).every(([key, value]) => labels[key] === value)) continue
    if (metric.valueType === 'string' || metric.valueType === 'state') {
      const value = labels[extractor.valueLabel!]
      if (value !== undefined) textValues.push(value)
      continue
    }
    const value = Number(match[3])
    if (Number.isFinite(value)) values.push(value)
  }
  if (metric.valueType === 'string' || metric.valueType === 'state') {
    return textValues.length === 1 ? { value: textValues[0] } : unavailable(key, 'Prometheus extraction did not produce one matching label value')
  }
  const value = reduce(values, extractor.reduce)
  return value === undefined || !Number.isFinite(value) ? unavailable(key, 'Prometheus extraction did not produce the required numeric values') : { value }
}

function transform(key: string, result: MetricResult, metric: MetricOverride): MetricResult {
  if ('error' in result || !('value' in result) || metric.valueType !== 'number' || typeof result.value !== 'number' || !metric.transform) return result
  const value = result.value * (metric.transform.multiply ?? 1) + (metric.transform.add ?? 0)
  return Number.isFinite(value) ? { value } : unavailable(key, 'metric transform did not produce a finite number')
}

function credentialName(reference: { env?: string; file?: string; label?: string }): string {
  return reference.env ?? reference.file ?? reference.label ?? 'unknown credential'
}

type SecretReference = { env?: string; file?: string; label?: string; value?: string }
type TokenReference = { token: string; prefix?: string }
type ValueReference = SecretReference | TokenReference
type RequestValue = ValueReference | string | number | boolean
type JsonValue = RequestValue | null | JsonValue[] | { [key: string]: JsonValue }
type ValueReferences = Record<string, RequestValue>

function isTokenReference(value: unknown): value is TokenReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).every((key) => key === 'token' || key === 'prefix') &&
    typeof (value as TokenReference).token === 'string' &&
    ((value as TokenReference).prefix === undefined || typeof (value as TokenReference).prefix === 'string')
  )
}

function isSecretReference(value: unknown): value is SecretReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => ['env', 'file', 'label', 'value'].includes(key)) &&
    (typeof (value as SecretReference).env === 'string' ||
      typeof (value as SecretReference).file === 'string' ||
      typeof (value as SecretReference).label === 'string' ||
      typeof (value as SecretReference).value === 'string')
  )
}

function resolveReferences(metric: MetricOverride, references: ValueReferences, kind: string, tokens: Record<string, string> = {}): { values?: Record<string, string>; error?: string } {
  const values: Record<string, string> = {}
  for (const [name, reference] of Object.entries(references)) {
    try {
      const isToken = isTokenReference(reference)
      const isReference = isToken || isSecretReference(reference)
      const secret = reference as SecretReference
      const value = isToken
        ? tokens[reference.token] && `${reference.prefix ?? ''}${tokens[reference.token]}`
        : isReference
          ? (secret.value ?? (secret.env === undefined ? readFileSync(secret.file!, 'utf8').trim() : process.env[secret.env]))
          : String(reference)
      if (!value) throw new Error(isToken ? 'authentication token is unavailable' : isReference && secret.env === undefined ? 'secret file is empty' : 'environment variable is unset')
      values[name] = value
    } catch (error) {
      logger.error('metrics', 'failed to resolve custom metric secret', { metric: metric.label, [kind]: name, error: error instanceof Error ? error.message : 'unknown error' })
      return {
        error:
          typeof reference === 'object' && 'token' in reference ? `Authentication token ${reference.token} is unavailable` : `Credential ${credentialName(reference as SecretReference)} is unavailable`
      }
    }
  }
  return { values }
}

function resolveHeaders(metric: MetricOverride, references = metric.source.headers ?? {}, tokens?: Record<string, string>): { headers?: Headers; error?: string } {
  const headers = new Headers()
  const { values, error } = resolveReferences(metric, references, 'header', tokens)
  if (error || !values) return { error }
  for (const [name, value] of Object.entries(values)) headers.set(name, value)
  return { headers }
}

function applyBasicAuth(metric: MetricOverride, headers: Headers): string | undefined {
  const auth = metric.source.auth
  if (!auth || auth.type !== 'basic') return undefined
  const { values, error } = resolveReferences(metric, { username: auth.username, password: auth.password }, 'basic authentication')
  if (error || !values) return error ?? 'Could not resolve basic authentication credentials'
  headers.set('Authorization', `Basic ${Buffer.from(`${values.username!}:${values.password!}`).toString('base64')}`)
  return undefined
}

function applyTokenAuth(metric: MetricOverride, headers: Headers, url: URL): string | undefined {
  const auth = metric.source.auth
  if (!auth || auth.type !== 'token') return undefined
  const { values, error } = resolveReferences(metric, { value: auth.value }, 'token authentication')
  if (error || !values) return error ?? 'Could not resolve token authentication credentials'
  const value = `${auth.prefix ?? ''}${values.value!}`
  if (typeof auth.header === 'string') headers.set(auth.header, value)
  else url.searchParams.set(auth.query, value)
  return undefined
}

function resolveQuery(metric: MetricOverride, url: URL, references = metric.source.query ?? {}, tokens?: Record<string, string>): string | undefined {
  const { values, error } = resolveReferences(metric, references, 'query', tokens)
  if (error || !values) return error
  for (const [name, value] of Object.entries(values)) url.searchParams.set(name, value)
  return undefined
}

async function requestText(
  url: URL,
  headers: Headers,
  cookieJar: CookieJar,
  method: 'GET' | 'POST',
  body?: { form?: Record<string, string>; json?: Record<string, JsonValue> }
): Promise<{ status: number; text: string }> {
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
}

type PreparedMetricRequest = {
  url: URL
  headers: Headers
  body?: { form?: Record<string, string>; json?: Record<string, JsonValue> }
}

async function prepareMetricRequest(
  metric: MetricOverride,
  cookieJar: CookieJar,
  targetUrl: URL,
  authenticated: boolean,
  includeSourceValues: boolean
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
  if (includeSourceValues) {
    const queryError = resolveQuery(metric, url, metric.source.query ?? {}, authResult.tokens)
    if (queryError) return { error: queryError }
    const body = resolveBody(metric, metric.source.form, metric.source.json, authResult.tokens ?? {})
    if (body.error || !body.value) return { error: body.error ?? 'Could not resolve a metric value' }
    return { request: { url, headers, body: body.value } }
  }
  return { request: { url, headers } }
}

async function requestMetric(metric: MetricOverride, cookieJar: CookieJar, targetUrl: URL, includeSourceValues: boolean): Promise<{ response?: { status: number; text: string }; error?: string }> {
  const optional = metric.source.auth?.optional === true
  let prepared = await prepareMetricRequest(metric, cookieJar, targetUrl, !optional, includeSourceValues)
  if (prepared.error || !prepared.request) return { error: prepared.error ?? 'Could not prepare metric request' }
  let response = await requestText(prepared.request.url, prepared.request.headers, cookieJar, includeSourceValues ? (metric.source.method ?? 'GET') : 'GET', prepared.request.body)
  if (!optional || (response.status !== 401 && response.status !== 403)) return { response }

  prepared = await prepareMetricRequest(metric, cookieJar, targetUrl, true, includeSourceValues)
  if (prepared.error || !prepared.request) return { error: `Authentication is required, but ${prepared.error ?? 'credentials are unavailable'}` }
  response = await requestText(prepared.request.url, prepared.request.headers, cookieJar, includeSourceValues ? (metric.source.method ?? 'GET') : 'GET', prepared.request.body)
  return { response }
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

function resolveJson(metric: MetricOverride, value: JsonValue, tokens: Record<string, string>): { value?: JsonValue; error?: string } {
  if (value === null || typeof value !== 'object') return { value }
  if (Array.isArray(value)) {
    const values: JsonValue[] = []
    for (const item of value) {
      const resolved = resolveJson(metric, item, tokens)
      if (resolved.error || resolved.value === undefined) return { error: resolved.error ?? 'Could not resolve a JSON value' }
      values.push(resolved.value)
    }
    return { value: values }
  }
  if (Object.keys(value).length === 1 && '__dashmarkParameterValue' in value) return { value: (value as { __dashmarkParameterValue: JsonValue }).__dashmarkParameterValue }
  if (isTokenReference(value) || isSecretReference(value)) {
    const resolved = resolveReferences(metric, { value: value as ValueReference }, 'body', tokens)
    return resolved.error || !resolved.values ? { error: resolved.error ?? 'Could not resolve a JSON value' } : { value: resolved.values.value! }
  }
  const entries: Record<string, JsonValue> = {}
  for (const [name, item] of Object.entries(value)) {
    const resolved = resolveJson(metric, item, tokens)
    if (resolved.error || resolved.value === undefined) return { error: resolved.error ?? 'Could not resolve a JSON value' }
    entries[name] = resolved.value
  }
  return { value: entries }
}

function resolveBody(
  metric: MetricOverride,
  form: Record<string, RequestValue> | undefined,
  json: Record<string, JsonValue> | undefined,
  tokens: Record<string, string>
): { value?: { form?: Record<string, string>; json?: Record<string, JsonValue> }; error?: string } {
  if (form) {
    const resolved = resolveReferences(metric, form, 'body', tokens)
    return resolved.error || !resolved.values ? { error: resolved.error ?? 'Could not resolve a metric value' } : { value: { form: resolved.values } }
  }
  if (!json) return { value: {} }
  const resolved = resolveJson(metric, json, tokens)
  return resolved.error || !resolved.value || Array.isArray(resolved.value) || typeof resolved.value !== 'object'
    ? { error: resolved.error ?? 'Could not resolve a metric value' }
    : { value: { json: resolved.value as Record<string, JsonValue> } }
}

function socketIoArguments(
  metric: MetricOverride,
  args: (string | number | boolean | { env?: string; file?: string; label?: string; value?: string })[] | undefined
): { values?: (string | number | boolean)[]; error?: string } {
  if (!args) return { values: [] }
  const values: (string | number | boolean)[] = []
  for (const argument of args) {
    if (typeof argument !== 'object') {
      values.push(argument)
      continue
    }
    const resolved = resolveReferences(metric, { argument }, 'Socket.IO argument')
    if (resolved.error || !resolved.values) return { error: resolved.error ?? 'Could not resolve a Socket.IO argument' }
    values.push(resolved.values.argument!)
  }
  return { values }
}

async function collectSocketIoMetric(key: string, metric: MetricOverride, url: URL, headers: Headers, cookieJar: CookieJar): Promise<MetricResult> {
  const socketio = metric.source.socketio
  if (!socketio) return unavailable(key, 'Socket.IO source was not configured')
  const auth = resolveReferences(metric, socketio.auth ?? {}, 'Socket.IO auth')
  if (auth.error || !auth.values) return unavailable(key, auth.error ?? 'Could not resolve a Socket.IO secret')
  const loginArguments = socketIoArguments(metric, socketio.login?.args)
  if (loginArguments.error || !loginArguments.values) return unavailable(key, loginArguments.error ?? 'Could not resolve a Socket.IO argument')
  const requestArguments = socketIoArguments(metric, socketio.request.args)
  if (requestArguments.error || !requestArguments.values) return unavailable(key, requestArguments.error ?? 'Could not resolve a Socket.IO argument')

  const cookie = await cookieJar.getCookieString(url.toString())
  if (cookie) headers.set('Cookie', cookie)
  const extraHeaders = Object.fromEntries(headers)
  const socket = io(url.origin, { autoConnect: false, auth: auth.values, ...(socketio.path ? { path: socketio.path } : {}), ...(Object.keys(extraHeaders).length > 0 ? { extraHeaders } : {}) })
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket.IO connection timed out')), REQUEST_TIMEOUT_MS)
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('connect_error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      socket.connect()
    })
    if (socketio.login) await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(socketio.login.event, ...loginArguments.values)
    const response = await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(socketio.request.event, ...requestArguments.values)
    return transform(key, await extractJqValue(key, response, metric), metric)
  } catch (error) {
    const detail = error instanceof Error ? error.name : 'unknown error'
    logger.error('metrics', 'Socket.IO metric request failed', { key, url: url.origin, error: detail })
    return { error: detail === 'Error' ? 'Socket.IO request failed' : 'Could not reach metric source' }
  } finally {
    socket.disconnect()
  }
}

export async function collectCustomMetric(key: string, metric: MetricOverride): Promise<MetricResult> {
  let url: URL
  try {
    url = new URL(metric.source.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('URL must use HTTP or HTTPS')
  } catch {
    logger.error('metrics', 'custom metric has an invalid source URL', { key })
    return unavailable(key, 'Source URL is invalid')
  }
  try {
    const jarKey = `${key}\0${metric.source.url}`
    const cookieJar = cookieJars.get(jarKey) ?? new CookieJar()
    cookieJars.set(jarKey, cookieJar)
    if (metric.source.transport === 'socketio') {
      const prepared = await prepareMetricRequest(metric, cookieJar, url, true, true)
      if (prepared.error || !prepared.request) return unavailable(key, prepared.error ?? 'Could not prepare metric request')
      return collectSocketIoMetric(key, metric, prepared.request.url, prepared.request.headers, cookieJar)
    }
    const result = await requestMetric(metric, cookieJar, url, true)
    if (result.error || !result.response) return unavailable(key, result.error ?? 'Could not reach metric source')
    const response = result.response
    if (response.status >= 300 && response.status < 400) throw new Error('source redirected')
    if (response.status < 200 || response.status >= 300) {
      logger.error('metrics', 'custom metric source returned an error', { key, url: url.origin + url.pathname, status: response.status })
      return { error: `Source returned HTTP ${response.status}` }
    }
    const extracted = metric.forEach
      ? await collectForEachMetric(key, response.text, metric, async (childUrl) => {
          const child = await requestMetric(metric, cookieJar, childUrl, false)
          if (child.error || !child.response) throw new Error(child.error ?? 'Could not reach metric source')
          return child.response
        })
      : metric.pagination
        ? await collectPaginatedJq(key, response.text, metric, async (pageUrl) => {
            const page = await requestMetric(metric, cookieJar, pageUrl, true)
            if (page.error || !page.response) throw new Error(page.error ?? 'Could not reach metric source')
            return page.response
          })
        : metric.valueType === 'uptime'
          ? await extractUptime(key, response.text, metric)
          : metric.text
            ? extractText(key, response.text, metric)
            : 'jq' in metric
              ? await extractJq(key, response.text, metric)
              : extractPrometheus(key, response.text, metric)
    return transform(key, extracted, metric)
  } catch (error) {
    const detail = error instanceof Error ? error.name : 'unknown error'
    logger.error('metrics', 'custom metric request failed', { key, url: url.origin + url.pathname, error: detail })
    if (detail === 'TimeoutError') return { error: 'Source request timed out' }
    if (detail === 'AbortError') return { error: 'Source request was cancelled' }
    return { error: 'Could not reach metric source' }
  }
}
