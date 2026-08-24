import { isDashmarkError, isRecord, type DashmarkError } from './errors'

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
}

export type ResourceMetricSample = ContainerResources & {
  timestamp: number
}

export type CustomMetricSample = { timestamp: number; value: number }
export type CustomMetricChart = 'step' | 'line' | 'area' | 'none'
export type CustomMetricUnit =
  | 'number' | 'count' | 'percent' | 'ratio' | 'bytes' | 'bytes_per_second'
  | 'bits' | 'bits_per_second' | 'seconds' | 'milliseconds' | 'microseconds'
  | 'duration' | 'hertz' | 'watts' | 'volts' | 'amperes' | 'celsius'
  | 'fahrenheit' | 'boolean' | { suffix: string }
export type NumericCustomMetric = {
  key: string
  label: string
  unit: CustomMetricUnit
  chart: CustomMetricChart
  value: number
  history: CustomMetricSample[]
  historyPeriodMs: number
}
export type TextCustomMetric = { key: string; label: string; value: string }
export type CustomMetric = NumericCustomMetric | TextCustomMetric
export type MetricError = { key: string; message: string }

export type StatusResponse =
  | { statuses: Record<string, ContainerStatus> }
  | { error: DashmarkError }

export type ResourceUsageResponse = {
  resource: ContainerResources | null
  history?: ResourceMetricSample[]
  historyPeriodMs?: number
  customMetrics: CustomMetric[]
  metricErrors: MetricError[]
}

function isContainerStatus(value: unknown): value is ContainerStatus {
  return isRecord(value)
    && (value.state === undefined || typeof value.state === 'string')
    && (value.health === undefined || typeof value.health === 'string')
    && !('cpuPercent' in value)
    && !('memoryUsage' in value)
    && !('memoryLimit' in value)
    && !('receivedBytesPerSecond' in value)
    && !('sentBytesPerSecond' in value)
}

function isContainerResources(value: unknown): value is ContainerResources {
  return isRecord(value)
    && (value.cpuPercent === undefined || typeof value.cpuPercent === 'number')
    && (value.memoryUsage === undefined || typeof value.memoryUsage === 'number')
    && (value.memoryLimit === undefined || typeof value.memoryLimit === 'number')
    && (value.receivedBytesPerSecond === undefined || typeof value.receivedBytesPerSecond === 'number')
    && (value.sentBytesPerSecond === undefined || typeof value.sentBytesPerSecond === 'number')
}

function isResourceMetricSample(value: unknown): value is ResourceMetricSample {
  return isRecord(value) && typeof value.timestamp === 'number' && isContainerResources(value)
}

export function isResourceUsageResponse(value: unknown): value is ResourceUsageResponse {
  return isRecord(value) && 'resource' in value
    && (value.resource === null || isContainerResources(value.resource))
    && (value.history === undefined || (Array.isArray(value.history) && value.history.every(isResourceMetricSample)))
    && (value.historyPeriodMs === undefined || (typeof value.historyPeriodMs === 'number' && value.historyPeriodMs > 0))
    && Array.isArray(value.customMetrics) && value.customMetrics.every(isCustomMetric)
    && Array.isArray(value.metricErrors) && value.metricErrors.every(isMetricError)
}

function isCustomMetricSample(value: unknown): value is CustomMetricSample {
  return isRecord(value) && typeof value.timestamp === 'number' && typeof value.value === 'number' && Number.isFinite(value.value)
}

function isCustomMetric(value: unknown): value is CustomMetric {
  return isRecord(value)
    && typeof value.key === 'string' && typeof value.label === 'string'
    && (typeof value.value === 'string' || (
      typeof value.value === 'number' && Number.isFinite(value.value)
      && isCustomMetricUnit(value.unit)
      && isCustomMetricChart(value.chart)
      && Array.isArray(value.history) && value.history.every(isCustomMetricSample)
      && typeof value.historyPeriodMs === 'number' && value.historyPeriodMs > 0
    ))
}

function isCustomMetricUnit(value: unknown): value is CustomMetricUnit {
  return (typeof value === 'string' && [
    'number', 'count', 'percent', 'ratio', 'bytes', 'bytes_per_second',
    'bits', 'bits_per_second', 'seconds', 'milliseconds', 'microseconds',
    'duration', 'hertz', 'watts', 'volts', 'amperes', 'celsius', 'fahrenheit', 'boolean'
  ].includes(value)) || (isRecord(value) && typeof value.suffix === 'string')
}

function isCustomMetricChart(value: unknown): value is CustomMetricChart {
  return value === 'step' || value === 'line' || value === 'area' || value === 'none'
}

function isMetricError(value: unknown): value is MetricError {
  return isRecord(value) && typeof value.key === 'string' && typeof value.message === 'string'
}

export function isStatusResponse(value: unknown): value is StatusResponse {
  if (!isRecord(value)) return false
  if ('error' in value) return isDashmarkError(value.error)
  return 'statuses' in value
    && isRecord(value.statuses)
    && Object.values(value.statuses).every(isContainerStatus)
}
