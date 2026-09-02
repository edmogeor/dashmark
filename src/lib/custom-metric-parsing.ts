import type { CustomMetricReduction, MetricOverride } from './config-file-types'
import { isRecord } from './errors'
import { runJq } from './jq'
import { unavailable, type MetricResult } from './custom-metric-result'
import type { UptimeObservation, UptimeStatus } from './status'

const MAX_FOR_EACH_ITEMS = 32
const FOR_EACH_CONCURRENCY = 4
const MAX_PAGINATION_PAGES = 32

type TextResponse = { status: number; text: string }
type Request = (url: URL) => Promise<TextResponse>

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

export async function extractJqValue(key: string, document: unknown, metric: MetricOverride): Promise<MetricResult> {
  if (!metric.jq) return unavailable(key, 'jq extractor was not configured')
  try {
    const value = await runJq(metric.jq.expression, document)
    if (metric.valueType === 'string' || metric.valueType === 'state') return typeof value === 'string' ? { value } : unavailable(key, 'jq extraction did not produce a string')
    return typeof value === 'number' && Number.isFinite(value) ? { value } : unavailable(key, 'jq extraction did not produce a finite number')
  } catch {
    return unavailable(key, 'jq extraction failed')
  }
}

export async function extractJq(key: string, text: string, metric: MetricOverride): Promise<MetricResult> {
  try {
    return extractJqValue(key, JSON.parse(text), metric)
  } catch {
    return unavailable(key, 'response is not valid JSON')
  }
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

export async function extractUptime(key: string, text: string, metric: Extract<MetricOverride, { valueType: 'uptime' }>): Promise<MetricResult> {
  try {
    return extractUptimeDocument(key, JSON.parse(text), metric)
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
      if (!isRecord(item)) return unavailable(key, 'uptime observation extraction produced an invalid item')
      const timestamp = uptimeTimestamp(item.timestamp)
      const status = uptimeStatus(item.status)
      if (timestamp === undefined || !status) return unavailable(key, 'uptime observation timestamp or status is invalid')
      const responseTime = item.responseTimeMs
      if (responseTime !== undefined && (typeof responseTime !== 'number' || !Number.isFinite(responseTime))) return unavailable(key, 'uptime observation response time is invalid')
      observations.push({ timestamp, status, ...(responseTime === undefined ? {} : { responseTimeMs: responseTime }) })
    }
    return { observations: observations.sort((a, b) => a.timestamp - b.timestamp) }
  } catch {
    return unavailable(key, 'uptime extraction failed')
  }
}

export async function collectPaginatedJq(key: string, text: string, metric: MetricOverride, request: Request): Promise<MetricResult> {
  if (!metric.pagination || !('jq' in metric)) return unavailable(key, 'pagination requires a jq extractor')
  try {
    const items: unknown[] = []
    let document = JSON.parse(text)
    for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
      const pageItems = await runJq(metric.pagination.items.expression, document)
      if (!Array.isArray(pageItems)) return unavailable(key, 'pagination item extraction did not produce an array')
      items.push(...pageItems)
      const next = await runJq(metric.pagination.next.expression, document)
      if (next === 0 || next === null) return metric.valueType === 'uptime' ? extractUptimeDocument(key, { items }, metric) : extractJqValue(key, { items }, metric)
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

export async function collectForEachMetric(key: string, text: string, metric: MetricOverride, request: Request): Promise<MetricResult> {
  const forEach = metric.forEach
  if (!forEach) return unavailable(key, 'for_each extractor was not configured')
  try {
    const extracted = await runJq(forEach.items.expression, JSON.parse(text))
    if (!Array.isArray(extracted) || !extracted.every((item) => typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item))))
      return unavailable(key, 'for_each item extraction did not produce an array of strings or finite numbers')
    const items = [...new Set(extracted.map(String))]
    if (items.length === 0) return unavailable(key, 'for_each item extraction did not produce any items')
    if (items.length > MAX_FOR_EACH_ITEMS) return unavailable(key, `for_each item extraction exceeded the ${MAX_FOR_EACH_ITEMS} item limit`)
    const values: number[] = []
    for (let index = 0; index < items.length; index += FOR_EACH_CONCURRENCY) {
      const batch = await Promise.all(
        items.slice(index, index + FOR_EACH_CONCURRENCY).map(async (item) => {
          const response = await request(new URL(forEach.requestUrl.replaceAll('{item}', encodeURIComponent(item))))
          if (response.status < 200 || response.status >= 300) throw new Error(`child request returned HTTP ${response.status}`)
          const value = await runJq(forEach.value.expression, JSON.parse(response.text))
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

export function extractText(key: string, text: string, metric: MetricOverride): MetricResult {
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

export function extractPrometheus(key: string, text: string, metric: MetricOverride): MetricResult {
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
    if (!labels || !Object.entries(extractor.labels ?? {}).every(([name, value]) => labels[name] === value)) continue
    if (metric.valueType === 'string' || metric.valueType === 'state') {
      const value = labels[extractor.valueLabel!]
      if (value !== undefined) textValues.push(value)
      continue
    }
    const value = Number(match[3])
    if (Number.isFinite(value)) values.push(value)
  }
  if (metric.valueType === 'string' || metric.valueType === 'state')
    return textValues.length === 1 ? { value: textValues[0] } : unavailable(key, 'Prometheus extraction did not produce one matching label value')
  const value = reduce(values, extractor.reduce)
  return value === undefined || !Number.isFinite(value) ? unavailable(key, 'Prometheus extraction did not produce the required numeric values') : { value }
}
