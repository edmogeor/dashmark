import type { MetricOverride } from './config-file-types'
import { getMetricCookieJar, prepareMetricRequest, requestMetric } from './custom-metric-http'
import { collectForEachMetric, collectPaginatedJq, extractJq, extractPrometheus, extractText, extractUptime } from './custom-metric-parsing'
import { transformMetricResult, unavailable, type MetricResult } from './custom-metric-result'
import { collectSocketIoMetric } from './custom-metric-socketio'
import { logger } from './logger'

export type { MetricResult } from './custom-metric-result'

export async function collectCustomMetric(key: string, metric: MetricOverride, bootstrap = false): Promise<MetricResult> {
  let url: URL
  try {
    url = new URL(metric.source.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('URL must use HTTP or HTTPS')
  } catch {
    logger.error('metrics', 'custom metric has an invalid source URL', { key })
    return unavailable(key, 'Source URL is invalid')
  }
  try {
    const cookieJar = getMetricCookieJar(key, metric.source.url)
    if (metric.source.transport === 'socketio') {
      const prepared = await prepareMetricRequest(metric, cookieJar, url, true, true)
      if (prepared.error || !prepared.request) return unavailable(key, prepared.error ?? 'Could not prepare metric request')
      return collectSocketIoMetric(key, metric, prepared.request.url, prepared.request.headers, cookieJar)
    }
    const query = bootstrap ? { ...metric.source.query, ...metric.source.initialQuery } : metric.source.query
    const result = await requestMetric(metric, cookieJar, url, true, query)
    if (result.error || !result.response) return unavailable(key, result.error ?? 'Could not reach metric source')
    const response = result.response
    if (response.status >= 300 && response.status < 400) throw new Error('source redirected')
    if (response.status < 200 || response.status >= 300) {
      logger.error('metrics', 'custom metric source returned an error', { key, url: url.origin + url.pathname, status: response.status })
      return { error: 'collection_failed' }
    }
    const extracted = metric.forEach
      ? await collectForEachMetric(key, response.text, metric, async (childUrl) => {
          const child = await requestMetric(metric, cookieJar, childUrl, false)
          if (child.error || !child.response) throw new Error(child.error ?? 'Could not reach metric source')
          return child.response
        })
      : metric.pagination
        ? await collectPaginatedJq(
            key,
            response.text,
            metric,
            async (pageUrl) => {
              const page = await requestMetric(metric, cookieJar, pageUrl, true, query)
              if (page.error || !page.response) throw new Error(page.error ?? 'Could not reach metric source')
              return page.response
            },
            !metric.pagination.initialOnly || bootstrap
          )
        : metric.valueType === 'uptime'
          ? await extractUptime(key, response.text, metric)
          : metric.text
            ? extractText(key, response.text, metric)
            : 'jq' in metric
              ? await extractJq(key, response.text, metric)
              : extractPrometheus(key, response.text, metric)
    return transformMetricResult(key, extracted, metric)
  } catch (error) {
    const detail = error instanceof Error ? error.name : 'unknown error'
    logger.error('metrics', 'custom metric request failed', { key, url: url.origin + url.pathname, error: detail })
    return { error: 'collection_failed' }
  }
}
