import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getConfig } from '@/lib/config'
import { clearMetricsDatabase, counterRates, getMetricHistory, getResourceMetricHistory, saveMetricSample, saveResourceMetric } from '@/lib/metrics'

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
    expect(getMetricHistory(config, 'default:container', 'cpu', 5_000, 6_001)).toEqual([
      { timestamp: 6_000, value: 20 }
    ])
  })

  it('stores each custom metric with its own retention period', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dashmark-metrics-'))
    directories.push(directory)
    const config = getConfig()
    config.metricsDatabasePath = join(directory, 'metrics.db')

    saveMetricSample(config, 'default:radarr', 'active_downloads', 2, 60_000, 1_000)
    saveMetricSample(config, 'default:radarr', 'active_downloads', 3, 60_000, 62_000)

    expect(getMetricHistory(config, 'default:radarr', 'active_downloads', 60_000, 62_000)).toEqual([
      { timestamp: 62_000, value: 3 }
    ])
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
      value: 1_000,
    }

    expect(counterRates('default:opnsense', [metric], 1_000)).toEqual([
      { ...metric, value: 0, pending: true },
    ])
    expect(counterRates('default:opnsense', [{ ...metric, value: 1_500 }], 2_000)).toEqual([
      { ...metric, value: 500 },
    ])
  })
})
