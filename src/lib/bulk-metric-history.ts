import { createHash } from 'node:crypto'
import type { UptimeMetricOverride } from './config-file-types'
import { BULK_HISTORY_MAX_RESPONSE_BYTES, METRIC_RECOVERY_MAX_OBSERVATIONS } from './constants'
import { getMetricCookieJar, MetricResponseTooLargeError, requestMetric } from './custom-metric-http'
import { parseUptimeObservations } from './custom-metric-parsing'
import { isRecord } from './errors'
import { runJq } from './jq'
import type { UptimeObservation } from './status'

type BulkPage = Record<string, UptimeObservation[]>
type CachedPage = { page: number; pageSize: number; createdAt: number; result: Promise<BulkPage> }

// ponytail: retain one page per source, capped at four sources; larger fleets can use a byte-budgeted cache.
const pages = new Map<string, CachedPage>()

export function clearBulkHistoryCache(): void {
  pages.clear()
}

async function fetchBulkPage(metric: UptimeMetricOverride, sourceKey: string, page: number, logicalSize: number, cache: CachedPage): Promise<BulkPage> {
  const bulk = metric.pagination!.bulk!
  const source = { ...metric.source, url: bulk.url }
  const bulkMetric = { ...metric, source }
  const jar = getMetricCookieJar(sourceKey, bulk.url)
  while (true) {
    try {
      const result: BulkPage = Object.create(null)
      const count = logicalSize / cache.pageSize
      for (let offset = 0; offset < count; offset++) {
        const query = {
          ...source.query,
          [metric.pagination!.pageParameter ?? 'page']: (page - 1) * count + offset + 1,
          [bulk.pageSizeParameter]: cache.pageSize
        }
        const response = await requestMetric(bulkMetric, jar, new URL(source.url), true, query, BULK_HISTORY_MAX_RESPONSE_BYTES)
        if (response.error || !response.response || response.response.status < 200 || response.response.status >= 300) throw new Error('Bulk history page unavailable')
        const extracted = await runJq(`${cache.pageSize} as $pageSize | (${bulk.jq.expression})`, JSON.parse(response.response.text))
        if (!isRecord(extracted)) throw new Error('Bulk history extractor must return a mapping of keys to observations')
        for (const [key, items] of Object.entries(extracted)) {
          if (!Array.isArray(items) || items.length > cache.pageSize) throw new Error('Bulk history observations exceed the page size')
          const parsed = parseUptimeObservations(key, items)
          if (!('observations' in parsed)) throw new Error('Invalid bulk history observations')
          const observations = (result[key] ??= [])
          observations.push(...parsed.observations)
        }
      }
      for (const observations of Object.values(result)) observations.sort((left, right) => left.timestamp - right.timestamp)
      return result
    } catch (error) {
      if (!(error instanceof MetricResponseTooLargeError) || cache.pageSize % 2 !== 0) throw error
      cache.pageSize /= 2
    }
  }
}

export async function collectBulkHistory(metric: UptimeMetricOverride, page: number): Promise<{ observations: UptimeObservation[]; nextPage?: number }> {
  const bulk = metric.pagination?.bulk
  if (!bulk) throw new Error('Bulk history is not configured')
  const pageSize = Number(metric.source.query?.[bulk.pageSizeParameter])
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > METRIC_RECOVERY_MAX_OBSERVATIONS) throw new Error('Invalid bulk history page size')
  const sourceKey = createHash('sha256')
    .update(JSON.stringify({ source: { ...metric.source, url: bulk.url }, jq: bulk.jq, pageParameter: metric.pagination?.pageParameter }))
    .digest('hex')
  const previous = pages.get(sourceKey)
  let cached = previous
  if (!cached || cached.page !== page || Date.now() - cached.createdAt > 60_000) {
    cached = { page, pageSize: previous?.pageSize ?? pageSize, createdAt: Date.now(), result: Promise.resolve({}) }
    cached.result = fetchBulkPage(metric, sourceKey, page, pageSize, cached)
    pages.delete(sourceKey)
    pages.set(sourceKey, cached)
    if (pages.size > 4) pages.delete(pages.keys().next().value!)
  }
  const observations = (await cached.result)[bulk.key]
  if (!observations) throw new Error('Metric is missing from bulk history')
  return { observations, ...(observations.length === pageSize ? { nextPage: page + 1 } : {}) }
}
