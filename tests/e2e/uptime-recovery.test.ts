import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getConfig } from '@/lib/config'
import type { UptimeMetricOverride } from '@/lib/config-file-types'
import { collectCustomMetric } from '@/lib/custom-metrics'
import { clearMetricsDatabase } from '@/lib/metrics'
import { yamlMetricTarget } from '@/lib/metric-collection/target-plan'
import { clearMetricRecoveryQueue, metricRecoveryStates, recoverNextMetric, retainMetricRecoveryPriority } from '@/lib/metric-recovery'
import { collectBulkHistory } from '@/lib/bulk-metric-history'
import { BULK_HISTORY_MAX_RESPONSE_BYTES } from '@/lib/constants'
import { clearMetricsStorage, getUptimeObservationHistory, metricsDatabase, saveUptimeObservationHistory } from '@/lib/metrics-storage'
import { queuePaginatedUptimeRecovery } from '@/lib/paginated-uptime-recovery'
import type { UptimeObservation } from '@/lib/status'

let server: Server | undefined
let directory: string | undefined
beforeEach(() => vi.stubEnv('ENABLE_METRIC_BACKFILL', 'true'))
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = undefined
  clearMetricsDatabase()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (directory) rmSync(directory, { recursive: true, force: true })
  directory = undefined
})

async function startSource(response: (page: number, url: URL) => unknown): Promise<string> {
  server = createServer((request, reply) => {
    const url = new URL(request.url!, 'http://localhost')
    const page = Number(url.searchParams.get('cursor') ?? 1)
    reply.setHeader('Content-Type', 'application/json')
    reply.end(JSON.stringify(response(page, url)))
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

function bulkHistoryMetric(url: string, key: string): UptimeMetricOverride {
  const metric = historyMetric(`${url}/${key}`)
  return {
    ...metric,
    source: { ...metric.source, query: { limit: 500 } },
    pagination: { ...metric.pagination!, bulk: { url: `${url}/all`, key, pageSizeParameter: 'limit', jq: { expression: 'map({key: .id, value: .checks}) | from_entries' } } }
  }
}

it('shares bounded bulk pages across independent endpoints and preserves individual checkpoints', async () => {
  const now = Date.now()
  const checks = Array.from({ length: 1200 }, (_, index) => ({ timestamp: now - index * 60_000, status: 'up' as const }))
  const requests: number[] = []
  const url = await startSource((page, request) => {
    requests.push(page)
    const size = Number(request.searchParams.get('limit'))
    return ['a', 'b'].map((id) => ({ id, checks: checks.slice((page - 1) * size, page * size) }))
  })
  const config = { ...getConfig(), metricsDatabasePath: ':memory:' }
  const initial = checks.slice(0, 500).reverse()
  for (const key of ['a', 'b']) queuePaginatedUptimeRecovery(config, key, 'other/history', bulkHistoryMetric(url, key), initial, 2, undefined, 30 * 24 * 60 * 60_000)
  await recoverNextMetric(config)
  await recoverNextMetric(config)
  expect(requests).toEqual([2])
  expect(
    metricsDatabase(config.metricsDatabasePath)
      .prepare('SELECT checkpoint FROM metric_recovery')
      .all()
      .map((row) => JSON.parse(String(row.checkpoint)).page)
  ).toEqual([3, 3])
  await recoverNextMetric(config)
  await recoverNextMetric(config)
  expect(requests).toEqual([2, 3])
  for (const key of ['a', 'b']) {
    expect(metricRecoveryStates(key)).toEqual({})
    expect(getUptimeObservationHistory(config, key, 'other/history', 30 * 24 * 60 * 60_000)).toHaveLength(700)
  }
})

it('uses individual pages for an open metric, then resumes shared background recovery', async () => {
  const now = Date.now()
  const checks = Array.from({ length: 1100 }, (_, index) => ({ timestamp: now - index * 60_000, status: 'up' as const }))
  const requests: string[] = []
  const url = await startSource((page, request) => {
    requests.push(`${request.pathname}:${page}`)
    const pageChecks = checks.slice((page - 1) * 500, page * 500)
    return request.pathname.endsWith('/all') ? ['a', 'b'].map((id) => ({ id, checks: pageChecks })) : { checks: pageChecks, next: pageChecks.length === 500 ? page + 1 : null }
  })
  const config = { ...getConfig(), metricsDatabasePath: ':memory:' }
  for (const key of ['a', 'b']) queuePaginatedUptimeRecovery(config, key, 'other/history', bulkHistoryMetric(url, key), checks.slice(0, 500).reverse(), 2, undefined, 30 * 24 * 60 * 60_000)
  await recoverNextMetric(config)
  const release = retainMetricRecoveryPriority('b', (key) => key === 'other/history')
  await recoverNextMetric(config)
  await recoverNextMetric(config)
  release()
  await recoverNextMetric(config)
  expect(requests).toEqual(['/history/all:2', '/history/b:2', '/history/b:3', '/history/all:3'])
  expect(metricRecoveryStates('a')).toEqual({})
  expect(metricRecoveryStates('b')).toEqual({})
})

it('shrinks oversized bulk responses without changing the logical page offset or duplicating requests for another endpoint', async () => {
  const now = Date.now()
  const checks = Array.from({ length: 1500 }, (_, index) => ({ timestamp: now - index * 1000, status: 'up' }))
  const requests: Array<[number, number]> = []
  const url = await startSource((page, request) => {
    const size = Number(request.searchParams.get('limit'))
    requests.push([page, size])
    if (size === 500) return { padding: 'x'.repeat(BULK_HISTORY_MAX_RESPONSE_BYTES + 1) }
    return ['a', 'b'].map((id) => ({ id, checks: checks.slice((page - 1) * size, page * size) }))
  })
  const first = await collectBulkHistory(bulkHistoryMetric(url, 'a'), 2)
  const second = await collectBulkHistory(bulkHistoryMetric(url, 'b'), 2)
  expect(requests).toEqual([
    [2, 500],
    [3, 250],
    [4, 250]
  ])
  expect(first.observations).toHaveLength(500)
  expect(first.observations[0]?.timestamp).toBe(checks[999]?.timestamp)
  expect(first.observations.at(-1)?.timestamp).toBe(checks[500]?.timestamp)
  expect(first.nextPage).toBe(3)
  expect(second).toEqual(first)
  await collectBulkHistory(bulkHistoryMetric(url, 'a'), 3)
  expect(requests.slice(-2)).toEqual([
    [5, 250],
    [6, 250]
  ])
})

it('isolates bulk caches by credentials and falls back to individual requests when a bulk endpoint is unavailable', async () => {
  const now = Date.now()
  const requests: string[] = []
  const url = await startSource((_page, request) => {
    requests.push(request.pathname)
    if (request.pathname.endsWith('/all')) return { unsupported: true }
    return { checks: [{ timestamp: now - 1000, status: 'up' }], next: null }
  })
  const config = { ...getConfig(), metricsDatabasePath: ':memory:' }
  const first = bulkHistoryMetric(url, 'a')
  const second = bulkHistoryMetric(url, 'b')
  first.source.headers = { Authorization: { value: 'first-user' } }
  second.source.headers = { Authorization: { value: 'second-user' } }
  for (const [key, metric] of [
    ['a', first],
    ['b', second]
  ] as const) {
    queuePaginatedUptimeRecovery(config, key, 'other/history', metric, [{ timestamp: now, status: 'up' }], 2, undefined, 60_000)
    await recoverNextMetric(config)
    expect(metricRecoveryStates(key)).toEqual({})
  }
  expect(requests).toEqual(['/history/all', '/history/a', '/history/all', '/history/b'])
})

it('recovers a non-Gatus provider across polls and restarts without losing its original gap boundary', async () => {
  const now = Date.now()
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
  await planned().target.collect(false)
  await recoverNextMetric(config)
  await recoverNextMetric(config)
  await recoverNextMetric(config)
  expect(metricRecoveryStates('yaml-app')).toEqual({})
  expect(getUptimeObservationHistory(config, 'yaml-app', key, 60_000, now)).toEqual([...checks].sort((a, b) => a.timestamp - b.timestamp))
  expect(metricsDatabase(config.metricsDatabasePath).prepare('SELECT COUNT(*) AS count FROM metric_recovery').get()?.count).toBe(0)
})

it('rejects oversized pages and non-advancing page metadata', async () => {
  const now = Date.now()
  let response: unknown = { checks: Array.from({ length: 501 }, () => ({ timestamp: now, status: 'up' })), next: 2 }
  const url = await startSource(() => response)
  const metric = historyMetric(url)
  expect(await collectCustomMetric('any/history', metric)).toEqual({ error: 'collection_failed' })
  response = { checks: [{ timestamp: now, status: 'up' }], next: 1 }
  expect(await collectCustomMetric('any/history', metric)).toEqual({ error: 'collection_failed' })
})

it('detects repeated history pages and pauses recovery rather than looping', async () => {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const config = getConfig()
  const checks: UptimeObservation[] = [{ timestamp: now - 1_000, status: 'up' }]
  const url = await startSource((page) => ({ checks, next: page + 1 }))
  const metric = historyMetric(url)
  queuePaginatedUptimeRecovery(config, 'a', 'any/history', metric, checks, 2, now - 60_000, 60_000)
  for (let i = 0; i < 3; i++) {
    await recoverNextMetric(config)
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
