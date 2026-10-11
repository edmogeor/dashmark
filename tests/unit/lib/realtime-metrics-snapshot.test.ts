import { afterEach, expect, it, vi } from 'vitest'

const getMetricAccess = vi.hoisted(() => vi.fn())
vi.mock('@/lib/discovery-coordinator', () => ({ getDiscoveryCoordinator: () => ({ getMetricAccess }) }))

import { getConfig } from '@/lib/config'
import * as auth from '@/lib/auth'
import { metricsSnapshot, type MetricsSnapshots } from '@/lib/realtime-metrics-snapshot'
import * as recovery from '@/lib/metric-recovery'

afterEach(() => vi.restoreAllMocks())

it('checks resource permissions once and shares unrestricted history without leaking restricted fields', () => {
  const config = getConfig()
  config.showMetrics = true
  config.metricsAccess = []
  config.accessGroupsHeader = 'X-Test-Groups'
  getMetricAccess.mockReturnValue({ historyPeriodMs: 300_000, metricsAccess: { cpu: ['admins'], network: ['admins'] } })
  const history = Array.from({ length: 1_000 }, (_, timestamp) => ({ timestamp, cpuPercent: 12, memoryUsage: 1_024, memoryLimit: 2_048, receivedBytesPerSecond: 10, sentBytesPerSecond: 20 }))
  const resource = history[0]!
  const cache: MetricsSnapshots = new Map([['app', new Map([[300_000, { resource, history, historyPeriodMs: 300_000, pending: false, customMetrics: [], uptimeMetrics: [] }]])]])
  const readUser = vi.spyOn(auth, 'getUser')

  const admin = metricsSnapshot(config, new Headers({ 'X-Test-Groups': 'admins' }), 'app', cache)
  expect(admin?.history).toBe(history)
  expect(admin?.resource).toBe(resource)
  expect(readUser).toHaveBeenCalledTimes(3)

  const guest = metricsSnapshot(config, new Headers({ 'X-Test-Groups': 'guests' }), 'app', cache)
  expect(guest?.history).not.toBe(history)
  expect(guest?.history?.[0]).toMatchObject({ timestamp: 0, cpuPercent: undefined, memoryUsage: 1_024, memoryLimit: 2_048, receivedBytesPerSecond: undefined, sentBytesPerSecond: undefined })
  expect(guest?.resource?.cpuPercent).toBeUndefined()
  expect(readUser).toHaveBeenCalledTimes(6)
  expect(history[0]?.cpuPercent).toBe(12)
  expect(metricsSnapshot(config, new Headers({ 'X-Test-Groups': 'admins' }), 'app', cache)?.history).toBe(history)
})

it('filters recovery metadata using the same permissions as the historical metric', () => {
  const config = getConfig()
  config.metricsAccess = []
  config.accessGroupsHeader = 'X-Test-Groups'
  getMetricAccess.mockReturnValue({ historyPeriodMs: 300_000, metricsAccess: { private: ['admins'] } })
  vi.spyOn(recovery, 'metricRecoveryStates').mockReturnValue({ private: 'recovering', public: 'retrying' })
  const cache: MetricsSnapshots = new Map([['app', new Map([[300_000, { resource: null, history: [], historyPeriodMs: 300_000, pending: false, customMetrics: [], uptimeMetrics: [] }]])]])
  expect(metricsSnapshot(config, new Headers({ 'X-Test-Groups': 'guests' }), 'app', cache)?.metricRecovery).toEqual({ public: 'retrying' })
  expect(metricsSnapshot(config, new Headers({ 'X-Test-Groups': 'admins' }), 'app', cache)?.metricRecovery).toEqual({ private: 'recovering', public: 'retrying' })
})
