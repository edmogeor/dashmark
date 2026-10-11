import type { AppConfig } from './config'
import { METRIC_RECOVERY_INTERVAL_MS, METRIC_RECOVERY_MAX_RETRY_MS, METRIC_RECOVERY_MAX_CHECKPOINT_BYTES } from './constants'
import { metricsDatabase } from './metrics-storage'
import { logger } from './logger'
import type { MetricRecoveryState } from './status'

type RecoveryStep = (checkpoint: string) => Promise<{ checkpoint?: string; save: () => void }>
type RecoveryJob = {
  cardId: string
  metricKey: string
  source: string
  checkpoint: string
  retryAt: number
  failures: number
  recover: RecoveryStep
}

const jobs = new Map<string, RecoveryJob>()
let databasePath: string | undefined
let nextAttemptAt = 0
let running = false

function isRecoveryCheckpoint(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= METRIC_RECOVERY_MAX_CHECKPOINT_BYTES && Buffer.byteLength(value) <= METRIC_RECOVERY_MAX_CHECKPOINT_BYTES
}

function useDatabase(config: AppConfig): void {
  if (databasePath === config.metricsDatabasePath) return
  clearMetricRecoveryQueue()
  databasePath = config.metricsDatabasePath
}

export function savedMetricRecovery(config: AppConfig, cardId: string, metricKey: string, source: string): string | undefined {
  useDatabase(config)
  const row = metricsDatabase(config.metricsDatabasePath).prepare('SELECT source, checkpoint FROM metric_recovery WHERE card_id = ? AND metric_key = ?').get(cardId, metricKey)
  if (row && row.source !== source) {
    cancelMetricRecovery(config, cardId, metricKey)
    return undefined
  }
  return typeof row?.checkpoint === 'string' ? row.checkpoint : undefined
}

export function cancelMetricRecovery(config: AppConfig, cardId: string, metricKey: string, sourcePrefix?: string): void {
  useDatabase(config)
  const db = metricsDatabase(config.metricsDatabasePath)
  const key = `${cardId}\0${metricKey}`
  if (sourcePrefix !== undefined) {
    const source = jobs.get(key)?.source ?? db.prepare('SELECT source FROM metric_recovery WHERE card_id = ? AND metric_key = ?').get(cardId, metricKey)?.source
    if (typeof source !== 'string' || !source.startsWith(sourcePrefix)) return
  }
  jobs.delete(key)
  db.prepare('DELETE FROM metric_recovery WHERE card_id = ? AND metric_key = ?').run(cardId, metricKey)
}

export function hasMetricRecovery(cardId: string, metricKey: string): boolean {
  return jobs.has(`${cardId}\0${metricKey}`)
}

export function enqueueMetricRecovery(config: AppConfig, cardId: string, metricKey: string, source: string, checkpoint: string, recover: RecoveryStep): void {
  if (!isRecoveryCheckpoint(checkpoint)) throw new Error('Invalid or oversized recovery checkpoint')
  useDatabase(config)
  const key = `${cardId}\0${metricKey}`
  const previous = jobs.get(key)
  if (previous?.source === source && previous.checkpoint === checkpoint) {
    previous.recover = recover
    return
  }
  const db = metricsDatabase(config.metricsDatabasePath)
  db.prepare(
    `INSERT INTO metric_recovery (card_id, metric_key, source, checkpoint) VALUES (?, ?, ?, ?)
    ON CONFLICT(card_id, metric_key) DO UPDATE SET source = excluded.source, checkpoint = excluded.checkpoint,
      retry_at = CASE WHEN source = excluded.source THEN retry_at ELSE 0 END,
      failures = CASE WHEN source = excluded.source THEN failures ELSE 0 END`
  ).run(cardId, metricKey, source, checkpoint)
  const row = db.prepare('SELECT retry_at AS retryAt, failures FROM metric_recovery WHERE card_id = ? AND metric_key = ?').get(cardId, metricKey)
  jobs.set(key, { cardId, metricKey, source, checkpoint, retryAt: Number(row?.retryAt ?? 0), failures: Number(row?.failures ?? 0), recover })
}

export function metricRecoveryStates(cardId: string): Record<string, MetricRecoveryState> {
  const states: Record<string, MetricRecoveryState> = {}
  for (const job of jobs.values()) if (job.cardId === cardId) states[job.metricKey] = job.failures > 0 ? 'retrying' : 'recovering'
  return states
}

export function pruneMetricRecoveryQueue(config: AppConfig, active: ReadonlySet<string>): void {
  useDatabase(config)
  const db = metricsDatabase(config.metricsDatabasePath)
  for (const [key, job] of jobs) {
    if (active.has(key)) continue
    jobs.delete(key)
    db.prepare('DELETE FROM metric_recovery WHERE card_id = ? AND metric_key = ?').run(job.cardId, job.metricKey)
  }
}

export function nextMetricRecoveryAt(): number {
  if (running || jobs.size === 0) return Infinity
  let earliest = Infinity
  for (const job of jobs.values()) earliest = Math.min(earliest, job.retryAt)
  return Math.max(nextAttemptAt, earliest)
}

export async function recoverNextMetric(config: AppConfig): Promise<{ cardId: string; metricKey: string } | undefined> {
  useDatabase(config)
  if (Date.now() < nextMetricRecoveryAt()) return undefined
  let entry: [string, RecoveryJob] | undefined
  for (const candidate of jobs) {
    if (candidate[1].retryAt <= Date.now()) {
      entry = candidate
      break
    }
  }
  if (!entry) return undefined
  const [key, job] = entry
  running = true
  try {
    const result = await job.recover(job.checkpoint)
    if (jobs.get(key) !== job) return undefined
    if (result.checkpoint !== undefined && !isRecoveryCheckpoint(result.checkpoint)) throw new Error('Invalid or oversized recovery checkpoint')
    result.save()
    const db = metricsDatabase(config.metricsDatabasePath)
    if (result.checkpoint === undefined) {
      db.prepare('DELETE FROM metric_recovery WHERE card_id = ? AND metric_key = ?').run(job.cardId, job.metricKey)
      jobs.delete(key)
    } else {
      job.checkpoint = result.checkpoint
      job.failures = 0
      job.retryAt = 0
      db.prepare('UPDATE metric_recovery SET checkpoint = ?, failures = 0, retry_at = 0 WHERE card_id = ? AND metric_key = ?').run(job.checkpoint, job.cardId, job.metricKey)
      jobs.delete(key)
      jobs.set(key, job)
    }
  } catch {
    if (jobs.get(key) !== job) return undefined
    job.failures = Math.min(job.failures + 1, 10)
    job.retryAt = Date.now() + Math.min(METRIC_RECOVERY_INTERVAL_MS * 2 ** job.failures, METRIC_RECOVERY_MAX_RETRY_MS)
    metricsDatabase(config.metricsDatabasePath)
      .prepare('UPDATE metric_recovery SET failures = ?, retry_at = ? WHERE card_id = ? AND metric_key = ?')
      .run(job.failures, job.retryAt, job.cardId, job.metricKey)
    jobs.delete(key)
    jobs.set(key, job)
    logger.warn('metrics', 'history recovery deferred', { cardId: job.cardId, key: job.metricKey, retryAt: job.retryAt })
  } finally {
    running = false
    nextAttemptAt = Date.now() + METRIC_RECOVERY_INTERVAL_MS
  }
  return { cardId: job.cardId, metricKey: job.metricKey }
}

export function clearMetricRecoveryQueue(): void {
  jobs.clear()
  databasePath = undefined
  nextAttemptAt = 0
  running = false
}
