import type { NumericCustomMetric, ResourceMetricSample } from '@/lib/status'

const MAX_CHART_POINTS = 600

export type MetricSample = { timestamp: number } & Partial<Record<string, number>>
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

export function metricData(history: MetricSample[], series: MetricSeries[]): ChartPoint[] {
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

function bucketExtrema(data: ChartPoint[], key: string, start: number, end: number): number[] {
  let minimum: number | undefined
  let maximum: number | undefined
  let minimumValue: number | undefined
  let maximumValue: number | undefined
  for (let index = start; index < end; index++) {
    const value = data[index]?.[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (minimumValue === undefined || value < minimumValue) {
      minimum = index
      minimumValue = value
    }
    if (maximumValue === undefined || value > maximumValue) {
      maximum = index
      maximumValue = value
    }
  }
  return [minimum, maximum].filter((index): index is number => index !== undefined)
}

export function downsampleChartData(data: ChartPoint[], series: MetricSeries[]): ChartPoint[] {
  if (data.length <= MAX_CHART_POINTS) return data
  const selected = new Set([0, data.length - 1])
  const bucketCount = Math.max(1, Math.floor((MAX_CHART_POINTS - 2) / (series.length * 2)))
  const bucketSize = Math.ceil((data.length - 2) / bucketCount)
  for (let start = 1; start < data.length - 1; start += bucketSize) {
    const end = Math.min(start + bucketSize, data.length - 1)
    for (const seriesItem of series) for (const index of bucketExtrema(data, seriesItem.key, start, end)) selected.add(index)
  }
  return [...selected].sort((left, right) => left - right).map((index) => data[index]!)
}

export function resourceMetricHistory(history: ResourceMetricSample[]): MetricSample[] {
  return history.map((sample) => ({
    timestamp: sample.timestamp,
    cpu: sample.cpuPercent,
    memory: sample.memoryUsage,
    received: sample.receivedBytesPerSecond,
    sent: sample.sentBytesPerSecond
  }))
}

export function customMetricsHistory(metrics: NumericCustomMetric[]): MetricSample[] {
  const samples = new Map<number, MetricSample>()
  for (const metric of metrics)
    for (const sample of metric.history) {
      const point = samples.get(sample.timestamp) ?? { timestamp: sample.timestamp }
      point[metric.key] = sample.value
      samples.set(sample.timestamp, point)
    }
  return [...samples.values()].sort((left, right) => left.timestamp - right.timestamp)
}
