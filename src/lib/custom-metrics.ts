import { readFileSync } from 'node:fs'
import type { CustomMetricReduction, MetricOverride } from './config-file'
import { logger } from './logger'

const REQUEST_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 1_048_576

export type MetricResult = { value: number | string } | { error: string }

function unavailable(key: string, detail: string): MetricResult {
  logger.error('metrics', 'custom metric collection failed', { key, detail })
  return { error: detail }
}

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

function resolvePointer(value: unknown, pointer: string): unknown {
  let current = value
  for (const token of pointer.slice(1).split('/')) {
    const key = decodePointerToken(token)
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(key)) return undefined
      current = current[Number(key)]
    } else if (current !== null && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key]
    } else return undefined
  }
  return current
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

function numbers(values: unknown[]): number[] | undefined {
  const parsed = values.map(value => typeof value === 'number' && Number.isFinite(value) ? value : undefined)
  return parsed.every((value): value is number => value !== undefined) ? parsed : undefined
}

function extractJson(key: string, text: string, metric: MetricOverride): MetricResult {
  const extractor = metric.json
  if (!extractor) return unavailable(key, 'JSON extractor was not configured')
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return unavailable(key, 'response is not valid JSON')
  }
  const selected = resolvePointer(document, extractor.path)
  if (metric.valueType === 'string') {
    return typeof selected === 'string' ? { value: selected } : unavailable(key, 'JSON extraction did not produce a string')
  }
  const entries = Array.isArray(selected) ? selected : [selected]
  const values = numbers(entries.map(entry => extractor.valuePath === undefined ? entry : resolvePointer(entry, extractor.valuePath)))
  const value = values && reduce(values, extractor.reduce)
  return value === undefined || !Number.isFinite(value)
    ? unavailable(key, 'JSON extraction did not produce the required numeric values')
    : { value }
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
    if (metric.valueType === 'string') {
      const value = labels[extractor.valueLabel!]
      if (value !== undefined) textValues.push(value)
      continue
    }
    const value = Number(match[3])
    if (Number.isFinite(value)) values.push(value)
  }
  if (metric.valueType === 'string') {
    return textValues.length === 1 ? { value: textValues[0] } : unavailable(key, 'Prometheus extraction did not produce one matching label value')
  }
  const value = reduce(values, extractor.reduce)
  return value === undefined || !Number.isFinite(value)
    ? unavailable(key, 'Prometheus extraction did not produce the required numeric values')
    : { value }
}

function resolveHeaders(metric: MetricOverride): Headers | undefined {
  const headers = new Headers()
  for (const [name, reference] of Object.entries(metric.source.headers ?? {})) {
    try {
      const value = reference.env === undefined ? readFileSync(reference.file!, 'utf8').trim() : process.env[reference.env]
      if (!value) throw new Error(reference.env === undefined ? 'secret file is empty' : 'environment variable is unset')
      headers.set(name, value)
    } catch (error) {
      logger.error('metrics', 'failed to resolve custom metric secret', { metric: metric.label, header: name, error: error instanceof Error ? error.message : 'unknown error' })
      return undefined
    }
  }
  return headers
}

async function responseText(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error(`response exceeds ${MAX_RESPONSE_BYTES} bytes`)
    }
    chunks.push(value)
  }
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(output)
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
  const headers = resolveHeaders(metric)
  if (!headers) return unavailable(key, 'Could not resolve a metric secret')
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error' })
    if (!response.ok) {
      logger.error('metrics', 'custom metric source returned an error', { key, url: url.origin + url.pathname, status: response.status })
      return { error: `Source returned HTTP ${response.status}` }
    }
    const text = await responseText(response)
    const result = 'json' in metric ? extractJson(key, text, metric) : extractPrometheus(key, text, metric)
    return result
  } catch (error) {
    const detail = error instanceof Error ? error.name : 'unknown error'
    logger.error('metrics', 'custom metric request failed', { key, url: url.origin + url.pathname, error: detail })
    if (detail === 'TimeoutError') return { error: 'Source request timed out' }
    if (detail === 'AbortError') return { error: 'Source request was cancelled' }
    return { error: 'Could not reach metric source' }
  }
}
