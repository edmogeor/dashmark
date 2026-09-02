import { isDashmarkError, isRecord, type DashmarkError } from './errors'
import type { CustomMetricChart } from './config-file-types'

export type CustomMetricStateColor = 'success' | 'info' | 'warning' | 'error' | 'disabled'

export type ContainerStatus = {
  state?: string
  health?: string
}

export type ContainerResources = {
  cpuPercent?: number
  memoryUsage?: number
  memoryLimit?: number
  receivedBytesPerSecond?: number
  sentBytesPerSecond?: number
  networkRatePending?: boolean
}

export type ResourceMetricSample = ContainerResources & {
  timestamp: number
}

export type CustomMetricSample = { timestamp: number; value: number }
export type CustomMetricUnit =
  | 'number'
  | 'count'
  | 'percent'
  | 'ratio'
  | 'bytes'
  | 'bytes_per_second'
  | 'bits'
  | 'bits_per_second'
  | 'seconds'
  | 'milliseconds'
  | 'microseconds'
  | 'duration'
  | 'hertz'
  | 'watts'
  | 'volts'
  | 'amperes'
  | 'celsius'
  | 'fahrenheit'
  | 'boolean'
  | { suffix: string }
export type NumericCustomMetric = {
  key: string
  label: string
  unit: CustomMetricUnit
  chart: CustomMetricChart
  chartGroup?: string
  value: number
  pending?: true
  history: CustomMetricSample[]
  historyPeriodMs: number
}
export type TextCustomMetric = { key: string; label: string; value: string }
export type StateCustomMetric = TextCustomMetric & { color: CustomMetricStateColor; valueLabel?: string }
export type CustomMetric = NumericCustomMetric | TextCustomMetric | StateCustomMetric
export type MetricError = { key: string; code: 'collection_failed' | 'configuration_invalid' }

export type UptimeStatus = 'up' | 'down' | 'unknown'
export type UptimeObservation = { timestamp: number; status: UptimeStatus; responseTimeMs?: number }
export type UptimeMetric = {
  key: string
  label: string
  current: UptimeStatus
  observations: UptimeObservation[]
}

export type StatusResponse = { statuses: Record<string, ContainerStatus> } | { error: DashmarkError }

export type MetricsResponse = {
  resource: ContainerResources | null
  history?: ResourceMetricSample[]
  historyPeriodMs?: number
  pending?: boolean
  customMetrics: CustomMetric[]
  uptimeMetrics?: UptimeMetric[]
  metricErrors: MetricError[]
}

function isContainerStatus(value: unknown): value is ContainerStatus {
  return (
    isRecord(value) &&
    (value.state === undefined || typeof value.state === 'string') &&
    (value.health === undefined || typeof value.health === 'string') &&
    !('cpuPercent' in value) &&
    !('memoryUsage' in value) &&
    !('memoryLimit' in value) &&
    !('receivedBytesPerSecond' in value) &&
    !('sentBytesPerSecond' in value)
  )
}

function isContainerResources(value: unknown): value is ContainerResources {
  return (
    isRecord(value) &&
    (value.cpuPercent === undefined || typeof value.cpuPercent === 'number') &&
    (value.memoryUsage === undefined || typeof value.memoryUsage === 'number') &&
    (value.memoryLimit === undefined || typeof value.memoryLimit === 'number') &&
    (value.receivedBytesPerSecond === undefined || typeof value.receivedBytesPerSecond === 'number') &&
    (value.sentBytesPerSecond === undefined || typeof value.sentBytesPerSecond === 'number') &&
    (value.networkRatePending === undefined || typeof value.networkRatePending === 'boolean')
  )
}

function isResourceMetricSample(value: unknown): value is ResourceMetricSample {
  return isRecord(value) && typeof value.timestamp === 'number' && isContainerResources(value)
}

export function isMetricsResponse(value: unknown): value is MetricsResponse {
  return (
    isRecord(value) &&
    'resource' in value &&
    (value.resource === null || isContainerResources(value.resource)) &&
    (value.history === undefined || (Array.isArray(value.history) && value.history.every(isResourceMetricSample))) &&
    (value.historyPeriodMs === undefined || (typeof value.historyPeriodMs === 'number' && value.historyPeriodMs > 0)) &&
    (value.pending === undefined || typeof value.pending === 'boolean') &&
    Array.isArray(value.customMetrics) &&
    value.customMetrics.every(isCustomMetric) &&
    (value.uptimeMetrics === undefined || (Array.isArray(value.uptimeMetrics) && value.uptimeMetrics.every(isUptimeMetric))) &&
    Array.isArray(value.metricErrors) &&
    value.metricErrors.every(isMetricError)
  )
}

function isUptimeMetric(value: unknown): value is UptimeMetric {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.label === 'string' &&
    isUptimeStatus(value.current) &&
    Array.isArray(value.observations) &&
    value.observations.every(isUptimeObservation)
  )
}

function isUptimeObservation(value: unknown): value is UptimeObservation {
  return (
    isRecord(value) &&
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp) &&
    isUptimeStatus(value.status) &&
    (value.responseTimeMs === undefined || (typeof value.responseTimeMs === 'number' && Number.isFinite(value.responseTimeMs)))
  )
}

function isUptimeStatus(value: unknown): value is UptimeStatus {
  return value === 'up' || value === 'down' || value === 'unknown'
}

function isCustomMetricSample(value: unknown): value is CustomMetricSample {
  return isRecord(value) && typeof value.timestamp === 'number' && typeof value.value === 'number' && Number.isFinite(value.value)
}

function isCustomMetric(value: unknown): value is CustomMetric {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.label === 'string' &&
    ((typeof value.value === 'string' && (value.color === undefined || isCustomMetricStateColor(value.color)) && (value.valueLabel === undefined || typeof value.valueLabel === 'string')) ||
      (typeof value.value === 'number' &&
        Number.isFinite(value.value) &&
        isCustomMetricUnit(value.unit) &&
        isCustomMetricChart(value.chart) &&
        (value.chartGroup === undefined || typeof value.chartGroup === 'string') &&
        (value.pending === undefined || value.pending === true) &&
        Array.isArray(value.history) &&
        value.history.every(isCustomMetricSample) &&
        typeof value.historyPeriodMs === 'number' &&
        value.historyPeriodMs > 0))
  )
}

function isCustomMetricStateColor(value: unknown): value is CustomMetricStateColor {
  return value === 'success' || value === 'info' || value === 'warning' || value === 'error' || value === 'disabled'
}

function isCustomMetricUnit(value: unknown): value is CustomMetricUnit {
  return (
    (typeof value === 'string' &&
      [
        'number',
        'count',
        'percent',
        'ratio',
        'bytes',
        'bytes_per_second',
        'bits',
        'bits_per_second',
        'seconds',
        'milliseconds',
        'microseconds',
        'duration',
        'hertz',
        'watts',
        'volts',
        'amperes',
        'celsius',
        'fahrenheit',
        'boolean'
      ].includes(value)) ||
    (isRecord(value) && typeof value.suffix === 'string')
  )
}

function isCustomMetricChart(value: unknown): value is CustomMetricChart {
  return value === 'step' || value === 'line' || value === 'area' || value === 'none'
}

function isMetricError(value: unknown): value is MetricError {
  return isRecord(value) && typeof value.key === 'string' && (value.code === 'collection_failed' || value.code === 'configuration_invalid')
}

export function isStatusResponse(value: unknown): value is StatusResponse {
  if (!isRecord(value)) return false
  if ('error' in value) return isDashmarkError(value.error)
  return 'statuses' in value && isRecord(value.statuses) && Object.values(value.statuses).every(isContainerStatus)
}
