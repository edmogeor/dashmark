import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getConfig } from '@/lib/config'
import { clearMetricsDatabase, counterRates, startMetricsCollection } from '@/lib/metrics'
import * as docker from '@/lib/docker'
import {
  getMetricHistory,
  getResourceMetricHistory,
  getUptimeObservationHistory,
  getLatestUptimeObservation,
  getUptimeBucketHistory,
  hasUptimeObservationHistory,
  mergeUptimeObservationHistory,
  metricsDatabase,
  pruneMetricHistory,
  refreshMetricRetention,
  saveMetricSample,
  saveResourceMetric
} from '@/lib/metrics-storage'
import { aggregateUptimeBuckets } from '@/lib/uptime-buckets'
import { UPTIME_RANGES } from '@/lib/uptime-ranges'
import { uptimeBucketsByRange } from '@/lib/realtime-metrics-snapshot'

const directories: string[] = []

afterEach(() => {
  clearMetricsDatabase()
  globalThis.__dashmarkDiscoveryCoordinator?.clear()
  globalThis.__dashmarkDiscoveryCoordinator = undefined
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it('waits for a slow in-flight collection instead of rescheduling overdue timers in a busy loop', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
  directories.push(directory)
  const config = getConfig()
  config.showMetrics = true
  config.metricsDatabasePath = join(directory, 'metrics.db')
  vi.spyOn(docker, 'discoveredMetricSchedules').mockReturnValue([{ cardId: 'app', metricsPollIntervalMs: 10_000 }])
  let finish: () => void = () => {}
  const pending = new Promise<[]>((resolve) => {
    finish = () => resolve([])
  })
  const collect = vi.spyOn(docker, 'collectDiscoveredMetricUsage').mockResolvedValueOnce([]).mockReturnValueOnce(pending).mockResolvedValue([])

  startMetricsCollection(config)
  await vi.advanceTimersByTimeAsync(12_000)
  expect(collect).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
  finish()
  await vi.advanceTimersByTimeAsync(0)
  expect(vi.getTimerCount()).toBe(1)
})

describe('resource metric history', () => {
  it('persists samples and prunes data outside the configured window', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')
    config.metricsHistoryPeriodMs = 5_000

    saveResourceMetric(config, 'default:container', { cpuPercent: 10, memoryUsage: 100 }, 5_000, 1_000)
    saveResourceMetric(config, 'default:container', { cpuPercent: 20, memoryUsage: 200 }, 5_000, 6_000)

    expect(getResourceMetricHistory(config, 'default:container', 5_000, 6_001)).toEqual([
      { timestamp: 6_000, cpuPercent: 20, memoryUsage: 200, memoryLimit: undefined, receivedBytesPerSecond: undefined, sentBytesPerSecond: undefined }
    ])
    expect(getMetricHistory(config, 'default:container', 'cpu', 5_000, 6_001)).toEqual([])
  })

  it('stores each custom metric with its own retention period', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')

    saveMetricSample(config, 'default:radarr', 'active_downloads', 2, 60_000, 1_000)
    saveMetricSample(config, 'default:radarr', 'active_downloads', 3, 60_000, 62_000)

    expect(getMetricHistory(config, 'default:radarr', 'active_downloads', 60_000, 62_000)).toEqual([{ timestamp: 62_000, value: 3 }])
  })

  it('merges and persists uptime observations by card and metric', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')

    expect(mergeUptimeObservationHistory(config, 'default:gatus', 'gatus/uptime', [{ timestamp: 1_000, status: 'up' }], 5_000, 2_000)).toEqual([{ timestamp: 1_000, status: 'up' }])
    expect(mergeUptimeObservationHistory(config, 'default:gatus', 'gatus/uptime', [{ timestamp: 4_000, status: 'down', responseTimeMs: 12 }], 5_000, 5_000)).toEqual([
      { timestamp: 1_000, status: 'up' },
      { timestamp: 4_000, status: 'down', responseTimeMs: 12 }
    ])
    expect(getUptimeObservationHistory(config, 'default:gatus', 'gatus/uptime', 5_000, 7_000)).toEqual([{ timestamp: 4_000, status: 'down', responseTimeMs: 12 }])
    expect(getUptimeObservationHistory(config, 'default:other', 'gatus/uptime', 5_000, 7_000)).toEqual([])
  })

  it('uses discovery retention for targets before they are due for collection', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')
    config.metricsHistoryPeriodMs = 5_000

    saveResourceMetric(config, 'default:short', { cpuPercent: 1 }, 60_000, 1_000)
    saveResourceMetric(config, 'default:long', { cpuPercent: 1 }, 60_000, 1_000)
    saveMetricSample(config, 'default:short', 'count', 1, 60_000, 1_000)
    saveMetricSample(config, 'default:long', 'count', 1, 60_000, 1_000)
    refreshMetricRetention(
      config,
      [
        { cardId: 'default:short', historyPeriodMs: 5_000, hasResourceMetrics: true, customMetricKeys: ['count'], uptimeMetricKeys: [] },
        { cardId: 'default:long', historyPeriodMs: 20_000, hasResourceMetrics: true, customMetricKeys: ['count'], uptimeMetricKeys: [] }
      ],
      10_000
    )

    expect(getResourceMetricHistory(config, 'default:short', 60_000, 10_000)).toEqual([])
    expect(getResourceMetricHistory(config, 'default:long', 60_000, 10_000)).toHaveLength(1)
    expect(getMetricHistory(config, 'default:short', 'count', 60_000, 10_000)).toEqual([])
    expect(getMetricHistory(config, 'default:long', 'count', 60_000, 10_000)).toHaveLength(1)
  })

  it('removes history for targets and metric keys absent from confirmed discovery', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')

    saveResourceMetric(config, 'default:removed', { cpuPercent: 1 }, 60_000, 1_000)
    saveMetricSample(config, 'default:active', 'removed-key', 1, 60_000, 1_000)
    mergeUptimeObservationHistory(config, 'default:active', 'removed-uptime', [{ timestamp: 1_000, status: 'up' }], 60_000, 2_000)
    refreshMetricRetention(config, [{ cardId: 'default:active', historyPeriodMs: 60_000, hasResourceMetrics: false, customMetricKeys: [], uptimeMetricKeys: [] }], 2_000)

    expect(getResourceMetricHistory(config, 'default:removed', 60_000, 2_000)).toEqual([])
    expect(getMetricHistory(config, 'default:active', 'removed-key', 60_000, 2_000)).toEqual([])
    expect(getUptimeObservationHistory(config, 'default:active', 'removed-uptime', 60_000, 2_000)).toEqual([])
  })

  it('keeps uptime observations for at least 30 days', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')
    const day = 24 * 60 * 60_000

    mergeUptimeObservationHistory(config, 'default:gatus', 'gatus/uptime', [{ timestamp: 1_000, status: 'up' }], 5_000, 20 * day)
    expect(getUptimeObservationHistory(config, 'default:gatus', 'gatus/uptime', 30 * day, 20 * day)).toEqual([{ timestamp: 1_000, status: 'up' }])
  })

  it('deduplicates overlapping polls and prunes each uptime target using its retention', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')
    const day = 24 * 60 * 60_000
    const observation = { timestamp: day, status: 'up' as const, responseTimeMs: 12 }

    mergeUptimeObservationHistory(config, 'short', 'uptime', [observation], 30 * day, 2 * day)
    expect(mergeUptimeObservationHistory(config, 'short', 'uptime', [observation, { ...observation, status: 'down' }], 30 * day, 2 * day)).toHaveLength(2)
    mergeUptimeObservationHistory(config, 'long', 'uptime', [observation], 60 * day, 2 * day)
    expect(hasUptimeObservationHistory(config, 'short', 'uptime', 30 * day, 2 * day)).toBe(true)
    expect(hasUptimeObservationHistory(config, 'missing', 'uptime', 30 * day, 2 * day)).toBe(false)
    expect(hasUptimeObservationHistory(config, 'short', 'uptime', 30 * day, 32 * day)).toBe(false)

    pruneMetricHistory(config, 32 * day)
    expect(metricsDatabase(config.metricsDatabasePath).prepare('SELECT card_id FROM uptime_observations').all()).toEqual([{ card_id: 'long' }])
  })

  it('returns identical persisted chart summaries across ranges and after restarting storage', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')
    const now = Date.parse('2026-10-11T10:05:00Z')
    const observations = Array.from({ length: 43_200 }, (_, index) => ({
      timestamp: now - index * 60_000,
      status: index % 7 === 0 ? ('down' as const) : index % 11 === 0 ? ('unknown' as const) : ('up' as const),
      ...(index % 13 === 0 ? {} : { responseTimeMs: index % 500 })
    }))
    mergeUptimeObservationHistory(config, 'app', 'uptime', observations, 30 * 24 * 60 * 60_000, now)
    clearMetricsDatabase()

    expect(getLatestUptimeObservation(config, 'app', 'uptime', 30 * 24 * 60 * 60_000, now)).toEqual(observations[0])
    for (const { durationMs, bucketCount } of UPTIME_RANGES) {
      expect(getUptimeBucketHistory(config, 'app', 'uptime', durationMs, bucketCount, now)).toEqual(aggregateUptimeBuckets(observations, durationMs, bucketCount, { includeCurrentBucket: true, now }))
      expect(getUptimeBucketHistory(config, 'missing', 'uptime', durationMs, bucketCount, now)).toEqual(aggregateUptimeBuckets([], durationMs, bucketCount, { includeCurrentBucket: true, now }))
    }
  })

  it('shares chart summaries within a collection and refreshes them for new samples and hour boundaries', () => {
    vi.useFakeTimers()
    const now = Date.parse('2026-10-11T10:05:00Z')
    vi.setSystemTime(now)
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')
    const period = 30 * 24 * 60 * 60_000
    mergeUptimeObservationHistory(config, 'app', 'uptime', [{ timestamp: now, status: 'up' }], period, now)
    const metric = { key: 'uptime', label: 'Uptime', current: 'up' as const }
    const first = uptimeBucketsByRange(config, 'app', metric)
    expect(uptimeBucketsByRange(config, 'app', metric)).toBe(first)

    mergeUptimeObservationHistory(config, 'app', 'uptime', [{ timestamp: now + 1, status: 'down' }], period, now)
    const updated = uptimeBucketsByRange(config, 'app', { ...metric, current: 'down' })
    expect(updated['24h'].at(-1)).toMatchObject({ status: 'mixed', successes: 1, failures: 1 })
    vi.setSystemTime(now + 3_600_000)
    const rolled = uptimeBucketsByRange(config, 'app', metric)
    expect(rolled['24h'][0]?.start).toBe(first['24h'][0]!.start + 3_600_000)
    expect(rolled['24h'].at(-1)?.status).toBe('unknown')
  })
})

describe('counter rates', () => {
  it('marks the first sample as pending until it can calculate a rate', () => {
    const metric = {
      key: 'wan-received',
      label: 'WAN received',
      unit: 'bytes_per_second' as const,
      chart: 'line' as const,
      rate: true as const,
      value: 1_000
    }

    expect(counterRates('default:opnsense', [metric], 1_000)).toEqual([{ ...metric, value: 0, pending: true }])
    expect(counterRates('default:opnsense', [{ ...metric, value: 1_500 }], 2_000)).toEqual([{ ...metric, value: 500 }])
  })
})
