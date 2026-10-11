import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import WebSocket from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getDiscoveredCards = vi.hoisted(() => vi.fn(async () => ({ cards: [] as import('@/lib/docker').Card[] })))
const watchContainerEvents = vi.hoisted(() => vi.fn(() => () => {}))

vi.mock('@/lib/docker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/docker')>()),
  getDiscoveredCards,
  watchContainerEvents
}))

import { getConfig } from '@/lib/config'
import { getRealtimeServer } from '@/lib/realtime-server'
import * as metrics from '@/lib/metrics'
import * as snapshots from '@/lib/realtime-metrics-snapshot'
import { RealtimeClient } from '@/lib/realtime-client'
import { saveMetricSample, saveResourceMetric } from '@/lib/metrics-storage'
import type { RealtimeMetricsResponse } from '@/lib/realtime-protocol'
import type { Card, ContainerMetricUsage } from '@/lib/docker'
import * as protocol from '@/lib/realtime-protocol'
import { isMetricRecoveryPrioritized } from '@/lib/metric-recovery'

const httpServers = new Set<Server>()
const sockets = new Set<WebSocket>()

async function connect(headers: Record<string, string> = {}): Promise<{ socket: WebSocket; messages: unknown[] }> {
  const httpServer = createServer()
  getRealtimeServer({ ...getConfig(), metricsDatabasePath: ':memory:' }).attachDevServer(httpServer)
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  httpServers.add(httpServer)
  const address = httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener')

  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/realtime`, { headers })
  const messages: unknown[] = []
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())))
  sockets.add(socket)
  await once(socket, 'open')
  return { socket, messages }
}

async function nextMessage(messages: unknown[]): Promise<unknown> {
  await vi.waitFor(() => expect(messages).not.toHaveLength(0))
  return messages.shift()
}

afterEach(async () => {
  for (const socket of sockets) socket.terminate()
  sockets.clear()
  globalThis.__dashmarkRealtime?.close()
  globalThis.__dashmarkRealtime = undefined
  globalThis.__dashmarkDiscoveryCoordinator?.clear()
  globalThis.__dashmarkDiscoveryCoordinator = undefined
  metrics.clearMetricsDatabase()
  await Promise.all([...httpServers].map((server) => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))))
  httpServers.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  getDiscoveredCards.mockResolvedValue({ cards: [] })
  vi.unstubAllGlobals()
})

describe('realtime client protocol', () => {
  it('authorizes view priority per metric and releases it on unsubscribe and disconnect', async () => {
    getDiscoveredCards.mockResolvedValue({
      cards: [
        {
          id: 'app',
          title: 'App',
          url: 'https://example.test',
          icon: { type: 'placeholder', initials: 'A' },
          searchAliases: [],
          hasContainer: false,
          access: [],
          customMetricLabels: [
            { key: 'public', label: 'Public' },
            { key: 'secret', label: 'Secret' }
          ],
          metricsAccess: { secret: ['admins'] }
        }
      ]
    })
    getRealtimeServer({ ...getConfig(), metricsDatabasePath: ':memory:', enableMetricBackfill: true, enableAccessControl: true, accessGroupsHeader: 'X-Test-Groups' })
    const guest = await connect({ 'X-Test-Groups': 'guests' })
    const admin = await connect({ 'X-Test-Groups': 'admins' })
    for (const client of [guest, admin]) {
      await nextMessage(client.messages)
      client.socket.send(JSON.stringify({ type: 'subscribe_metrics', cardId: 'app' }))
      await nextMessage(client.messages)
    }
    guest.socket.send(JSON.stringify({ type: 'set_metric_priority', cardId: 'app', priority: true }))
    await vi.waitFor(() => expect(isMetricRecoveryPrioritized('app', 'public')).toBe(true))
    expect(isMetricRecoveryPrioritized('app', 'secret')).toBe(false)
    admin.socket.send(JSON.stringify({ type: 'set_metric_priority', cardId: 'app', priority: true, metricKey: 'secret' }))
    await vi.waitFor(() => expect(isMetricRecoveryPrioritized('app', 'secret')).toBe(true))
    guest.socket.send(JSON.stringify({ type: 'unsubscribe_metrics', cardId: 'app' }))
    await vi.waitFor(() => expect(isMetricRecoveryPrioritized('app', 'public')).toBe(false))
    expect(isMetricRecoveryPrioritized('app', 'secret')).toBe(true)
    admin.socket.close()
    await vi.waitFor(() => expect(isMetricRecoveryPrioritized('app', 'secret')).toBe(false))
  })

  it('delivers complete histories, incremental boundary samples, retention expiry, and reconnect snapshots end to end', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(5_000)
    const config = { ...getConfig(), metricsDatabasePath: ':memory:', metricsHistoryPeriodMs: 5_000, accessGroupsHeader: 'X-Test-Groups' }
    const card: Card = {
      id: 'app',
      title: 'App',
      url: 'https://example.test',
      icon: { type: 'placeholder', initials: 'A' },
      searchAliases: [],
      hasContainer: true,
      access: [],
      resourceStats: ['cpu'],
      customMetricLabels: [{ key: 'count', label: 'Count' }],
      customMetricKeys: ['count'],
      metricsHistoryPeriodMs: 5_000
    }
    getDiscoveredCards.mockResolvedValue({ cards: [card] })
    const usage: ContainerMetricUsage = {
      historyPeriodMs: 5_000,
      resource: { cpuPercent: 5 },
      customMetrics: [{ key: 'count', label: 'Count', unit: 'count', chart: 'line', value: 5 }],
      metricErrors: []
    }
    vi.spyOn(metrics, 'getLatestMetricUsage').mockImplementation(() => usage)
    for (const timestamp of [1_000, 4_000, 5_000]) {
      saveResourceMetric(config, 'app', { cpuPercent: timestamp / 1_000 }, 5_000, timestamp)
      saveMetricSample(config, 'app', 'count', timestamp / 1_000, 5_000, timestamp)
    }
    const server = getRealtimeServer(config)
    const setup = await connect()
    await nextMessage(setup.messages)
    vi.stubGlobal('document', { baseURI: setup.socket.url.replace(/^ws:/, 'http:').replace(/api\/realtime$/, ''), visibilityState: 'visible', addEventListener() {}, removeEventListener() {} })
    vi.stubGlobal('WebSocket', WebSocket)
    const snapshot = vi.spyOn(snapshots, 'metricsSnapshot')
    const sent = vi.spyOn(WebSocket.prototype, 'send')
    const received: RealtimeMetricsResponse[] = []
    const client = new RealtimeClient()
    const release = client.retainMetrics(
      'app',
      (value) => received.push(value),
      () => {}
    )
    const frames = () => sent.mock.calls.map(([data]) => JSON.parse(String(data)))
    try {
      await vi.waitFor(() => expect(received).toHaveLength(1))
      expect(received[0]?.history?.map(({ timestamp }) => timestamp)).toEqual([1_000, 4_000, 5_000])
      expect(frames().some((frame) => frame.type === 'subscribe_metrics' && frame.incremental === true)).toBe(true)
      expect(snapshot.mock.calls[0]?.[3].has('app')).toBe(false)

      clock.mockReturnValue(6_000)
      for (const [timestamp, value] of [
        [5_000, 55],
        [6_000, 6]
      ] as const) {
        saveResourceMetric(config, 'app', { cpuPercent: value }, 5_000, timestamp)
        saveMetricSample(config, 'app', 'count', value, 5_000, timestamp)
      }
      usage.resource = { cpuPercent: 6 }
      await server.publishMetricsDelta('app')
      await vi.waitFor(() => expect(received).toHaveLength(2))
      const delta = frames().find((frame) => frame.type === 'metrics_history_delta')
      expect(delta).toMatchObject({ replaceFrom: 5_000, cutoff: 1_000 })
      expect(delta.metrics.history.map((sample: { timestamp: number }) => sample.timestamp)).toEqual([5_000, 5_000, 6_000])
      expect(received[1]?.history?.map(({ cpuPercent }) => cpuPercent)).toEqual([1, 4, 5, 55, 6])
      expect(received[1]?.customMetrics).toMatchObject([{ history: [{ value: 1 }, { value: 4 }, { value: 5 }, { value: 55 }, { value: 6 }] }])

      setup.socket.send(JSON.stringify({ type: 'subscribe_metrics', cardId: 'app' }))
      expect(await nextMessage(setup.messages)).toMatchObject({
        type: 'metrics_snapshot',
        metrics: { history: [{ timestamp: 1_000 }, { timestamp: 4_000 }, { timestamp: 5_000 }, { timestamp: 5_000 }, { timestamp: 6_000 }] }
      })

      clock.mockReturnValue(12_000)
      for (const timestamp of [7_000, 12_000]) {
        saveResourceMetric(config, 'app', { cpuPercent: timestamp / 1_000 }, 5_000, timestamp)
        saveMetricSample(config, 'app', 'count', timestamp / 1_000, 5_000, timestamp)
      }
      await server.publishMetricsDelta('app')
      await vi.waitFor(() => expect(received).toHaveLength(3))
      expect(received[2]?.history?.map(({ timestamp }) => timestamp)).toEqual([7_000, 12_000])
      expect(received[2]?.customMetrics).toMatchObject([{ history: [{ timestamp: 7_000 }, { timestamp: 12_000 }] }])
      expect(await nextMessage(setup.messages)).toMatchObject({ type: 'metrics_delta', metrics: { history: [{ timestamp: 7_000 }, { timestamp: 12_000 }] } })

      server.close()
      await new Promise((resolve) => setTimeout(resolve, 1_100))
      await vi.waitFor(() => expect(received).toHaveLength(4))
      expect(frames().filter((frame) => frame.type === 'metrics_snapshot')).toHaveLength(3)
      expect(received[3]?.history?.map(({ timestamp }) => timestamp)).toEqual([7_000, 12_000])

      saveMetricSample(config, 'app', 'new', 9, 5_000, 9_000)
      usage.customMetrics.push({ key: 'new', label: 'New', unit: 'count', chart: 'line', value: 9 })
      await server.publishMetricsDelta('app')
      await vi.waitFor(() => expect(received).toHaveLength(5))
      expect(frames().at(-1)?.type).toBe('metrics_snapshot')
      expect(received[4]?.customMetrics).toMatchObject([{ key: 'count' }, { key: 'new', history: [{ timestamp: 9_000, value: 9 }] }])

      card.metricsHistoryPeriodMs = 10_000
      await server.publishMetricsDelta('app')
      await vi.waitFor(() => expect(received).toHaveLength(6))
      expect(frames().at(-1)?.type).toBe('metrics_snapshot')
      expect(received[5]?.historyPeriodMs).toBe(10_000)

      card.metricsAccess = { cpu: ['admins'] }
      await server.publishMetricsDelta('app')
      await vi.waitFor(() => expect(received).toHaveLength(7))
      expect(frames().at(-1)?.type).toBe('metrics_snapshot')
      expect(received[6]?.history?.every((sample) => sample.cpuPercent === undefined)).toBe(true)

      clock.mockReturnValue(11_000)
      saveResourceMetric(config, 'app', { cpuPercent: 11 }, 5_000, 11_000)
      await server.publishMetricsDelta('app')
      await vi.waitFor(() => expect(received).toHaveLength(8))
      expect(frames().at(-1)?.type).toBe('metrics_snapshot')
      expect(received[7]?.history?.map(({ timestamp }) => timestamp)).toEqual([7_000, 11_000, 12_000])
    } finally {
      release()
    }
  })

  it('cancels a pending subscription without sending its history after discovery completes', async () => {
    const discovery = Promise.withResolvers<{ cards: Card[] }>()
    getDiscoveredCards.mockReturnValueOnce(discovery.promise)
    const snapshot = vi.spyOn(snapshots, 'metricsSnapshot')
    const parse = vi.spyOn(protocol, 'parseClientMessage')
    const { socket, messages } = await connect()
    try {
      socket.send(JSON.stringify({ type: 'subscribe_metrics', cardId: 'app', incremental: true }))
      socket.send(JSON.stringify({ type: 'unsubscribe_metrics', cardId: 'app' }))
      await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(2))
      discovery.resolve({ cards: [] })
      expect(await nextMessage(messages)).toMatchObject({ type: 'status_snapshot' })
      expect(snapshot).not.toHaveBeenCalled()
      expect(messages).toEqual([])
    } finally {
      discovery.resolve({ cards: [] })
    }
  })

  it('sends a complete snapshot even when retained history exceeds the ordinary outbound budget', async () => {
    const history = Array.from({ length: 20_000 }, (_, timestamp) => ({
      timestamp,
      cpuPercent: 12,
      memoryUsage: 500_000_000,
      memoryLimit: 1_000_000_000,
      receivedBytesPerSecond: 100_000,
      sentBytesPerSecond: 200_000
    }))
    const response = { resource: null, history, historyPeriodMs: 300_000, customMetrics: [], metricErrors: [] }
    expect(Buffer.byteLength(JSON.stringify(response))).toBeGreaterThan(1024 * 1024)
    vi.spyOn(snapshots, 'metricsSnapshot').mockReturnValue(response)
    const { socket, messages } = await connect()
    await nextMessage(messages)
    for (const cardId of ['app', 'other']) socket.send(JSON.stringify({ type: 'subscribe_metrics', cardId, incremental: true }))
    for (const cardId of ['app', 'other']) expect(await nextMessage(messages)).toMatchObject({ type: 'metrics_snapshot', cardId, metrics: { history } })
    expect(socket.readyState).toBe(WebSocket.OPEN)
  })

  it('reuses status visibility per client without sharing access between users', async () => {
    getDiscoveredCards.mockResolvedValue({
      cards: [
        { id: 'protected', title: 'Protected', url: 'https://example.test', icon: { type: 'placeholder', initials: 'P' }, searchAliases: [], hasContainer: true, access: ['admins'], state: 'running' },
        { id: 'public', title: 'Public', url: 'https://example.test', icon: { type: 'placeholder', initials: 'P' }, searchAliases: [], hasContainer: true, access: [], state: 'running' }
      ]
    })
    const config = { ...getConfig(), metricsDatabasePath: ':memory:', enableAccessControl: true, accessGroupsHeader: 'X-Test-Groups' }
    const server = getRealtimeServer(config)
    const admin = await connect({ 'X-Test-Groups': 'admins' })
    const guest = await connect({ 'X-Test-Groups': 'guests' })
    expect(await nextMessage(admin.messages)).toMatchObject({ statuses: { protected: { state: 'running' }, public: { state: 'running' } } })
    expect(await nextMessage(guest.messages)).toMatchObject({ statuses: { public: { state: 'running' } } })
    const snapshot = vi.spyOn(globalThis.__dashmarkDiscoveryCoordinator!, 'getStatusSnapshot')
    await server.publishStatusDelta('protected', { state: 'paused' })
    expect(await nextMessage(admin.messages)).toMatchObject({ cardId: 'protected', status: { state: 'paused' } })
    expect(guest.messages).toEqual([])
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('releases cached histories when their last subscriber leaves or disconnects', async () => {
    const snapshot = vi.spyOn(snapshots, 'metricsSnapshot').mockImplementation((_config, _headers, cardId, cache) => {
      cache.set(cardId, new Map())
      return { resource: null, history: [], customMetrics: [], metricErrors: [], uptimeMetrics: [] }
    })
    const { socket, messages } = await connect()
    await nextMessage(messages)
    for (const cardId of ['app', 'other']) {
      socket.send(JSON.stringify({ type: 'subscribe_metrics', cardId }))
      await nextMessage(messages)
    }
    const cache = snapshot.mock.calls[0]![3]
    expect(cache.size).toBe(2)
    socket.send(JSON.stringify({ type: 'unsubscribe_metrics', cardId: 'app' }))
    await vi.waitFor(() => expect(cache.has('app')).toBe(false))
    socket.close()
    await vi.waitFor(() => expect(cache.size).toBe(0))
  })

  it('skips idle uptime aggregation and sends full buckets when a subscriber arrives', async () => {
    const usage = {
      historyPeriodMs: 300_000,
      customMetrics: [],
      uptimeMetrics: [{ key: 'uptime', label: 'Uptime', current: 'up' as const, observations: [{ timestamp: Date.now(), status: 'up' as const }] }],
      metricErrors: []
    }
    vi.spyOn(metrics, 'getLatestMetricUsage').mockReturnValue(usage)
    const aggregate = vi.spyOn(snapshots, 'uptimeBucketsByRange')
    const snapshot = vi
      .spyOn(snapshots, 'metricsSnapshot')
      .mockReturnValue({ resource: null, history: [], customMetrics: [], uptimeMetrics: [], metricErrors: [], historyPeriodMs: 300_000, pending: false })
    const server = getRealtimeServer({ ...getConfig(), metricsDatabasePath: ':memory:' })

    await server.publishMetricsDelta('app')
    expect(aggregate).not.toHaveBeenCalled()

    const { socket, messages } = await connect()
    await nextMessage(messages)
    socket.send(JSON.stringify({ type: 'subscribe_metrics', cardId: 'app' }))
    await nextMessage(messages)
    await server.publishMetricsDelta('app')
    expect(aggregate).toHaveBeenCalledOnce()
    expect(snapshot.mock.calls.at(-1)?.[4]).toBe(true)
    expect(await nextMessage(messages)).toMatchObject({ type: 'metrics_delta', cardId: 'app', metrics: { uptimeMetrics: [] } })
  })

  it('accepts an exact status subscription and sends its snapshot', async () => {
    const { socket, messages } = await connect()

    expect(await nextMessage(messages)).toEqual({ type: 'status_snapshot', version: 1, statuses: {}, capabilities: { incrementalMetricHistory: true } })
    socket.send(JSON.stringify({ type: 'subscribe_status' }))
    expect(await nextMessage(messages)).toEqual({ type: 'status_snapshot', version: 2, statuses: {}, capabilities: { incrementalMetricHistory: true } })
  })

  it('closes the socket when a message has an unexpected protocol field', async () => {
    const { socket, messages } = await connect()
    await nextMessage(messages)
    const closed = once(socket, 'close')
    socket.send(JSON.stringify({ type: 'subscribe_status', cardId: 'default:app' }))

    expect((await closed)[0]).toBe(1008)
  })

  it('closes the socket with unsupported-data for binary frames', async () => {
    const { socket, messages } = await connect()
    await nextMessage(messages)
    const closed = once(socket, 'close')
    socket.send(Buffer.from('subscribe_status'))

    expect((await closed)[0]).toBe(1003)
  })
})
