import type {
  CustomMetric,
  CustomMetricChart,
  CustomMetricUnit,
  ResourceMetricSample,
} from '@/lib/status'

const units = ['B', 'KB', 'MB', 'GB', 'TB']
const MAX_CHART_POINTS = 600

export const tickerConfig = {
  cpu: { color: 'var(--primary)' },
  memory: { color: 'var(--primary)' },
  received: { color: 'var(--info)' },
  sent: { color: 'var(--success)' },
}

export type MetricSample = { timestamp: number } & Partial<
  Record<string, number>
>
export type ChartPoint = {
  timestamp: number
  [key: string]: number | string | undefined
}

export type MetricSeries = {
  key: string
  label: string
  color: string
  value: (sample: MetricSample) => number | undefined
}

export type MetricDetail = {
  label: string
  history: MetricSample[]
  historyPeriodMs: number
  series: MetricSeries[]
  formatValue: (value: number) => string
  formatTooltipValue?: (value: number) => string
  formatAxisValue?: (value: number) => string
  chart?: Exclude<CustomMetricChart, 'none'>
  customMetricKeys?: string[]
}

function byteParts(value: number): { amount: number; index: number } {
  const normalizedValue = Math.max(0, value)
  const index =
    normalizedValue === 0
      ? 0
      : Math.min(
          Math.floor(Math.log(normalizedValue) / Math.log(1_024)),
          units.length - 1,
        )
  return { amount: normalizedValue / 1_024 ** index, index }
}

function formatNumber(value: number, significantDigits: number): string {
  return value.toLocaleString(undefined, { maximumSignificantDigits: significantDigits })
}

function formatBytesWithPrecision(value: number, significantDigits: number): string {
  const { amount, index } = byteParts(value)
  return `${formatNumber(amount, significantDigits)} ${units[index]}`
}

export function formatBytes(value: number): string {
  return formatBytesWithPrecision(value, 3)
}

export function formatDetailedBytes(value: number): string {
  return formatBytesWithPrecision(value, 4)
}

export function formatPercent(value: number): string {
  return `${formatNumber(value, 3)}%`
}

export function formatDetailedPercent(value: number): string {
  return `${formatNumber(value, 4)}%`
}

export function formatAxisPercent(value: number): string {
  return formatPercent(value)
}

export function formatAxisBytes(value: number): string {
  return formatBytes(value)
}

function formatDuration(value: number, significantDigits: number): string {
  if (value < 1) return `${formatNumber(value * 1_000, significantDigits)}ms`
  if (value < 60) return `${formatNumber(value, significantDigits)}s`
  if (value < 3_600) return `${formatNumber(value / 60, significantDigits)}m`
  return `${formatNumber(value / 3_600, significantDigits)}h`
}

function formatCustomMetricWithPrecision(
  value: number,
  unit: CustomMetricUnit,
  significantDigits: number,
): string {
  if (typeof unit === 'object')
    return `${formatNumber(value, significantDigits)} ${unit.suffix}`
  if (unit === 'bytes') return formatBytesWithPrecision(value, significantDigits)
  if (unit === 'bytes_per_second') return `${formatBytesWithPrecision(value, significantDigits)}/s`
  if (unit === 'bits') return `${formatBytesWithPrecision(value / 8, significantDigits)}b`
  if (unit === 'bits_per_second') return `${formatBytesWithPrecision(value / 8, significantDigits)}b/s`
  if (unit === 'percent') return `${formatNumber(value, significantDigits)}%`
  if (unit === 'ratio') return `${formatNumber(value * 100, significantDigits)}%`
  if (unit === 'seconds') return `${formatNumber(value, significantDigits)}s`
  if (unit === 'milliseconds') return `${formatNumber(value, significantDigits)}ms`
  if (unit === 'microseconds') return `${formatNumber(value, significantDigits)}us`
  if (unit === 'duration') return formatDuration(value, significantDigits)
  if (unit === 'hertz') return `${formatNumber(value, significantDigits)} Hz`
  if (unit === 'watts') return `${formatNumber(value, significantDigits)} W`
  if (unit === 'volts') return `${formatNumber(value, significantDigits)} V`
  if (unit === 'amperes') return `${formatNumber(value, significantDigits)} A`
  if (unit === 'celsius') return `${formatNumber(value, significantDigits)} C`
  if (unit === 'fahrenheit') return `${formatNumber(value, significantDigits)} F`
  if (unit === 'boolean') return value === 0 ? 'False' : 'True'
  return formatNumber(value, significantDigits)
}

export function formatCustomMetric(value: number, unit: CustomMetricUnit): string {
  return formatCustomMetricWithPrecision(value, unit, 3)
}

export function formatDetailedCustomMetric(
  value: number,
  unit: CustomMetricUnit,
): string {
  return formatCustomMetricWithPrecision(value, unit, 4)
}

export function formatAxisCustomMetric(
  value: number,
  unit: CustomMetricUnit,
): string {
  if (unit === 'bytes') return formatAxisBytes(value)
  if (unit === 'bytes_per_second') return `${formatAxisBytes(value)}/s`
  if (unit === 'bits') return `${formatAxisBytes(value / 8)}b`
  if (unit === 'bits_per_second') return `${formatAxisBytes(value / 8)}b/s`
  if (unit === 'percent') return formatAxisPercent(value)
  if (unit === 'ratio') return formatAxisPercent(value * 100)
  return formatCustomMetric(value, unit)
}

export function metricData(
  history: MetricSample[],
  series: MetricSeries[],
): ChartPoint[] {
  return history.flatMap((sample) => {
    if (!Number.isFinite(sample.timestamp)) return []
    const point: ChartPoint = { timestamp: sample.timestamp }
    for (const item of series) {
      const value = item.value(sample)
      if (Number.isFinite(value)) point[item.key] = value
    }
    return series.some((item) => point[item.key] !== undefined) ? [point] : []
  })
}

function bucketExtrema(
  data: ChartPoint[],
  key: string,
  start: number,
  end: number,
): number[] {
  let minimum: number | undefined
  let maximum: number | undefined
  for (let index = start; index < end; index++) {
    const value = data[index]?.[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (minimum === undefined || value < (data[minimum]?.[key] as number))
      minimum = index
    if (maximum === undefined || value > (data[maximum]?.[key] as number))
      maximum = index
  }
  return [minimum, maximum].filter(
    (index): index is number => index !== undefined,
  )
}

export function downsampleChartData(
  data: ChartPoint[],
  series: MetricSeries[],
): ChartPoint[] {
  if (data.length <= MAX_CHART_POINTS) return data
  const selected = new Set([0, data.length - 1])
  const bucketCount = Math.max(
    1,
    Math.floor((MAX_CHART_POINTS - 2) / (series.length * 2)),
  )
  const bucketSize = Math.ceil((data.length - 2) / bucketCount)
  for (let start = 1; start < data.length - 1; start += bucketSize) {
    const end = Math.min(start + bucketSize, data.length - 1)
    for (const seriesItem of series)
      for (const index of bucketExtrema(data, seriesItem.key, start, end))
        selected.add(index)
  }
  return [...selected]
    .sort((left, right) => left - right)
    .map((index) => data[index]!)
}

export function resourceMetricHistory(
  history: ResourceMetricSample[],
): MetricSample[] {
  return history.map((sample) => ({
    timestamp: sample.timestamp,
    cpu: sample.cpuPercent,
    memory: sample.memoryUsage,
    received: sample.receivedBytesPerSecond,
    sent: sample.sentBytesPerSecond,
  }))
}

export function customMetricsHistory(
  metrics: Extract<CustomMetric, { unit: CustomMetricUnit }>[],
): MetricSample[] {
  const samples = new Map<number, MetricSample>()
  for (const metric of metrics)
    for (const sample of metric.history) {
      const point = samples.get(sample.timestamp) ?? {
        timestamp: sample.timestamp,
      }
      point[metric.key] = sample.value
      samples.set(sample.timestamp, point)
    }
  return [...samples.values()].sort(
    (left, right) => left.timestamp - right.timestamp,
  )
}
