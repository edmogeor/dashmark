import { createHash } from 'node:crypto'
import type { AppConfig } from './config'
import type { UptimeMetricOverride } from './config-file-types'
import { METRIC_RECOVERY_MAX_STALLED_PAGES, PAGINATED_UPTIME_RECOVERY_SOURCE_PREFIX } from './constants'
import { collectCustomMetric } from './custom-metrics'
import { isRecord } from './errors'
import { cancelMetricRecovery, savedMetricRecovery } from './metric-recovery'
import { enqueueUptimeRecovery } from './uptime-recovery'
import type { UptimeObservation } from './status'

type Checkpoint = { page: number; boundary: number; oldest: number; stalled: number }

function parseCheckpoint(text: string): Checkpoint {
  const value: unknown = JSON.parse(text)
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.page) ||
    Number(value.page) < 2 ||
    typeof value.boundary !== 'number' ||
    !Number.isFinite(value.boundary) ||
    typeof value.oldest !== 'number' ||
    !Number.isFinite(value.oldest) ||
    !Number.isSafeInteger(value.stalled) ||
    Number(value.stalled) < 0
  )
    throw new Error('Invalid history recovery checkpoint')
  return { page: Number(value.page), boundary: value.boundary, oldest: value.oldest, stalled: Number(value.stalled) }
}

export function queuePaginatedUptimeRecovery(
  config: AppConfig,
  cardId: string,
  key: string,
  metric: UptimeMetricOverride,
  observations: UptimeObservation[],
  nextPage: number | undefined,
  latestTimestamp: number | undefined,
  retentionMs: number
): void {
  if (!metric.pagination?.recover) return cancelMetricRecovery(config, cardId, key, PAGINATED_UPTIME_RECOVERY_SOURCE_PREFIX)
  const source = `${PAGINATED_UPTIME_RECOVERY_SOURCE_PREFIX}${createHash('sha256')
    .update(JSON.stringify({ source: metric.source, jq: metric.jq, pagination: metric.pagination }))
    .digest('hex')}`
  const saved = savedMetricRecovery(config, cardId, key, source)
  let checkpoint = saved === undefined ? undefined : parseCheckpoint(saved)
  const oldest = observations[0]?.timestamp
  if (oldest !== undefined && nextPage !== undefined && (latestTimestamp === undefined || oldest > latestTimestamp)) {
    checkpoint = { page: nextPage, boundary: Math.min(checkpoint?.boundary ?? Infinity, latestTimestamp ?? Date.now() - retentionMs), oldest, stalled: 0 }
  }
  if (!checkpoint) return
  enqueueUptimeRecovery(config, cardId, key, source, JSON.stringify(checkpoint), retentionMs, async (text, retentionCutoff) => {
    const current = parseCheckpoint(text)
    const cutoff = Math.max(current.boundary, retentionCutoff)
    if (current.oldest <= cutoff) return { observations: [] }
    const pageMetric = { ...metric, source: { ...metric.source, query: { ...metric.source.query, [metric.pagination?.pageParameter ?? 'page']: current.page } } }
    const result = await collectCustomMetric(key, pageMetric)
    if (!('observations' in result)) throw new Error('History page unavailable')
    const page = result.observations
    const first = page[0]?.timestamp
    const stalled = first !== undefined && first >= current.oldest ? current.stalled + 1 : 0
    if (stalled >= METRIC_RECOVERY_MAX_STALLED_PAGES) throw new Error('History pagination is not advancing')
    // Recovery requires newest-first pages. New observations can shift pages, so overlaps are deduplicated in SQLite.
    const complete = first === undefined || first <= cutoff || result.nextPage === undefined
    return {
      nextCheckpoint: complete ? undefined : JSON.stringify({ ...current, page: result.nextPage, oldest: Math.min(current.oldest, first), stalled }),
      observations: page
    }
  })
}
