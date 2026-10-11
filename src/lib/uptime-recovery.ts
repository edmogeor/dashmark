import type { AppConfig } from './config'
import { METRIC_RECOVERY_MAX_OBSERVATIONS } from './constants'
import { enqueueMetricRecovery } from './metric-recovery'
import { saveUptimeObservationHistory } from './metrics-storage'
import { isUptimeObservation, type UptimeObservation } from './status'

export type UptimeRecoveryBatch = { observations: UptimeObservation[]; nextCheckpoint?: string }

export function enqueueUptimeRecovery(
  config: AppConfig,
  cardId: string,
  metricKey: string,
  source: string,
  checkpoint: string,
  retentionMs: number,
  fetchBatch: (checkpoint: string, retentionCutoff: number) => Promise<UptimeRecoveryBatch>
): void {
  enqueueMetricRecovery(config, cardId, metricKey, source, checkpoint, async (cursor) => {
    const batch = await fetchBatch(cursor, Date.now() - retentionMs)
    if (!Array.isArray(batch.observations) || batch.observations.length > METRIC_RECOVERY_MAX_OBSERVATIONS || !batch.observations.every(isUptimeObservation)) {
      throw new Error('Invalid or oversized uptime recovery batch')
    }
    if (batch.nextCheckpoint !== undefined && (typeof batch.nextCheckpoint !== 'string' || !batch.nextCheckpoint || batch.nextCheckpoint === cursor)) {
      throw new Error('History recovery checkpoint is not advancing')
    }
    const now = Date.now()
    return {
      checkpoint: batch.nextCheckpoint,
      save: () =>
        saveUptimeObservationHistory(
          config,
          cardId,
          metricKey,
          batch.observations.filter((observation) => observation.timestamp >= now - retentionMs && observation.timestamp <= now),
          retentionMs,
          now
        )
    }
  })
}
