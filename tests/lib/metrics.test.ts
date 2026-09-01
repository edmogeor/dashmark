import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getConfig } from '@/lib/config'
import { clearMetricsDatabase, counterRates, getMetricHistory, getResourceMetricHistory, saveMetricSample, saveResourceMetric } from '@/lib/metrics'
import { getUptimeObservationHistory, mergeUptimeObservationHistory, refreshMetricRetention } from '@/lib/metrics-storage'

const directories: string[] = []

afterEach(() => {
  clearMetricsDatabase()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
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
    refreshMetricRetention(
      config,
      [
        { cardId: 'default:short', historyPeriodMs: 5_000, hasResourceMetrics: true, customMetricKeys: [], uptimeMetricKeys: [] },
        { cardId: 'default:long', historyPeriodMs: 20_000, hasResourceMetrics: true, customMetricKeys: [], uptimeMetricKeys: [] }
      ],
      10_000
    )

    expect(getResourceMetricHistory(config, 'default:short', 60_000, 10_000)).toEqual([])
    expect(getResourceMetricHistory(config, 'default:long', 60_000, 10_000)).toHaveLength(1)
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
