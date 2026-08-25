import { readFileSync } from 'node:fs'
import * as cheerio from 'cheerio'
import got from 'got'
import jq from 'node-jq'
import type { JsonInput } from 'node-jq/lib/options'
import { io } from 'socket.io-client'
import { CookieJar } from 'tough-cookie'
import type { CustomMetricReduction, MetricOverride } from './config-file'
import { logger } from './logger'

const REQUEST_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 1_048_576
const MAX_FOR_EACH_ITEMS = 32
const FOR_EACH_CONCURRENCY = 4
const cookieJars = new Map<string, CookieJar>()

export type MetricResult = { value: number | string } | { error: string }

function unavailable(key: string, detail: string): MetricResult {
  logger.error('metrics', 'custom metric collection failed', { key, detail })
  return { error: detail }
}

function reduce(values: number[], reduction: CustomMetricReduction | undefined): number | undefined {
  if (values.length === 0 || (!reduction && values.length !== 1)) return undefined
  if (!reduction) return values[0]
  if (reduction === 'count') return values.length
  if (reduction === 'sum') return values.reduce((sum, value) => sum + value, 0)
  if (reduction === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length
  if (reduction === 'minimum') return Math.min(...values)
  return Math.max(...values)
}

async function extractJqValue(key: string, document: unknown, metric: MetricOverride): Promise<MetricResult> {
  if (!metric.jq) return unavailable(key, 'jq extractor was not configured')
  try {
    const value = await jq.run(metric.jq.expression, document as JsonInput, { input: 'json', output: 'json' })
    if (metric.valueType === 'string' || metric.valueType === 'state') return typeof value === 'string' ? { value } : unavailable(key, 'jq extraction did not produce a string')
    return typeof value === 'number' && Number.isFinite(value)
      ? { value }
      : unavailable(key, 'jq extraction did not produce a finite number')
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

async function collectForEachMetric(key: string, text: string, metric: MetricOverride, headers: Headers, cookieJar: CookieJar): Promise<MetricResult> {
  const forEach = metric.forEach
  if (!forEach) return unavailable(key, 'for_each extractor was not configured')

  try {
    const document = JSON.parse(text) as JsonInput
    const extracted = await jq.run(forEach.items.expression, document, { input: 'json', output: 'json' })
    if (!Array.isArray(extracted) || !extracted.every(item => typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)))) {
      return unavailable(key, 'for_each item extraction did not produce an array of strings or finite numbers')
    }
    const items = [...new Set(extracted.map(String))]
    if (items.length === 0) return unavailable(key, 'for_each item extraction did not produce any items')
    if (items.length > MAX_FOR_EACH_ITEMS) return unavailable(key, `for_each item extraction exceeded the ${MAX_FOR_EACH_ITEMS} item limit`)

    const values: number[] = []
    for (let index = 0; index < items.length; index += FOR_EACH_CONCURRENCY) {
      const batch = await Promise.all(items.slice(index, index + FOR_EACH_CONCURRENCY).map(async item => {
        const url = new URL(forEach.requestUrl.replaceAll('{item}', encodeURIComponent(item)))
        const response = await requestText(url, new Headers(headers), cookieJar, 'GET')
        if (response.status < 200 || response.status >= 300) throw new Error(`child request returned HTTP ${response.status}`)
        const childDocument = JSON.parse(response.text) as JsonInput
        const value = await jq.run(forEach.value.expression, childDocument, { input: 'json', output: 'json' })
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('child value extraction did not produce a finite number')
        return value
      }))
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
      if (character === '"') { closed = true; break }
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
  return value === undefined || !Number.isFinite(value)
    ? unavailable(key, 'Prometheus extraction did not produce the required numeric values')
    : { value }
}

function transform(key: string, result: MetricResult, metric: MetricOverride): MetricResult {
  if ('error' in result || metric.valueType !== 'number' || typeof result.value !== 'number' || !metric.transform) return result
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
  return typeof value === 'object' && value !== null && Object.keys(value).every(key => key === 'token' || key === 'prefix')
    && typeof (value as TokenReference).token === 'string' && ((value as TokenReference).prefix === undefined || typeof (value as TokenReference).prefix === 'string')
}

function isSecretReference(value: unknown): value is SecretReference {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).every(key => ['env', 'file', 'label', 'value'].includes(key))
    && (typeof (value as SecretReference).env === 'string' || typeof (value as SecretReference).file === 'string' || typeof (value as SecretReference).label === 'string' || typeof (value as SecretReference).value === 'string')
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
          ? secret.value ?? (secret.env === undefined ? readFileSync(secret.file!, 'utf8').trim() : process.env[secret.env])
          : String(reference)
      if (!value) throw new Error(isToken ? 'authentication token is unavailable' : isReference && secret.env === undefined ? 'secret file is empty' : 'environment variable is unset')
      values[name] = value
    } catch (error) {
      logger.error('metrics', 'failed to resolve custom metric secret', { metric: metric.label, [kind]: name, error: error instanceof Error ? error.message : 'unknown error' })
      return { error: typeof reference === 'object' && 'token' in reference ? `Authentication token ${reference.token} is unavailable` : `Credential ${credentialName(reference as SecretReference)} is unavailable` }
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

function applyTokenAuth(metric: MetricOverride, headers: Headers): string | undefined {
  const auth = metric.source.auth
  if (!auth || auth.type !== 'token') return undefined
  const { values, error } = resolveReferences(metric, { value: auth.value }, 'token authentication')
  if (error || !values) return error ?? 'Could not resolve token authentication credentials'
  headers.set(auth.header, `${auth.prefix ?? ''}${values.value!}`)
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

async function extractTokens(text: string, extract: NonNullable<Extract<NonNullable<MetricOverride['source']['auth']>, { type: 'cookie_session' }>['steps'][number]['extract']>): Promise<{ tokens?: Record<string, string>; error?: string }> {
  const tokens: Record<string, string> = {}
  for (const [name, extractor] of Object.entries(extract)) {
    if ('jq' in extractor) {
      try {
        const value = await jq.run(extractor.jq, JSON.parse(text) as JsonInput, { input: 'json', output: 'json' })
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

function resolveBody(metric: MetricOverride, form: Record<string, RequestValue> | undefined, json: Record<string, JsonValue> | undefined, tokens: Record<string, string>): { value?: { form?: Record<string, string>; json?: Record<string, JsonValue> }; error?: string } {
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

function socketIoArguments(metric: MetricOverride, args: (string | number | boolean | { env?: string; file?: string; label?: string; value?: string })[] | undefined): { values?: (string | number | boolean)[]; error?: string } {
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
      socket.once('connect', () => { clearTimeout(timer); resolve() })
      socket.once('connect_error', error => { clearTimeout(timer); reject(error) })
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
    const authResult = await login(metric, cookieJar)
    if (authResult.error) return unavailable(key, authResult.error)
    const { headers, error: headerError } = resolveHeaders(metric, metric.source.headers ?? {}, authResult.tokens)
    if (headerError || !headers) return unavailable(key, headerError ?? 'Could not resolve a metric value')
    const basicAuthError = applyBasicAuth(metric, headers)
    if (basicAuthError) return unavailable(key, basicAuthError)
    const tokenAuthError = applyTokenAuth(metric, headers)
    if (tokenAuthError) return unavailable(key, tokenAuthError)
    if (metric.source.transport === 'socketio') return collectSocketIoMetric(key, metric, url, headers, cookieJar)
    const queryError = resolveQuery(metric, url, metric.source.query ?? {}, authResult.tokens)
    if (queryError) return unavailable(key, queryError)
    const body = resolveBody(metric, metric.source.form, metric.source.json, authResult.tokens ?? {})
    if (body.error || !body.value) return unavailable(key, body.error ?? 'Could not resolve a metric value')
    const response = await requestText(url, headers, cookieJar, metric.source.method ?? 'GET', body.value)
    if (response.status >= 300 && response.status < 400) throw new Error('source redirected')
    if (response.status < 200 || response.status >= 300) {
      logger.error('metrics', 'custom metric source returned an error', { key, url: url.origin + url.pathname, status: response.status })
      return { error: `Source returned HTTP ${response.status}` }
    }
    const result = metric.forEach
      ? await collectForEachMetric(key, response.text, metric, headers, cookieJar)
      : metric.text ? extractText(key, response.text, metric) : 'jq' in metric ? await extractJq(key, response.text, metric) : extractPrometheus(key, response.text, metric)
    return transform(key, result, metric)
  } catch (error) {
    const detail = error instanceof Error ? error.name : 'unknown error'
    logger.error('metrics', 'custom metric request failed', { key, url: url.origin + url.pathname, error: detail })
    if (detail === 'TimeoutError') return { error: 'Source request timed out' }
    if (detail === 'AbortError') return { error: 'Source request was cancelled' }
    return { error: 'Could not reach metric source' }
  }
}
