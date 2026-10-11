import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getConfig } from '@/lib/config'
import { METRIC_RECOVERY_MAX_OBSERVATIONS } from '@/lib/constants'
import { clearMetricsDatabase } from '@/lib/metrics'
import { getUptimeObservationHistory } from '@/lib/metrics-storage'
import { clearMetricRecoveryQueue, metricRecoveryStates, recoverNextMetric, savedMetricRecovery } from '@/lib/metric-recovery'
import { enqueueUptimeRecovery } from '@/lib/uptime-recovery'
import { queuePaginatedUptimeRecovery } from '@/lib/paginated-uptime-recovery'

beforeEach(() => vi.stubEnv('ENABLE_METRIC_BACKFILL', 'true'))

afterEach(() => {
  clearMetricsDatabase()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('persists bounded batches with opaque time-window checkpoints independent of pagination and ordering', async () => {
  const config = getConfig()
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const checkpoint = JSON.stringify({ before: new Date(now).toISOString(), cursor: 'opaque-token' })
  const next = JSON.stringify({ before: new Date(now - 30_000).toISOString(), cursor: 'different-token' })
  const fetchBatch = vi.fn(async () => ({
    observations: [
      { timestamp: now - 1_000, status: 'up' as const },
      { timestamp: now - 120_000, status: 'down' as const },
      { timestamp: now - 30_000, status: 'unknown' as const },
      { timestamp: now + 1_000, status: 'up' as const }
    ],
    nextCheckpoint: next
  }))
  enqueueUptimeRecovery(config, 'a', 'any/uptime', 'time-window:source', checkpoint, 60_000, fetchBatch)
  await recoverNextMetric(config)
  expect(fetchBatch).toHaveBeenCalledExactlyOnceWith(checkpoint, now - 60_000)
  expect(savedMetricRecovery(config, 'a', 'any/uptime', 'time-window:source')).toBe(next)
  expect(getUptimeObservationHistory(config, 'a', 'any/uptime', 60_000, now)).toEqual([
    { timestamp: now - 30_000, status: 'unknown' },
    { timestamp: now - 1_000, status: 'up' }
  ])
  clearMetricRecoveryQueue()
  const resume = savedMetricRecovery(config, 'a', 'any/uptime', 'time-window:source')!
  enqueueUptimeRecovery(config, 'a', 'any/uptime', 'time-window:source', resume, 60_000, async (cursor) => {
    expect(cursor).toBe(next)
    return { observations: [] }
  })
  await recoverNextMetric(config)
  expect(savedMetricRecovery(config, 'a', 'any/uptime', 'time-window:source')).toBeUndefined()
})

it('leaves non-pagination recovery jobs intact during ordinary uptime collection', async () => {
  const config = getConfig()
  const checkpoint = 'cursor-before-previous-heartbeat'
  const save = vi.fn(async () => ({ observations: [] }))
  enqueueUptimeRecovery(config, 'a', 'any/uptime', 'socket-window:source', checkpoint, 60_000, save)
  queuePaginatedUptimeRecovery(
    config,
    'a',
    'any/uptime',
    {
      label: 'Uptime',
      valueType: 'uptime',
      source: { url: 'https://example.test' },
      jq: { expression: '.heartbeats' }
    },
    [],
    undefined,
    undefined,
    60_000
  )
  await recoverNextMetric(config)
  expect(save).toHaveBeenCalledOnce()
  expect(metricRecoveryStates('a')).toEqual({})
})

it('rejects oversized batches before persistence regardless of their transport', async () => {
  const config = getConfig()
  const now = Date.now()
  enqueueUptimeRecovery(config, 'a', 'any/uptime', 'source', 'cursor', 60_000, async () => ({
    observations: Array.from({ length: METRIC_RECOVERY_MAX_OBSERVATIONS + 1 }, () => ({ timestamp: now, status: 'up' as const }))
  }))
  await recoverNextMetric(config)
  expect(metricRecoveryStates('a')).toEqual({ 'any/uptime': 'retrying' })
  expect(getUptimeObservationHistory(config, 'a', 'any/uptime', 60_000)).toEqual([])
})

it('backs off a repeated opaque checkpoint without marking recovery complete', async () => {
  const config = getConfig()
  enqueueUptimeRecovery(config, 'a', 'any/uptime', 'source', 'same-cursor', 60_000, async () => ({ observations: [], nextCheckpoint: 'same-cursor' }))
  await recoverNextMetric(config)
  expect(metricRecoveryStates('a')).toEqual({ 'any/uptime': 'retrying' })
  expect(savedMetricRecovery(config, 'a', 'any/uptime', 'source')).toBe('same-cursor')
})
