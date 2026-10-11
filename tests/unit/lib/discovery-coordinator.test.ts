import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ discover: vi.fn(), watch: vi.fn<(config: unknown, onChange: () => void) => () => void>(() => () => {}), retention: vi.fn() }))
vi.mock('@/lib/docker', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/docker')>()), getDiscoveredCards: mocks.discover, watchContainerEvents: mocks.watch }))
vi.mock('@/lib/metrics-storage', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/metrics-storage')>()), refreshMetricRetention: mocks.retention }))
import { getConfig } from '@/lib/config'
import { getDiscoveryCoordinator } from '@/lib/discovery-coordinator'
import type { Card } from '@/lib/docker'
import * as docker from '@/lib/docker'

afterEach(() => {
  globalThis.__dashmarkDiscoveryCoordinator?.clear()
  globalThis.__dashmarkDiscoveryCoordinator = undefined
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('looks up only the requested card, preserves access rules, and refreshes its index after discovery', async () => {
  vi.useFakeTimers()
  const cards: Card[] = Array.from({ length: 20 }, (_, index) => ({
    id: `card-${index}`,
    title: `Service ${index}`,
    url: 'https://example.test',
    icon: { type: 'placeholder', initials: 'S' },
    searchAliases: [],
    hasContainer: true,
    access: ['admins'],
    resourceStats: ['cpu', 'memory', 'network']
  }))
  mocks.discover.mockResolvedValue({ cards })
  const config = { ...getConfig(), enableAccessControl: true, showMetrics: true, accessGroupsHeader: 'X-Test-Groups' }
  const coordinator = getDiscoveryCoordinator(config)
  coordinator.start()
  await coordinator.ready()
  const filter = vi.spyOn(docker, 'filterCardsByAccess')
  const admins = new Headers({ 'X-Test-Groups': 'admins' })

  expect(coordinator.getMetricAccess(admins, 'card-17')).toBeDefined()
  expect(filter.mock.calls[0]?.[0]).toEqual([cards[17]])
  expect(coordinator.getMetricAccess(new Headers({ 'X-Test-Groups': 'guests' }), 'card-17')).toBeUndefined()
  expect(coordinator.getMetricAccess(admins, 'missing')).toBeUndefined()

  const onChange = mocks.watch.mock.calls[0]![1]
  mocks.discover.mockResolvedValue({ cards: [{ ...cards[17]!, metricsHistoryPeriodMs: 10_000 }] })
  onChange()
  await vi.advanceTimersByTimeAsync(250)
  expect(coordinator.getMetricAccess(admins, 'card-17')?.historyPeriodMs).toBe(10_000)
  expect(coordinator.getMetricAccess(admins, 'card-0')).toBeUndefined()
  coordinator.clear()
  expect(coordinator.getMetricAccess(admins, 'card-17')).toBeUndefined()
})

it('serializes discovery and coalesces events arriving while a refresh is in flight', async () => {
  vi.useFakeTimers()
  const first = Promise.withResolvers<{ cards: Card[] }>()
  const second = Promise.withResolvers<{ cards: Card[] }>()
  mocks.discover.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue({ cards: [] })
  const coordinator = getDiscoveryCoordinator(getConfig())
  coordinator.start()
  const onChange = mocks.watch.mock.calls[0]?.[1]
  if (!onChange) throw new Error('Expected a Docker event listener')

  for (let index = 0; index < 20; index++) onChange()
  await vi.advanceTimersByTimeAsync(1_000)
  expect(mocks.discover).toHaveBeenCalledOnce()
  first.resolve({ cards: [] })
  await coordinator.ready()
  await vi.advanceTimersByTimeAsync(250)
  expect(mocks.discover).toHaveBeenCalledTimes(2)
  for (let index = 0; index < 20; index++) onChange()
  await vi.advanceTimersByTimeAsync(1_000)
  expect(mocks.discover).toHaveBeenCalledTimes(2)
  second.resolve({ cards: [] })
  await vi.advanceTimersByTimeAsync(250)
  expect(mocks.discover).toHaveBeenCalledTimes(3)
})
