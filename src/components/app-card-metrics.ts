import type { CustomMetric, CustomMetricChart, CustomMetricUnit, ResourceMetricSample } from '@/lib/status'
import { defaultLocale, getMessages, type Locale } from '@/i18n'

const byteUnits = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const satisfies readonly Intl.NumberFormatOptions['unit'][]
const bitUnits = ['bit', 'kilobit', 'megabit', 'gigabit', 'terabit'] as const satisfies readonly Intl.NumberFormatOptions['unit'][]
const MAX_CHART_POINTS = 600

export const tickerConfig = {
  cpu: { color: 'var(--primary)' },
  memory: { color: 'var(--primary)' },
  received: { color: 'var(--info)' },
  sent: { color: 'var(--success)' }
}

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
  const index = normalizedValue === 0 ? 0 : Math.min(Math.floor(Math.log(normalizedValue) / Math.log(1_024)), byteUnits.length - 1)
  return { amount: normalizedValue / 1_024 ** index, index }
}

function formatNumber(value: number, significantDigits: number, locale: Locale = defaultLocale): string {
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: significantDigits }).format(value)
}

function formatBytesWithPrecision(value: number, significantDigits: number, locale: Locale = defaultLocale): string {
  return formatScaledUnit(value, byteUnits, significantDigits, locale)
}

function formatBitsWithPrecision(value: number, significantDigits: number, locale: Locale = defaultLocale): string {
  return formatScaledUnit(value, bitUnits, significantDigits, locale)
}

function formatScaledUnit(value: number, units: readonly Intl.NumberFormatOptions['unit'][], significantDigits: number, locale: Locale): string {
  const { amount, index } = byteParts(value)
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[index],
    unitDisplay: 'narrow',
    maximumSignificantDigits: significantDigits
  }).format(amount)
}

export function formatBytes(value: number, locale: Locale = defaultLocale): string {
  return formatBytesWithPrecision(value, 3, locale)
}

export function formatDetailedBytes(value: number, locale: Locale = defaultLocale): string {
  return formatBytesWithPrecision(value, 4, locale)
}

export function formatPercent(value: number, locale: Locale = defaultLocale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumSignificantDigits: 3 }).format(value / 100)
}

export function formatDetailedPercent(value: number, locale: Locale = defaultLocale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumSignificantDigits: 4 }).format(value / 100)
}

export function formatAxisPercent(value: number, locale: Locale = defaultLocale): string {
  return formatPercent(value, locale)
}

export function formatAxisBytes(value: number, locale: Locale = defaultLocale): string {
  return formatBytes(value, locale)
}

function formatDuration(value: number, significantDigits: number, locale: Locale): string {
  const [amount, unit]: [number, Intl.NumberFormatOptions['unit']] =
    value < 1 ? [value * 1_000, 'millisecond'] : value < 60 ? [value, 'second'] : value < 3_600 ? [value / 60, 'minute'] : [value / 3_600, 'hour']
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow', maximumSignificantDigits: significantDigits }).format(amount)
}

function formatUnit(value: number, unit: Intl.NumberFormatOptions['unit'], significantDigits: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow', maximumSignificantDigits: significantDigits }).format(value)
}

function formatCustomMetricWithPrecision(value: number, unit: CustomMetricUnit, significantDigits: number, locale: Locale): string {
  if (typeof unit === 'object') return `${formatNumber(value, significantDigits, locale)} ${unit.suffix}`
  if (unit === 'bytes') return formatBytesWithPrecision(value, significantDigits, locale)
  if (unit === 'bytes_per_second')
    return formatScaledUnit(
      value,
      byteUnits.map((unit) => `${unit}-per-second` as Intl.NumberFormatOptions['unit']),
      significantDigits,
      locale
    )
  if (unit === 'bits') return formatBitsWithPrecision(value, significantDigits, locale)
  if (unit === 'bits_per_second')
    return formatScaledUnit(
      value,
      bitUnits.map((unit) => `${unit}-per-second` as Intl.NumberFormatOptions['unit']),
      significantDigits,
      locale
    )
  if (unit === 'percent') return formatPercent(value, locale)
  if (unit === 'ratio') return formatPercent(value * 100, locale)
  if (unit === 'seconds') return formatUnit(value, 'second', significantDigits, locale)
  if (unit === 'milliseconds') return formatUnit(value, 'millisecond', significantDigits, locale)
  if (unit === 'microseconds') return formatUnit(value, 'microsecond', significantDigits, locale)
  if (unit === 'duration') return formatDuration(value, significantDigits, locale)
  if (unit === 'hertz') return formatUnit(value, 'hertz', significantDigits, locale)
  if (unit === 'watts') return formatUnit(value, 'watt', significantDigits, locale)
  if (unit === 'volts') return formatUnit(value, 'volt', significantDigits, locale)
  if (unit === 'amperes') return formatUnit(value, 'ampere', significantDigits, locale)
  if (unit === 'celsius') return formatUnit(value, 'celsius', significantDigits, locale)
  if (unit === 'fahrenheit') return formatUnit(value, 'fahrenheit', significantDigits, locale)
  if (unit === 'boolean') return value === 0 ? getMessages(locale).common.false : getMessages(locale).common.true
  return formatNumber(value, significantDigits, locale)
}

export function formatCustomMetric(value: number, unit: CustomMetricUnit, locale: Locale = defaultLocale): string {
  return formatCustomMetricWithPrecision(value, unit, 3, locale)
}

export function formatDetailedCustomMetric(value: number, unit: CustomMetricUnit, locale: Locale = defaultLocale): string {
  return formatCustomMetricWithPrecision(value, unit, 4, locale)
}

export function formatAxisCustomMetric(value: number, unit: CustomMetricUnit, locale: Locale = defaultLocale): string {
  if (unit === 'bytes') return formatAxisBytes(value, locale)
  if (unit === 'bytes_per_second') return formatCustomMetric(value, unit, locale)
  if (unit === 'bits') return formatCustomMetric(value, unit, locale)
  if (unit === 'bits_per_second') return formatCustomMetric(value, unit, locale)
  if (unit === 'percent') return formatAxisPercent(value, locale)
  if (unit === 'ratio') return formatAxisPercent(value * 100, locale)
  return formatCustomMetric(value, unit, locale)
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
  for (let index = start; index < end; index++) {
    const value = data[index]?.[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (minimum === undefined || value < (data[minimum]?.[key] as number)) minimum = index
    if (maximum === undefined || value > (data[maximum]?.[key] as number)) maximum = index
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

export function customMetricsHistory(metrics: Extract<CustomMetric, { unit: CustomMetricUnit }>[]): MetricSample[] {
  const samples = new Map<number, MetricSample>()
  for (const metric of metrics)
    for (const sample of metric.history) {
      const point = samples.get(sample.timestamp) ?? {
        timestamp: sample.timestamp
      }
      point[metric.key] = sample.value
      samples.set(sample.timestamp, point)
    }
  return [...samples.values()].sort((left, right) => left.timestamp - right.timestamp)
}
