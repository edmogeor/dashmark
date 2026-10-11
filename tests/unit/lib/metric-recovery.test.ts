import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getConfig } from '@/lib/config'
import { METRIC_RECOVERY_RETRY_BASE_MS, METRIC_RECOVERY_MAX_CHECKPOINT_BYTES } from '@/lib/constants'
import { clearMetricsDatabase } from '@/lib/metrics'
import {
  enqueueMetricRecovery,
  metricRecoveryStates,
  nextMetricRecoveryAt,
  pruneMetricRecoveryQueue,
  recoverNextMetric,
  retainMetricRecoveryPriority,
  savedMetricRecovery
} from '@/lib/metric-recovery'

beforeEach(() => vi.stubEnv('ENABLE_METRIC_BACKFILL', 'true'))

afterEach(() => {
  clearMetricsDatabase()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('pauses disabled recovery without changing saved checkpoints or scheduling immediate retries', async () => {
  const config = getConfig()
  const fetch = vi.fn(async () => ({ save: () => {} }))
  enqueueMetricRecovery(config, 'app', 'history', 'source', 'page-2', fetch)
  config.enableMetricBackfill = false
  enqueueMetricRecovery(config, 'app', 'history', 'source', 'replacement', fetch)
  expect(await recoverNextMetric(config)).toBeUndefined()
  expect(nextMetricRecoveryAt(config)).toBe(Infinity)
  expect(savedMetricRecovery(config, 'app', 'history', 'source')).toBe('page-2')
  expect(fetch).not.toHaveBeenCalled()
  config.enableMetricBackfill = true
  await recoverNextMetric(config)
  expect(fetch).toHaveBeenCalledExactlyOnceWith('page-2')
})

it('deduplicates jobs and rotates providers fairly without delaying successful pages', async () => {
  const config = getConfig()
  vi.spyOn(Date, 'now').mockReturnValue(1_000)
  const saves: string[] = []
  const first = vi.fn(async (checkpoint: string) => ({ checkpoint: checkpoint === 'first-page' ? 'second-page' : undefined, save: () => saves.push('numeric-history') }))
  const second = vi.fn(async () => ({ save: () => saves.push('uptime-history') }))
  enqueueMetricRecovery(config, 'a', 'other-provider/history', 'source-a', 'first-page', first)
  enqueueMetricRecovery(config, 'a', 'other-provider/history', 'source-a', 'first-page', first)
  enqueueMetricRecovery(config, 'b', 'another-provider/uptime', 'source-b', 'first-page', second)

  expect(await recoverNextMetric(config)).toEqual({ cardId: 'a', metricKey: 'other-provider/history' })
  expect(first).toHaveBeenCalledTimes(1)
  expect(savedMetricRecovery(config, 'a', 'other-provider/history', 'source-a')).toBe('second-page')
  expect(nextMetricRecoveryAt()).toBe(0)
  expect(await recoverNextMetric(config)).toEqual({ cardId: 'b', metricKey: 'another-provider/uptime' })
  expect(saves).toEqual(['numeric-history', 'uptime-history'])
  expect(metricRecoveryStates('b')).toEqual({})
  expect(await recoverNextMetric(config)).toEqual({ cardId: 'a', metricKey: 'other-provider/history' })
  expect(first).toHaveBeenLastCalledWith('second-page')
  expect(saves).toEqual(['numeric-history', 'uptime-history', 'numeric-history'])
  expect(nextMetricRecoveryAt()).toBe(Infinity)
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
  expect((await recoverNextMetric(config))?.cardId).toBe('b')
  expect(failed).toHaveBeenCalledTimes(1)
  expect(nextMetricRecoveryAt()).toBe(now + METRIC_RECOVERY_RETRY_BASE_MS * 2)
  now += METRIC_RECOVERY_RETRY_BASE_MS * 2 - 1
  expect(await recoverNextMetric(config)).toBeUndefined()
  now += 1
  expect((await recoverNextMetric(config))?.cardId).toBe('a')
  expect(failed).toHaveBeenCalledTimes(2)
  expect(nextMetricRecoveryAt()).toBe(now + METRIC_RECOVERY_RETRY_BASE_MS * 4)
})

it('exclusively prioritizes the viewed metric and resumes background work after its last viewer leaves', async () => {
  const config = getConfig()
  const collected: string[] = []
  for (const [cardId, key] of [
    ['background', 'history'],
    ['viewed', 'hidden'],
    ['viewed', 'history']
  ]) {
    enqueueMetricRecovery(config, cardId, key, cardId, 'first', async () => ({
      checkpoint: 'next',
      save: () => {
        collected.push(`${cardId}/${key}`)
      }
    }))
  }
  const release = retainMetricRecoveryPriority('viewed', (key) => key === 'history')
  const releaseOtherViewer = retainMetricRecoveryPriority('viewed', (key) => key === 'history')
  await recoverNextMetric(config)
  release()
  await recoverNextMetric(config)
  expect(collected).toEqual(['viewed/history', 'viewed/history'])
  releaseOtherViewer()
  await recoverNextMetric(config)
  expect(collected.at(-1)).toBe('background/history')
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
