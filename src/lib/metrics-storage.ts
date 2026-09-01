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

export type MetricRetentionTarget = {
  cardId: string
  historyPeriodMs: number
  hasResourceMetrics: boolean
  customMetricKeys: readonly string[]
  uptimeMetricKeys: readonly string[]
}

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
    CREATE TABLE IF NOT EXISTS card_metric_retention (
      card_id TEXT PRIMARY KEY,
      retention_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS uptime_metric_retention (
      card_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      retention_ms INTEGER NOT NULL,
      PRIMARY KEY (card_id, metric_key)
    );
  `)
  state = { path, database: db }
  return db
}

export function saveResourceMetric(config: AppConfig, cardId: string, resource: ContainerResources, historyPeriodMs = config.metricsHistoryPeriodMs, timestamp = Date.now()): void {
  const db = metricsDatabase(config.metricsDatabasePath)
  db.prepare('INSERT INTO card_metric_retention (card_id, retention_ms) VALUES (?, ?) ON CONFLICT(card_id) DO UPDATE SET retention_ms = excluded.retention_ms').run(cardId, historyPeriodMs)
  db.prepare(
    `
    INSERT INTO resource_metrics (
      card_id, timestamp, cpu_percent, memory_usage, memory_limit,
      received_bytes_per_second, sent_bytes_per_second
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(cardId, timestamp, resource.cpuPercent ?? null, resource.memoryUsage ?? null, resource.memoryLimit ?? null, resource.receivedBytesPerSecond ?? null, resource.sentBytesPerSecond ?? null)
  db.prepare('DELETE FROM resource_metrics WHERE card_id = ? AND timestamp < ?').run(cardId, timestamp - historyPeriodMs)
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
  db.prepare('INSERT INTO card_metric_retention (card_id, retention_ms) VALUES (?, ?) ON CONFLICT(card_id) DO UPDATE SET retention_ms = excluded.retention_ms').run(cardId, historyPeriodMs)
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
  const retentionMs = Math.max(historyPeriodMs, UPTIME_HISTORY_PERIOD_MS)
  db.prepare('INSERT INTO uptime_metric_retention (card_id, metric_key, retention_ms) VALUES (?, ?, ?) ON CONFLICT(card_id, metric_key) DO UPDATE SET retention_ms = excluded.retention_ms').run(
    cardId,
    metricKey,
    retentionMs
  )
  const cutoff = now - retentionMs
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
  db.prepare('DELETE FROM resource_metrics WHERE timestamp < ? - (SELECT retention_ms FROM card_metric_retention WHERE card_id = resource_metrics.card_id)').run(timestamp)
  db.prepare('DELETE FROM metric_samples WHERE timestamp < ? - (SELECT retention_ms FROM card_metric_retention WHERE card_id = metric_samples.card_id)').run(timestamp)
  db.prepare(
    'DELETE FROM uptime_observations WHERE timestamp < ? - (SELECT retention_ms FROM uptime_metric_retention WHERE card_id = uptime_observations.card_id AND metric_key = uptime_observations.metric_key)'
  ).run(timestamp)
}

export function refreshMetricRetention(config: AppConfig, targets: readonly MetricRetentionTarget[], timestamp = Date.now()): void {
  const db = metricsDatabase(config.metricsDatabasePath)
  const cardTargets = new Map(targets.filter((target) => target.hasResourceMetrics || target.customMetricKeys.length > 0).map((target) => [target.cardId, target]))
  const customMetricKeys = new Map(targets.map((target) => [target.cardId, new Set(target.customMetricKeys)]))
  const uptimeTargets = new Map(
    targets.flatMap((target) =>
      target.uptimeMetricKeys.map((metricKey) => [`${target.cardId}\0${metricKey}`, { cardId: target.cardId, metricKey, retentionMs: Math.max(target.historyPeriodMs, UPTIME_HISTORY_PERIOD_MS) }])
    )
  )

  db.exec('BEGIN')
  try {
    const saveCardRetention = db.prepare('INSERT INTO card_metric_retention (card_id, retention_ms) VALUES (?, ?) ON CONFLICT(card_id) DO UPDATE SET retention_ms = excluded.retention_ms')
    for (const target of cardTargets.values()) saveCardRetention.run(target.cardId, target.historyPeriodMs)

    const saveUptimeRetention = db.prepare(
      'INSERT INTO uptime_metric_retention (card_id, metric_key, retention_ms) VALUES (?, ?, ?) ON CONFLICT(card_id, metric_key) DO UPDATE SET retention_ms = excluded.retention_ms'
    )
    for (const target of uptimeTargets.values()) saveUptimeRetention.run(target.cardId, target.metricKey, target.retentionMs)

    const deleteCardRetention = db.prepare('DELETE FROM card_metric_retention WHERE card_id = ?')
    for (const { cardId } of db.prepare('SELECT card_id AS cardId FROM card_metric_retention').all() as { cardId: string }[]) {
      if (!cardTargets.has(cardId)) deleteCardRetention.run(cardId)
    }
    const deleteUptimeRetention = db.prepare('DELETE FROM uptime_metric_retention WHERE card_id = ? AND metric_key = ?')
    for (const target of db.prepare('SELECT card_id AS cardId, metric_key AS metricKey FROM uptime_metric_retention').all() as { cardId: string; metricKey: string }[]) {
      if (!uptimeTargets.has(`${target.cardId}\0${target.metricKey}`)) deleteUptimeRetention.run(target.cardId, target.metricKey)
    }

    const deleteResource = db.prepare('DELETE FROM resource_metrics WHERE card_id = ?')
    for (const { cardId } of db.prepare('SELECT DISTINCT card_id AS cardId FROM resource_metrics').all() as { cardId: string }[]) {
      if (!cardTargets.get(cardId)?.hasResourceMetrics) deleteResource.run(cardId)
    }
    const deleteCustomMetric = db.prepare('DELETE FROM metric_samples WHERE card_id = ? AND metric_key = ?')
    for (const row of db.prepare('SELECT DISTINCT card_id AS cardId, metric_key AS metricKey FROM metric_samples').all() as { cardId: string; metricKey: string }[]) {
      if (!customMetricKeys.get(row.cardId)?.has(row.metricKey)) deleteCustomMetric.run(row.cardId, row.metricKey)
    }
    const deleteUptime = db.prepare('DELETE FROM uptime_observations WHERE card_id = ? AND metric_key = ?')
    for (const row of db.prepare('SELECT DISTINCT card_id AS cardId, metric_key AS metricKey FROM uptime_observations').all() as { cardId: string; metricKey: string }[]) {
      if (!uptimeTargets.has(`${row.cardId}\0${row.metricKey}`)) deleteUptime.run(row.cardId, row.metricKey)
    }

    pruneMetricHistory(config, timestamp)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function clearMetricsStorage(): void {
  state?.database.close()
  state = undefined
}
