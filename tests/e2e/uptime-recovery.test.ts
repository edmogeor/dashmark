import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { getConfig } from '@/lib/config'
import type { UptimeMetricOverride } from '@/lib/config-file-types'
import { collectCustomMetric } from '@/lib/custom-metrics'
import { clearMetricsDatabase } from '@/lib/metrics'
import { yamlMetricTarget } from '@/lib/metric-collection/target-plan'
import { clearMetricRecoveryQueue, metricRecoveryStates, recoverNextMetric } from '@/lib/metric-recovery'
import { clearMetricsStorage, getUptimeObservationHistory, metricsDatabase, saveUptimeObservationHistory } from '@/lib/metrics-storage'
import { queuePaginatedUptimeRecovery } from '@/lib/paginated-uptime-recovery'
import { METRIC_RECOVERY_INTERVAL_MS } from '@/lib/constants'
import type { UptimeObservation } from '@/lib/status'

let server: Server | undefined
let directory: string | undefined
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = undefined
  clearMetricsDatabase()
  vi.restoreAllMocks()
  if (directory) rmSync(directory, { recursive: true, force: true })
  directory = undefined
})

async function startSource(response: (page: number) => unknown): Promise<string> {
  server = createServer((request, reply) => {
    const page = Number(new URL(request.url!, 'http://localhost').searchParams.get('cursor') ?? 1)
    reply.setHeader('Content-Type', 'application/json')
    reply.end(JSON.stringify(response(page)))
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No server address')
  return `http://127.0.0.1:${address.port}/history`
}

function historyMetric(url: string): UptimeMetricOverride {
  return {
    label: 'Other provider uptime',
    valueType: 'uptime',
    source: { url },
    pagination: { recover: true, pageParameter: 'cursor', items: { expression: '.checks' }, next: { expression: '.next' } },
    jq: { expression: '.items' }
  }
}

it('recovers a non-Gatus provider across polls and restarts without losing its original gap boundary', async () => {
  let now = Date.now()
  const start = now
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const observation = (seconds: number): UptimeObservation => ({ timestamp: start - seconds * 1_000, status: seconds === 5 ? 'down' : 'up' })
  let checks = [1, 2, 3, 4, 5, 6, 7, 8].map(observation)
  const requests: number[] = []
  const url = await startSource((page) => {
    requests.push(page)
    const slice = checks.slice((page - 1) * 2, page * 2)
    return { checks: slice, next: page * 2 < checks.length ? page + 1 : null }
  })
  const config = getConfig()
  directory = mkdtempSync(join(tmpdir(), 'dashmark-recovery-'))
  config.metricsDatabasePath = join(directory, 'metrics.db')
  const key = 'independent-provider/history'
  const metric = historyMetric(url)
  saveUptimeObservationHistory(config, 'yaml-app', key, [observation(8)], 60_000, now)
  const planned = () =>
    yamlMetricTarget(
      config,
      'app',
      { url },
      {
        labels: { metrics: [key] },
        metricDefinitions: { [key]: metric },
        customMetrics: { [key]: metric }
      }
    )!

  await planned().target.collect(false)
  expect(metricRecoveryStates('yaml-app')).toEqual({ [key]: 'recovering' })
  await recoverNextMetric(config)
  expect(requests).toEqual([1, 2])
  expect(JSON.parse(String(metricsDatabase(config.metricsDatabasePath).prepare('SELECT checkpoint FROM metric_recovery').get()?.checkpoint)).boundary).toBe(observation(8).timestamp)

  // A new check shifts pages, and a restart drops all in-memory jobs, but neither loses the older gap.
  checks = [observation(0), ...checks]
  metric.label = 'Updated uptime label'
  clearMetricRecoveryQueue()
  clearMetricsStorage()
  now += METRIC_RECOVERY_INTERVAL_MS
  await planned().target.collect(false)
  await recoverNextMetric(config)
  now += METRIC_RECOVERY_INTERVAL_MS
  await recoverNextMetric(config)
  now += METRIC_RECOVERY_INTERVAL_MS
  await recoverNextMetric(config)
  expect(metricRecoveryStates('yaml-app')).toEqual({})
  expect(getUptimeObservationHistory(config, 'yaml-app', key, 60_000, now)).toEqual([...checks].sort((a, b) => a.timestamp - b.timestamp))
  expect(metricsDatabase(config.metricsDatabasePath).prepare('SELECT COUNT(*) AS count FROM metric_recovery').get()?.count).toBe(0)
})

it('rejects oversized pages and non-advancing page metadata', async () => {
  const now = Date.now()
  let response: unknown = { checks: Array.from({ length: 101 }, () => ({ timestamp: now, status: 'up' })), next: 2 }
  const url = await startSource(() => response)
  const metric = historyMetric(url)
  expect(await collectCustomMetric('any/history', metric)).toEqual({ error: 'collection_failed' })
  response = { checks: [{ timestamp: now, status: 'up' }], next: 1 }
  expect(await collectCustomMetric('any/history', metric)).toEqual({ error: 'collection_failed' })
})

it('detects repeated history pages and pauses recovery rather than looping', async () => {
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const config = getConfig()
  const checks: UptimeObservation[] = [{ timestamp: now - 1_000, status: 'up' }]
  const url = await startSource((page) => ({ checks, next: page + 1 }))
  const metric = historyMetric(url)
  queuePaginatedUptimeRecovery(config, 'a', 'any/history', metric, checks, 2, now - 60_000, 60_000)
  for (let i = 0; i < 3; i++) {
    await recoverNextMetric(config)
    now += METRIC_RECOVERY_INTERVAL_MS
  }
  expect(metricRecoveryStates('a')).toEqual({ 'any/history': 'retrying' })
  expect(JSON.parse(String(metricsDatabase(config.metricsDatabasePath).prepare('SELECT checkpoint FROM metric_recovery').get()?.checkpoint)).page).toBe(4)
})

it('stops without a request when the remaining gap is outside retention', async () => {
  const config = getConfig()
  const now = Date.now()
  const url = await startSource(() => {
    throw new Error('Expired history must not be fetched')
  })
  const metric = historyMetric(url)
  queuePaginatedUptimeRecovery(config, 'a', 'any/history', metric, [{ timestamp: now - 120_000, status: 'up' }], 2, undefined, 60_000)
  await recoverNextMetric(config)
  expect(metricRecoveryStates('a')).toEqual({})
})

it('finishes on an empty upstream page and leaves missing periods unknown', async () => {
  const config = getConfig()
  const now = Date.now()
  const url = await startSource(() => ({ checks: [], next: null }))
  const metric = historyMetric(url)
  queuePaginatedUptimeRecovery(config, 'a', 'any/history', metric, [{ timestamp: now - 1_000, status: 'up' }], 2, now - 60_000, 60_000)
  await recoverNextMetric(config)
  expect(metricRecoveryStates('a')).toEqual({})
  expect(getUptimeObservationHistory(config, 'a', 'any/history', 60_000, now)).toEqual([])
})
