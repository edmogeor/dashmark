import type { MetricOverride } from './config-file-types'
import { logger } from './logger'
import type { UptimeObservation } from './status'

export type MetricResult = { value: number | string } | { observations: UptimeObservation[] } | { error: 'collection_failed' }

export function unavailable(key: string, detail: string): MetricResult {
  logger.error('metrics', 'custom metric collection failed', { key, detail })
  return { error: 'collection_failed' }
}

export function transformMetricResult(key: string, result: MetricResult, metric: MetricOverride): MetricResult {
  if ('error' in result || !('value' in result) || metric.valueType !== 'number' || typeof result.value !== 'number' || !metric.transform) return result
  const value = result.value * (metric.transform.multiply ?? 1) + (metric.transform.add ?? 0)
  return Number.isFinite(value) ? { value } : unavailable(key, 'metric transform did not produce a finite number')
}
