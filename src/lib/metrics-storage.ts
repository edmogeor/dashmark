import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AppConfig } from './config'
import { UPTIME_HISTORY_PERIOD_MS } from './constants'
import type { ContainerResources, ResourceMetricSample, UptimeObservation } from './status'

type DatabaseState = { path: string; database: DatabaseSync }
type DatabaseMetricRow = {
  timestamp: number
  cpuPercent: number | null
  memoryUsage: number | null
  memoryLimit: number | null
  receivedBytesPerSecond: number | null
  sentBytesPerSecond: number | null
}
type GenericMetricRow = { timestamp: number; value: number }
type DatabaseUptimeObservation = { timestamp: number; status: UptimeObservation['status']; responseTimeMs: number }

let state: DatabaseState | undefined

function observationKey(observation: UptimeObservation): string {
  return `${observation.timestamp}\0${observation.status}\0${observation.responseTimeMs ?? ''}`
}

export function metricsDatabase(path: string): DatabaseSync {
  if (state?.path === path) return state.database
  state?.database.close()
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS resource_metrics (
      card_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      cpu_percent REAL,
      memory_usage INTEGER,
      memory_limit INTEGER,
      received_bytes_per_second REAL,
      sent_bytes_per_second REAL
    );
    CREATE INDEX IF NOT EXISTS resource_metrics_card_timestamp
      ON resource_metrics (card_id, timestamp);
    CREATE TABLE IF NOT EXISTS metric_samples (
      card_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      value REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS metric_samples_card_key_timestamp
      ON metric_samples (card_id, metric_key, timestamp);
    CREATE TABLE IF NOT EXISTS uptime_observations (
      card_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      status TEXT NOT NULL,
      response_time_ms REAL NOT NULL DEFAULT -1,
      PRIMARY KEY (card_id, metric_key, timestamp, status, response_time_ms)
    );
    CREATE INDEX IF NOT EXISTS uptime_observations_card_key_timestamp
      ON uptime_observations (card_id, metric_key, timestamp);
  `)
  state = { path, database: db }
  return db
}

export function saveResourceMetric(config: AppConfig, cardId: string, resource: ContainerResources, historyPeriodMs = config.metricsHistoryPeriodMs, timestamp = Date.now()): void {
  const db = metricsDatabase(config.metricsDatabasePath)
  db.prepare(
    `
    INSERT INTO resource_metrics (
      card_id, timestamp, cpu_percent, memory_usage, memory_limit,
      received_bytes_per_second, sent_bytes_per_second
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(cardId, timestamp, resource.cpuPercent ?? null, resource.memoryUsage ?? null, resource.memoryLimit ?? null, resource.receivedBytesPerSecond ?? null, resource.sentBytesPerSecond ?? null)
  db.prepare('DELETE FROM resource_metrics WHERE card_id = ? AND timestamp < ?').run(cardId, timestamp - historyPeriodMs)
  for (const [key, value] of Object.entries({
    cpu: resource.cpuPercent,
    memory: resource.memoryUsage,
    received: resource.receivedBytesPerSecond,
    sent: resource.sentBytesPerSecond
  })) {
    if (value !== undefined) saveMetricSample(config, cardId, key, value, historyPeriodMs, timestamp)
  }
}

export function getResourceMetricHistory(config: AppConfig, cardId: string, historyPeriodMs = config.metricsHistoryPeriodMs, now = Date.now()): ResourceMetricSample[] {
  const rows = metricsDatabase(config.metricsDatabasePath)
    .prepare(
      `SELECT timestamp, cpu_percent AS cpuPercent, memory_usage AS memoryUsage, memory_limit AS memoryLimit, received_bytes_per_second AS receivedBytesPerSecond, sent_bytes_per_second AS sentBytesPerSecond FROM resource_metrics WHERE card_id = ? AND timestamp >= ? ORDER BY timestamp`
    )
    .all(cardId, now - historyPeriodMs) as DatabaseMetricRow[]
  return rows.map((row) => ({
    timestamp: row.timestamp,
    cpuPercent: row.cpuPercent ?? undefined,
    memoryUsage: row.memoryUsage ?? undefined,
    memoryLimit: row.memoryLimit ?? undefined,
    receivedBytesPerSecond: row.receivedBytesPerSecond ?? undefined,
    sentBytesPerSecond: row.sentBytesPerSecond ?? undefined
  }))
}

export function saveMetricSample(config: AppConfig, cardId: string, metricKey: string, value: number, historyPeriodMs = config.metricsHistoryPeriodMs, timestamp = Date.now()): void {
  if (!Number.isFinite(value)) return
  const db = metricsDatabase(config.metricsDatabasePath)
  db.prepare('INSERT INTO metric_samples (card_id, metric_key, timestamp, value) VALUES (?, ?, ?, ?)').run(cardId, metricKey, timestamp, value)
  db.prepare('DELETE FROM metric_samples WHERE card_id = ? AND metric_key = ? AND timestamp < ?').run(cardId, metricKey, timestamp - historyPeriodMs)
}

export function getMetricHistory(config: AppConfig, cardId: string, metricKey: string, historyPeriodMs = config.metricsHistoryPeriodMs, now = Date.now()): GenericMetricRow[] {
  return metricsDatabase(config.metricsDatabasePath)
    .prepare('SELECT timestamp, value FROM metric_samples WHERE card_id = ? AND metric_key = ? AND timestamp >= ? ORDER BY timestamp')
    .all(cardId, metricKey, now - historyPeriodMs) as GenericMetricRow[]
}

export function getUptimeObservationHistory(config: AppConfig, cardId: string, metricKey: string, historyPeriodMs: number, now = Date.now()): UptimeObservation[] {
  const rows = metricsDatabase(config.metricsDatabasePath)
    .prepare('SELECT timestamp, status, response_time_ms AS responseTimeMs FROM uptime_observations WHERE card_id = ? AND metric_key = ? AND timestamp >= ? ORDER BY timestamp')
    .all(cardId, metricKey, now - historyPeriodMs) as DatabaseUptimeObservation[]
  return rows.map(({ timestamp, status, responseTimeMs }) => ({ timestamp, status, ...(responseTimeMs < 0 ? {} : { responseTimeMs }) }))
}

export function mergeUptimeObservationHistory(config: AppConfig, cardId: string, metricKey: string, observations: UptimeObservation[], historyPeriodMs: number, now = Date.now()): UptimeObservation[] {
  const stored = getUptimeObservationHistory(config, cardId, metricKey, historyPeriodMs, now)
  const merged = new Map(stored.map((observation) => [observationKey(observation), observation]))
  for (const observation of observations) merged.set(observationKey(observation), observation)
  const db = metricsDatabase(config.metricsDatabasePath)
  const cutoff = now - historyPeriodMs
  db.exec('BEGIN')
  try {
    const insert = db.prepare('INSERT OR IGNORE INTO uptime_observations (card_id, metric_key, timestamp, status, response_time_ms) VALUES (?, ?, ?, ?, ?)')
    for (const observation of observations) insert.run(cardId, metricKey, observation.timestamp, observation.status, observation.responseTimeMs ?? -1)
    db.prepare('DELETE FROM uptime_observations WHERE card_id = ? AND metric_key = ? AND timestamp < ?').run(cardId, metricKey, cutoff)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return [...merged.values()].filter((observation) => observation.timestamp >= cutoff).sort((a, b) => a.timestamp - b.timestamp)
}

export function pruneMetricHistory(config: AppConfig, timestamp: number): void {
  const db = metricsDatabase(config.metricsDatabasePath)
  const cutoff = timestamp - config.metricsHistoryPeriodMs
  db.prepare('DELETE FROM resource_metrics WHERE timestamp < ?').run(cutoff)
  db.prepare('DELETE FROM metric_samples WHERE timestamp < ?').run(cutoff)
  db.prepare('DELETE FROM uptime_observations WHERE timestamp < ?').run(timestamp - Math.max(config.metricsHistoryPeriodMs, UPTIME_HISTORY_PERIOD_MS))
}

export function clearMetricsStorage(): void {
  state?.database.close()
  state = undefined
}
