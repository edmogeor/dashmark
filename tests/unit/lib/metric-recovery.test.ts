import { afterEach, expect, it, vi } from 'vitest'
import { getConfig } from '@/lib/config'
import { METRIC_RECOVERY_INTERVAL_MS, METRIC_RECOVERY_MAX_CHECKPOINT_BYTES } from '@/lib/constants'
import { clearMetricsDatabase } from '@/lib/metrics'
import { enqueueMetricRecovery, metricRecoveryStates, nextMetricRecoveryAt, pruneMetricRecoveryQueue, recoverNextMetric, savedMetricRecovery } from '@/lib/metric-recovery'

afterEach(() => {
  clearMetricsDatabase()
  vi.restoreAllMocks()
})

it('deduplicates jobs, rotates providers fairly, and permits only one page per interval', async () => {
  const config = getConfig()
  let now = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const saves: string[] = []
  const first = vi.fn(async () => ({ checkpoint: 'second-page', save: () => saves.push('numeric-history') }))
  const second = vi.fn(async () => ({ save: () => saves.push('uptime-history') }))
  enqueueMetricRecovery(config, 'a', 'other-provider/history', 'source-a', 'first-page', first)
  enqueueMetricRecovery(config, 'a', 'other-provider/history', 'source-a', 'first-page', first)
  enqueueMetricRecovery(config, 'b', 'another-provider/uptime', 'source-b', 'first-page', second)

  expect(await recoverNextMetric(config)).toEqual({ cardId: 'a', metricKey: 'other-provider/history' })
  expect(await recoverNextMetric(config)).toBeUndefined()
  expect(first).toHaveBeenCalledTimes(1)
  expect(savedMetricRecovery(config, 'a', 'other-provider/history', 'source-a')).toBe('second-page')
  expect(nextMetricRecoveryAt()).toBe(now + METRIC_RECOVERY_INTERVAL_MS)
  now += METRIC_RECOVERY_INTERVAL_MS
  await recoverNextMetric(config)
  expect(saves).toEqual(['numeric-history', 'uptime-history'])
  expect(metricRecoveryStates('b')).toEqual({})
})

it('backs off failures without losing the checkpoint or blocking another provider', async () => {
  const config = getConfig()
  let now = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const failed = vi.fn(async () => {
    throw new Error('offline')
  })
  enqueueMetricRecovery(config, 'a', 'history', 'a', 'page-2', failed)
  enqueueMetricRecovery(config, 'b', 'history', 'b', 'page-2', async () => ({ save: () => {} }))
  await recoverNextMetric(config)
  expect(metricRecoveryStates('a')).toEqual({ history: 'retrying' })
  expect(savedMetricRecovery(config, 'a', 'history', 'a')).toBe('page-2')
  now += METRIC_RECOVERY_INTERVAL_MS
  expect((await recoverNextMetric(config))?.cardId).toBe('b')
  expect(failed).toHaveBeenCalledTimes(1)
})

it('does not run concurrently or save an in-flight page for a removed metric', async () => {
  const config = getConfig()
  let finish!: (value: { save: () => void }) => void
  const save = vi.fn()
  enqueueMetricRecovery(
    config,
    'a',
    'history',
    'a',
    'page-2',
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = recoverNextMetric(config)
  expect(await recoverNextMetric(config)).toBeUndefined()
  pruneMetricRecoveryQueue(config, new Set())
  finish({ save })
  expect(await pending).toBeUndefined()
  expect(save).not.toHaveBeenCalled()
  expect(savedMetricRecovery(config, 'a', 'history', 'a')).toBeUndefined()
})

it('bounds checkpoint metadata before queuing or saving a recovered batch', async () => {
  const config = getConfig()
  const oversized = 'x'.repeat(METRIC_RECOVERY_MAX_CHECKPOINT_BYTES + 1)
  const save = vi.fn()
  expect(() => enqueueMetricRecovery(config, 'a', 'history', 'source', oversized, async () => ({ save }))).toThrow('Invalid or oversized recovery checkpoint')
  enqueueMetricRecovery(config, 'a', 'history', 'source', 'initial', async () => ({ checkpoint: oversized, save }))
  await recoverNextMetric(config)
  expect(save).not.toHaveBeenCalled()
  expect(savedMetricRecovery(config, 'a', 'history', 'source')).toBe('initial')
  expect(metricRecoveryStates('a')).toEqual({ history: 'retrying' })
})
