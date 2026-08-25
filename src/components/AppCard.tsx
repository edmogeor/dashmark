import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { Gauge, Info, LoaderCircle, Server, X } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts'
import { StatusBadge } from './StatusBadge'
import { MarqueeText } from './MarqueeText'
import type { Card as CardType } from '@/lib/docker'
import { getInitials } from '@/lib/initials'
import { strings } from '@/lib/strings'
import { useIsDark } from '@/lib/use-is-dark'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isResourceUsageResponse, type ContainerResources, type CustomMetric, type CustomMetricChart, type CustomMetricStateColor, type CustomMetricUnit, type NumericCustomMetric, type ResourceMetricSample } from '@/lib/status'
import { RESOURCE_USAGE_POLL_INTERVAL_MS, TOOLTIP_DELAY_MS } from '@/lib/constants'
import { useTooltipController } from './tooltip-controller'
import { badgeColor, chartColorVariable } from '@/lib/badge-color'
import { clearErrorToast, showErrorToast } from '@/lib/error-toasts'

type AppCardProps = {
  card: CardType
  showStatus?: boolean
  showResourceUsage?: boolean
  asCard?: boolean
  isLoading?: boolean
  openInNewTab?: boolean
}

function InitialsPlaceholder({ title, asCard }: { title: string; asCard: boolean }) {
  return (
    <div className={cn(
      'dashmark-app-icon dashmark-app-icon-placeholder flex h-12 w-12 items-center justify-center rounded-lg pl-1 text-sm font-semibold text-foreground/50',
      asCard ? 'bg-surface dark:bg-background' : 'bg-card'
    )}>
      {getInitials(title)}
    </div>
  )
}

function selfhstVariantUrl(src: string, suffix: 'light' | 'dark'): string {
  return src.replace(/\.svg$/, `-${suffix}.svg`)
}

function useContrastAwareSrc(icon: CardType['icon']): string | undefined {
  const isDark = useIsDark()
  if (icon.type !== 'image') return undefined
  if (!icon.contrast) return icon.src
  if (icon.contrast === 'dark' && isDark) return selfhstVariantUrl(icon.src, 'light')
  if (icon.contrast === 'light' && !isDark) return selfhstVariantUrl(icon.src, 'dark')
  return icon.src
}

function AppIcon({ icon, title, asCard }: { icon: CardType['icon']; title: string; asCard: boolean }) {
  const [error, setError] = useState(false)
  const src = useContrastAwareSrc(icon)

  if (icon.type === 'image' && src && !error) {
    return (
      <img
        src={src}
        alt={icon.alt}
        className="dashmark-app-icon h-12 w-12 object-contain pl-1"
        loading="lazy"
        onError={() => setError(true)}
      />
    )
  }

  return <InitialsPlaceholder title={title} asCard={asCard} />
}

const units = ['B', 'KB', 'MB', 'GB', 'TB']

function byteParts(value: number): { amount: number; index: number } {
  const normalizedValue = Math.max(0, value)
  const index = normalizedValue === 0 ? 0 : Math.min(Math.floor(Math.log(normalizedValue) / Math.log(1_024)), units.length - 1)
  const amount = normalizedValue / 1_024 ** index
  return { amount, index }
}

function formatBytes(value: number): string {
  const { amount, index } = byteParts(value)
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`
}

function formatPercent(value: number): string {
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`
}

function formatAxisPercent(value: number): string {
  return `${Math.round(value / 5) * 5}%`
}

function formatAxisBytes(value: number): string {
  const { amount, index } = byteParts(value)
  const rounded = amount >= 10 ? Math.round(amount / 5) * 5 : Math.round(amount * 10) / 10
  return `${rounded} ${units[index]}`
}

function formatAxisCustomMetric(value: number, unit: CustomMetricUnit): string {
  if (unit === 'bytes') return formatAxisBytes(value)
  if (unit === 'bytes_per_second') return `${formatAxisBytes(value)}/s`
  if (unit === 'bits') return `${formatAxisBytes(value / 8)}b`
  if (unit === 'bits_per_second') return `${formatAxisBytes(value / 8)}b/s`
  if (unit === 'percent') return formatAxisPercent(value)
  if (unit === 'ratio') return formatAxisPercent(value * 100)
  if (unit === 'boolean') return formatCustomMetric(value, unit)
  return formatCustomMetric(Math.round(value / 5) * 5, unit)
}

function formatDuration(value: number): string {
  if (value < 1) return `${(value * 1_000).toFixed(0)}ms`
  if (value < 60) return `${value.toFixed(value < 10 ? 1 : 0)}s`
  if (value < 3_600) return `${(value / 60).toFixed(1)}m`
  return `${(value / 3_600).toFixed(1)}h`
}

function formatCustomMetric(value: number, unit: CustomMetricUnit): string {
  if (typeof unit === 'object') return `${value.toLocaleString()} ${unit.suffix}`
  if (unit === 'bytes') return formatBytes(value)
  if (unit === 'bytes_per_second') return `${formatBytes(value)}/s`
  if (unit === 'bits') return `${formatBytes(value / 8)}b`
  if (unit === 'bits_per_second') return `${formatBytes(value / 8)}b/s`
  if (unit === 'percent') return formatPercent(value)
  if (unit === 'ratio') return formatPercent(value * 100)
  if (unit === 'seconds') return `${value.toFixed(2)}s`
  if (unit === 'milliseconds') return `${value.toFixed(0)}ms`
  if (unit === 'microseconds') return `${value.toFixed(0)}us`
  if (unit === 'duration') return formatDuration(value)
  if (unit === 'hertz') return `${value.toLocaleString()} Hz`
  if (unit === 'watts') return `${value.toLocaleString()} W`
  if (unit === 'volts') return `${value.toLocaleString()} V`
  if (unit === 'amperes') return `${value.toLocaleString()} A`
  if (unit === 'celsius') return `${value.toLocaleString()} C`
  if (unit === 'fahrenheit') return `${value.toLocaleString()} F`
  if (unit === 'boolean') return value === 0 ? 'False' : 'True'
  return value.toLocaleString()
}

const tickerConfig = {
  cpu: { color: 'var(--primary)' },
  memory: { color: 'var(--primary)' },
  received: { color: 'var(--info)' },
  sent: { color: 'var(--success)' }
} satisfies ChartConfig

type MetricSample = { timestamp: number } & Partial<Record<string, number>>
type ChartPoint = { timestamp: number; [key: string]: number | string | undefined }

type MetricSeries = {
  key: string
  label: string
  color: string
  value: (sample: MetricSample) => number | undefined
}

type MetricDetail = {
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

const MAX_CHART_POINTS = 600
const timestampFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const exactTimestampFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })

function metricData(history: MetricSample[], series: MetricSeries[]): ChartPoint[] {
  return history.flatMap(sample => {
    if (!Number.isFinite(sample.timestamp)) return []
    const point: ChartPoint = { timestamp: sample.timestamp }
    for (const item of series) {
      const value = item.value(sample)
      if (Number.isFinite(value)) point[item.key] = value
    }
    return series.some(item => point[item.key] !== undefined) ? [point] : []
  })
}

function finiteChartValue(data: ChartPoint[], index: number, key: string): number | undefined {
  const value = data[index]?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

type ChartExtrema = { minimum?: number; maximum?: number }

function smallestIndex(data: ChartPoint[], key: string, current: number | undefined, index: number, value: number): number {
  const currentValue = current === undefined ? undefined : finiteChartValue(data, current, key)
  return currentValue === undefined || value < currentValue ? index : current!
}

function largestIndex(data: ChartPoint[], key: string, current: number | undefined, index: number, value: number): number {
  const currentValue = current === undefined ? undefined : finiteChartValue(data, current, key)
  return currentValue === undefined || value > currentValue ? index : current!
}

function updateBucketExtrema(data: ChartPoint[], key: string, index: number, value: number, extrema: ChartExtrema): void {
  extrema.minimum = smallestIndex(data, key, extrema.minimum, index, value)
  extrema.maximum = largestIndex(data, key, extrema.maximum, index, value)
}

function bucketExtrema(data: ChartPoint[], key: string, start: number, end: number): number[] {
  const extrema: ChartExtrema = {}
  for (let index = start; index < end; index++) {
    const value = finiteChartValue(data, index, key)
    if (value === undefined) continue
    updateBucketExtrema(data, key, index, value, extrema)
  }
  return [extrema.minimum, extrema.maximum].filter((index): index is number => index !== undefined)
}

function addBucketExtrema(data: ChartPoint[], series: MetricSeries[], selected: Set<number>, start: number, end: number): void {
  for (const item of series) {
    for (const index of bucketExtrema(data, item.key, start, end)) selected.add(index)
  }
}

function downsampleChartData(data: ChartPoint[], series: MetricSeries[]): ChartPoint[] {
  if (data.length <= MAX_CHART_POINTS) return data

  const selected = new Set([0, data.length - 1])
  const bucketCount = Math.max(1, Math.floor((MAX_CHART_POINTS - 2) / (series.length * 2)))
  const bucketSize = Math.ceil((data.length - 2) / bucketCount)
  for (let start = 1; start < data.length - 1; start += bucketSize) {
    addBucketExtrema(data, series, selected, start, Math.min(start + bucketSize, data.length - 1))
  }
  return [...selected].sort((left, right) => left - right).map(index => data[index]!)
}

function chartDomain(values: number[]): [number, number] {
  const finiteValues = values.filter(Number.isFinite)
  if (finiteValues.length === 0) return [0, 1]
  const minimum = Math.min(...finiteValues)
  const maximum = Math.max(...finiteValues)
  const padding = Math.max((maximum - minimum) * 0.1, Math.abs(maximum) * 0.05, 1)
  const domain: [number, number] = [minimum - padding, maximum + padding]
  return domain.every(Number.isFinite) ? domain : [0, 1]
}

function resourceMetricHistory(history: ResourceMetricSample[]): MetricSample[] {
  return history.map(sample => ({
    timestamp: sample.timestamp,
    cpu: sample.cpuPercent,
    memory: sample.memoryUsage,
    received: sample.receivedBytesPerSecond,
    sent: sample.sentBytesPerSecond
  }))
}

function customMetricsHistory(metrics: Extract<CustomMetric, { unit: CustomMetricUnit }>[]): MetricSample[] {
  const samples = new Map<number, MetricSample>()
  for (const metric of metrics) {
    for (const sample of metric.history) {
      const point = samples.get(sample.timestamp) ?? { timestamp: sample.timestamp }
      point[metric.key] = sample.value
      samples.set(sample.timestamp, point)
    }
  }
  return [...samples.values()].sort((left, right) => left.timestamp - right.timestamp)
}

function formatTimestamp(timestamp: unknown): string {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return ''
  return timestampFormatter.format(value)
}

function formatExactTimestamp(timestamp: unknown): string {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return ''
  return exactTimestampFormatter.format(value)
}

function formatAxisValue(formatValue: (value: number) => string): (value: unknown) => string {
  return value => {
    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? formatValue(numericValue) : ''
  }
}

function demoResourceUsage(cardId: string, timestamp: number): ResourceMetricSample {
  const phase = [...cardId].reduce((total, character) => total + character.charCodeAt(0), 0) / 20
  const seconds = timestamp / 1_000
  return {
    timestamp,
    cpuPercent: 18 + Math.sin(seconds / 7 + phase) * 12 + Math.sin(seconds / 2 + phase) * 3,
    memoryUsage: (850 + Math.sin(seconds / 18 + phase) * 120) * 1_024 * 1_024,
    memoryLimit: 2 * 1_024 * 1_024 * 1_024,
    receivedBytesPerSecond: (1_200 + Math.sin(seconds / 5 + phase) * 450) * 1_024,
    sentBytesPerSecond: (320 + Math.sin(seconds / 8 + phase) * 180) * 1_024
  }
}

const MetricDetailDialog = memo(function MetricDetailDialog({ detail, onOpen, onOpenChange }: { detail: MetricDetail | null; onOpen: () => void; onOpenChange: (open: boolean) => void }) {
  const chartGradientId = useId().replace(/:/g, '')
  const [displayedDetail, setDisplayedDetail] = useState(detail)
  useEffect(() => {
    if (detail) setDisplayedDetail(detail)
  }, [detail])
  const currentDetail = detail ?? displayedDetail
  const data = useMemo(() => {
    if (!currentDetail) return []
    const chartData = downsampleChartData(metricData(currentDetail.history, currentDetail.series), currentDetail.series)
    return chartData.map((point, index, points) => {
      const pointWithLabels: ChartPoint = { ...point }
      for (const item of currentDetail.series) {
        const value = point[item.key]
        if (index === points.length - 1 && typeof value === 'number') {
          pointWithLabels[`${item.key}Label`] = currentDetail.formatValue(value)
        }
      }
      return pointWithLabels
    })
  }, [currentDetail])
  const values = currentDetail ? data.flatMap(point => currentDetail.series.flatMap(item => {
    const value = point[item.key]
    return typeof value === 'number' ? [value] : []
  })) : []
  const domain = chartDomain(values)
  const end = data.at(-1)?.timestamp ?? Date.now()
  const start = end - (currentDetail?.historyPeriodMs ?? 5 * 60_000)
  const timeTicks = Array.from({ length: 4 }, (_, index) => start + ((end - start) * index) / 3)
  const chart = currentDetail?.chart ?? 'step'
  const Chart = chart === 'area' ? AreaChart : LineChart
  const axisFormatter = useMemo(
    () => currentDetail ? formatAxisValue(currentDetail.formatAxisValue ?? currentDetail.formatValue) : () => '',
    [currentDetail]
  )

  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="dashmark-metric-dialog"
        onOpenAutoFocus={onOpen}
        onAnimationEnd={event => {
          if (event.target === event.currentTarget && event.currentTarget.dataset.state === 'closed') setDisplayedDetail(null)
        }}
      >
        {currentDetail && (
          <>
            <DialogHeader className="dashmark-metric-dialog-header !flex-row !items-center !justify-between !space-y-0">
              <DialogTitle className="dashmark-metric-dialog-title flex h-4 items-center gap-2 text-sm leading-none font-medium tracking-[0.16em] text-muted-foreground uppercase">
                <Gauge className="h-4 w-4 shrink-0" aria-hidden="true" />
                {currentDetail.label}
              </DialogTitle>
              <button
                type="button"
                className="dashmark-metric-dialog-close cursor-pointer rounded-sm p-1 opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
              <DialogDescription className="sr-only">Live {currentDetail.label.toLowerCase()} details</DialogDescription>
            </DialogHeader>
            <div className="dashmark-metric-dialog-body flex h-80 w-full flex-col">
              <div className="min-h-0 flex-1">
              <ChartContainer config={tickerConfig} className="dashmark-metric-chart h-full w-full aspect-auto" aria-label={`${currentDetail.label} chart`}>
              <Chart className="dashmark-metric-chart-svg" data={data} margin={{ top: 12, right: 4, bottom: 4, left: 0 }} accessibilityLayer={false} throttleDelay={50}>
                {chart === 'area' && (
                  <defs>
                    {currentDetail.series.map((series, index) => (
                      <linearGradient key={series.key} id={`${chartGradientId}-${index}`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={series.color} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={series.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                )}
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={[start, end]}
                  allowDataOverflow
                  className="dashmark-metric-chart-x-axis"
                  tickFormatter={formatTimestamp}
                  tickLine={false}
                  axisLine={false}
                  ticks={timeTicks}
                />
                <YAxis
                  tickFormatter={axisFormatter}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  className="dashmark-metric-chart-y-axis"
                  tick={{ fontSize: 10 }}
                  domain={domain}
                />
                <ChartTooltip
                  cursor={false}
                  content={({ active, label, payload }) => {
                    const values = payload?.flatMap(item => {
                      const series = currentDetail.series.find(candidate => candidate.key === item.dataKey)
                      const value = Number(item.value)
                      return series && Number.isFinite(value) ? [[series, value] as const] : []
                    }) ?? []
                    if (!active || values.length === 0) return null
                    return (
                      <div className="dashmark-metric-chart-tooltip grid gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                        <span className="dashmark-metric-chart-tooltip-time text-muted-foreground">{formatExactTimestamp(label)}</span>
                        {values.map(([series, value]) => (
                          <div key={series.key} className="dashmark-metric-chart-tooltip-value flex items-center justify-between gap-4 font-mono font-medium tabular-nums" data-series-key={series.key}>
                            {currentDetail.series.length > 1 && <span className="dashmark-metric-chart-tooltip-label text-muted-foreground">{series.label}</span>}
                            <span className="dashmark-metric-chart-tooltip-number">{(currentDetail.formatTooltipValue ?? currentDetail.formatValue)(value)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }}
                />
                {currentDetail.series.map((series, seriesIndex) => {
                  const color = series.color
                  const props = {
                    dataKey: series.key,
                    type: chart === 'step' ? 'stepAfter' : 'linear',
                    stroke: color,
                    strokeWidth: 2,
                    dot: false,
                    activeDot: { r: 4, fill: color, stroke: color, strokeWidth: 2 },
                    isAnimationActive: false
                  } as const
                  const label = <LabelList
                    dataKey={`${series.key}Label`}
                    position="insideRight"
                    content={props => {
                      const x = Number(props.x)
                      const y = Number(props.y)
                      const label = props.value === undefined ? '' : String(props.value)
                      if (!Number.isFinite(x) || !Number.isFinite(y) || !label) return null
                      const width = label.length * 9 + 16
                      const labelOffset = (seriesIndex - (currentDetail.series.length - 1) / 2) * 28
                      return (
                        <g className="dashmark-metric-chart-end-label" transform={`translate(${x - width - 4} ${y - 12 + labelOffset})`}>
                          <rect width={width} height={24} rx={8} fill="var(--background)" />
                          <text x={8} y={16} fill={series.color} fontSize={16} fontWeight={700}>{label}</text>
                        </g>
                      )
                    }}
                  />
                  return chart === 'area'
                    ? <Area key={series.key} className="dashmark-metric-chart-series" {...props} fill={`url(#${chartGradientId}-${seriesIndex})`}>{label}</Area>
                    : <Line key={series.key} className="dashmark-metric-chart-series" {...props}>{label}</Line>
                })}
              </Chart>
              </ChartContainer>
              </div>
              {currentDetail.series.length > 1 && (
                <div className="dashmark-metric-chart-legend flex shrink-0 justify-center gap-4 pt-2 text-xs leading-none font-medium text-muted-foreground normal-case">
                  {currentDetail.series.map(series => (
                    <span key={series.key} className="dashmark-metric-chart-legend-item flex items-center gap-1.5" data-series-key={series.key}>
                      <span className="dashmark-metric-chart-legend-swatch h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: series.color }} />
                      {series.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
})

function ResourceMetric({ label, value, metricKey, pending = false, onSelect }: {
  label: string
  value: ReactNode
  metricKey?: string
  pending?: boolean
  onSelect?: () => void
}) {
  const interactive = onSelect !== undefined && !pending

  return (
    <div
      className={cn(
        'dashmark-app-resource-metric flex min-h-8 items-center gap-3 rounded-md px-1.5 text-xs',
        pending && 'opacity-50',
        pending && 'cursor-not-allowed',
        interactive && 'card-action-button cursor-pointer hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
      )}
      role={interactive ? 'button' : undefined}
      aria-disabled={pending || undefined}
      data-metric-key={metricKey}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? event => {
        event.preventDefault()
        event.stopPropagation()
        onSelect()
      } : undefined}
      onKeyDown={interactive ? event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        onSelect()
      } : undefined}
    >
      <span className="dashmark-app-resource-metric-label min-w-0 truncate text-muted-foreground">{label}</span>
      <div className="dashmark-app-resource-metric-value ml-auto shrink-0">
        <span className="dashmark-app-resource-metric-number font-medium tabular-nums">{value}</span>
      </div>
    </div>
  )
}

function NetworkMetric({ label, value, metricKey, pending, onSelect }: {
  label: string
  value: number | undefined
  metricKey: string
  pending: boolean
  onSelect: () => void
}) {
  if (value !== undefined) {
    return <ResourceMetric label={label} value={`${formatBytes(value)}/s`} metricKey={metricKey} onSelect={onSelect} />
  }

  if (!pending) return <UnavailableResourceMetric label={label} metricKey={metricKey} />

  return (
    <ResourceMetric
      label={label}
      metricKey={metricKey}
      value={(
        <span role="status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span className="sr-only">{strings.card.waitingForNetwork}</span>
        </span>
      )}
      pending
    />
  )
}

function LoadingResourceMetric({ label, metricKey }: { label: string; metricKey?: string }) {
  return (
    <ResourceMetric
      label={label}
      metricKey={metricKey}
      value={(
        <span role="status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading {label}</span>
        </span>
      )}
      pending
    />
  )
}

function UnavailableResourceMetric({ label, metricKey }: { label: string; metricKey?: string }) {
  return <ResourceMetric label={label} metricKey={metricKey} value={strings.card.unavailable} pending />
}

function formatStateValue(value: string): string {
  return value.replace(/_/g, ' ')
}

function MetricBadge({ value, valueLabel, color }: { value: string; valueLabel?: string; color: CustomMetricStateColor }) {
  return (
    <Badge className={cn('dashmark-state-badge max-w-full rounded-full', `dashmark-state-${color}`)}>
      {valueLabel ?? formatStateValue(value)}
    </Badge>
  )
}

function ResourceUsageTooltip({ card, resources, history, historyPeriodMs, customMetrics, loading, onDetailSelect }: {
  card: CardType
  resources: ContainerResources | null
  history: ResourceMetricSample[]
  historyPeriodMs: number
  customMetrics: CustomMetric[]
  loading: boolean
  onDetailSelect: (detail: MetricDetail) => void
}) {
  const showCpu = card.resourceStats?.includes('cpu')
  const showMemory = card.resourceStats?.includes('memory')
  const showNetwork = card.resourceStats?.includes('network') && !card.usesHostNetwork
  const networkPending = loading || resources?.networkRatePending === true
  const selectedCustomMetrics = card.customMetricLabels ?? card.metrics
    ?.filter(key => !['cpu', 'memory', 'network', 'none'].includes(key))
    .map(key => ({ key, label: key })) ?? []
  const showNetworkDetails = () => onDetailSelect({
    label: 'Network usage',
    history: resourceMetricHistory(history),
    historyPeriodMs,
    series: [
      { key: 'received', label: strings.card.received, color: tickerConfig.received.color, value: sample => sample.received },
      { key: 'sent', label: strings.card.sent, color: tickerConfig.sent.color, value: sample => sample.sent }
    ],
    formatValue: value => `${formatBytes(value)}/s`,
    formatAxisValue: value => `${formatAxisBytes(value)}/s`,
    chart: 'step'
  })
  const showCustomMetricDetails = (metric: NumericCustomMetric) => {
    const chartMetrics = metric.chartGroup === undefined
      ? [metric]
      : customMetrics.filter((candidate): candidate is NumericCustomMetric => 'unit' in candidate && candidate.chartGroup === metric.chartGroup)
    onDetailSelect({
      label: metric.label,
      history: customMetricsHistory(chartMetrics),
      historyPeriodMs: metric.historyPeriodMs,
      series: chartMetrics.map((candidate, index) => ({
        key: candidate.key,
        label: candidate.label,
        color: chartColorVariable(index),
        value: sample => sample[candidate.key]
      })),
      formatValue: value => formatCustomMetric(value, metric.unit),
      formatAxisValue: value => formatAxisCustomMetric(value, metric.unit),
      chart: metric.chart === 'none' ? 'step' : metric.chart,
      customMetricKeys: chartMetrics.map(candidate => candidate.key)
    })
  }

  return (
    <TooltipContent side="top" align="center" collisionPadding={16} className="dashmark-app-resources w-60 p-3" data-card-id={card.id}>
      <div className="dashmark-app-resources-header mb-3 flex items-baseline justify-between gap-3 border-b pb-2">
        <span className="dashmark-app-resources-title text-[0.6875rem] leading-none font-medium tracking-[0.16em] text-muted-foreground uppercase">{strings.card.resourceUsage}</span>
        {card.host && (
          <span className={cn('dashmark-app-resource-host inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', badgeColor(card.hostColor ?? 0))}>
            <Server className="h-3 w-3" aria-hidden="true" />
            {card.host}
          </span>
        )}
      </div>
      {loading && resources === null ? (
          <div className="dashmark-app-resources-list grid gap-1">
          {showCpu && <LoadingResourceMetric label={strings.card.cpu} metricKey="cpu" />}
          {showMemory && <LoadingResourceMetric label={strings.card.memory} metricKey="memory" />}
          {showNetwork && (
            <>
              <LoadingResourceMetric label={strings.card.received} metricKey="received" />
              <LoadingResourceMetric label={strings.card.sent} metricKey="sent" />
            </>
          )}
          {selectedCustomMetrics.map(metric => <LoadingResourceMetric key={metric.key} label={metric.label} metricKey={metric.key} />)}
        </div>
      ) : (
        <div className="dashmark-app-resources-list grid gap-1">
          {showCpu && (resources?.cpuPercent !== undefined ? (
            <ResourceMetric
              label={strings.card.cpu}
              metricKey="cpu"
              value={formatPercent(resources.cpuPercent)}
              onSelect={() => onDetailSelect({
                label: strings.card.cpu,
                history: resourceMetricHistory(history),
                historyPeriodMs,
                series: [{ key: 'cpu', label: strings.card.cpu, color: tickerConfig.cpu.color, value: sample => sample.cpu }],
                formatValue: formatPercent,
                formatAxisValue: formatAxisPercent,
                chart: 'line'
              })}
            />
          ) : <UnavailableResourceMetric label={strings.card.cpu} metricKey="cpu" />)}
          {showMemory && (resources?.memoryUsage !== undefined ? (
            <ResourceMetric
              label={strings.card.memory}
              metricKey="memory"
              value={resources.memoryLimit ? formatPercent((resources.memoryUsage / resources.memoryLimit) * 100) : formatBytes(resources.memoryUsage)}
              onSelect={() => onDetailSelect({
                label: strings.card.memory,
                history: resourceMetricHistory(history),
                historyPeriodMs,
                series: [{
                  key: 'memory',
                  label: strings.card.memory,
                  color: tickerConfig.memory.color,
                  value: sample => resources.memoryLimit && sample.memory !== undefined
                    ? (sample.memory / resources.memoryLimit) * 100
                    : sample.memory
                }],
                formatValue: value => resources.memoryLimit
                  ? formatPercent(value)
                  : formatBytes(value),
                formatTooltipValue: value => resources.memoryLimit
                  ? `${formatBytes((value / 100) * resources.memoryLimit)} (${formatPercent(value)})`
                  : formatBytes(value),
                formatAxisValue: resources.memoryLimit ? formatAxisPercent : formatAxisBytes,
                chart: 'line'
              })}
            />
          ) : <UnavailableResourceMetric label={strings.card.memory} metricKey="memory" />)}
          {showNetwork && (
            <>
              <NetworkMetric
                label={strings.card.received}
                metricKey="received"
                value={resources?.receivedBytesPerSecond}
                pending={networkPending}
                onSelect={showNetworkDetails}
              />
              <NetworkMetric
                label={strings.card.sent}
                metricKey="sent"
                value={resources?.sentBytesPerSecond}
                pending={networkPending}
                onSelect={showNetworkDetails}
              />
            </>
          )}
          {selectedCustomMetrics.map(selectedMetric => {
            const metric = customMetrics.find(candidate => candidate.key === selectedMetric.key)
            if (!metric) return <UnavailableResourceMetric key={selectedMetric.key} label={selectedMetric.label} metricKey={selectedMetric.key} />
            if (!('unit' in metric)) {
              return <ResourceMetric key={metric.key} label={metric.label} metricKey={metric.key} value={'color' in metric ? <MetricBadge value={metric.value} valueLabel={metric.valueLabel} color={metric.color} /> : metric.value} />
            }
            if (metric.chart === 'none') {
              return <ResourceMetric key={metric.key} label={metric.label} metricKey={metric.key} value={formatCustomMetric(metric.value, metric.unit)} />
            }
            return (
              <ResourceMetric
                key={metric.key}
                label={metric.label}
                metricKey={metric.key}
                value={formatCustomMetric(metric.value, metric.unit)}
                onSelect={() => showCustomMetricDetails(metric)}
              />
            )
          })}
        </div>
      )}
    </TooltipContent>
  )
}

function useResourceUsage(
  cardId: string,
  enabled: boolean,
  active: boolean,
  initialResources?: ContainerResources,
  isDemo = false
): { resources: ContainerResources | null; history: ResourceMetricSample[]; historyPeriodMs: number; customMetrics: CustomMetric[]; metricErrors: { key: string; message: string }[]; loading: boolean } {
  const [resources, setResources] = useState<ContainerResources | null>(initialResources ?? null)
  const [history, setHistory] = useState<ResourceMetricSample[]>([])
  const [historyPeriodMs, setHistoryPeriodMs] = useState(5 * 60_000)
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([])
  const [metricErrors, setMetricErrors] = useState<{ key: string; message: string }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialResources && !isDemo) {
      setResources(initialResources)
      setHistory([])
      setCustomMetrics([])
      setMetricErrors([])
      setLoading(false)
      return
    }
    if (!enabled || !active) return

    if (isDemo) {
      function update() {
        const sample = demoResourceUsage(cardId, Date.now())
        setResources(sample)
        setHistory(previous => previous.length > 0
          ? [...previous.slice(-89), sample]
          : Array.from({ length: 30 }, (_, index) => demoResourceUsage(cardId, sample.timestamp - (29 - index) * RESOURCE_USAGE_POLL_INTERVAL_MS)))
        setLoading(false)
      }
      update()
      const timer = setInterval(update, RESOURCE_USAGE_POLL_INTERVAL_MS)
      return () => clearInterval(timer)
    }

    setResources(null)
    setHistory([])
    setCustomMetrics([])
    setMetricErrors([])
    setLoading(true)

    let stopped = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let pending = false

    async function poll() {
      controller = new AbortController()
      try {
        const response = await fetch(`/api/resources?id=${encodeURIComponent(cardId)}`, { signal: controller.signal })
        const data: unknown = await response.json()
        if (!stopped && response.ok && isResourceUsageResponse(data)) {
          pending = data.pending === true
          setResources(data.resource)
          setHistory(data.history ?? [])
          setCustomMetrics(data.customMetrics)
          setMetricErrors(data.metricErrors)
          if (data.historyPeriodMs) setHistoryPeriodMs(data.historyPeriodMs)
        }
      } catch {
        if (!stopped) {
          pending = false
          setResources(null)
          setHistory([])
          setCustomMetrics([])
          setMetricErrors([])
        }
      } finally {
        controller = undefined
        if (!stopped) {
          setLoading(pending)
          timeout = setTimeout(poll, RESOURCE_USAGE_POLL_INTERVAL_MS)
        }
      }
    }

    poll()
    return () => {
      stopped = true
      controller?.abort()
      if (timeout) clearTimeout(timeout)
    }
  }, [active, cardId, enabled, initialResources, isDemo])

  return { resources, history, historyPeriodMs, customMetrics, metricErrors, loading }
}

export const AppCard = memo(function AppCard({ card, showStatus = true, showResourceUsage = true, asCard = false, isLoading = false, openInNewTab = false }: AppCardProps) {
  const { activeTooltip, setActiveTooltip } = useTooltipController()
  const dismissesTooltip = useRef(false)
  const hasStatus = card.health === 'starting' || card.health === 'unhealthy' || Boolean(card.state)
  const showStatusBadge = showStatus && card.showStatus !== false && (hasStatus || (isLoading && card.hasContainer))
  const hasCustomMetrics = (card.customMetricLabels?.length ?? 0) > 0 || (card.metricErrors?.length ?? 0) > 0
  const showResourceUsageTooltip = showResourceUsage && card.showStatus !== false
    && ((card.hasContainer && ((card.resourceStats?.length ?? 0) > 0 || hasCustomMetrics)) || (!card.hasContainer && hasCustomMetrics))
  const [resourceCardHovered, setResourceCardHovered] = useState(false)
  const [metricDetail, setMetricDetail] = useState<MetricDetail | null>(null)
  const handleMetricDialogOpen = useCallback(() => setActiveTooltip(null), [setActiveTooltip])
  const handleMetricDialogOpenChange = useCallback((open: boolean) => {
    if (!open) setMetricDetail(null)
  }, [])
  const metricErrorIds = useRef(new Set<string>())
  const resourceTooltipId = `resource-${card.id}`
  const descriptionTooltipId = `description-${card.id}`
  const resourceTooltipOpen = activeTooltip === resourceTooltipId
  const { resources, history, historyPeriodMs, customMetrics, metricErrors, loading: resourcesLoading } = useResourceUsage(
    card.id,
    showResourceUsageTooltip,
    resourceTooltipOpen || resourceCardHovered || metricDetail !== null,
    card.resourceUsage,
    card.isDemo
  )
  const allMetricErrors = [...(card.metricErrors ?? []), ...metricErrors]
  const metricErrorSignature = allMetricErrors.map(error => `${error.key}:${error.message}`).join('|')
  useEffect(() => {
    const activeErrors = new Set(allMetricErrors.map(error => `${card.id}:${error.key}`))
    for (const id of metricErrorIds.current) {
      if (!activeErrors.has(id)) clearErrorToast(`metric-${id}`)
    }
    metricErrorIds.current = activeErrors
    for (const error of allMetricErrors) {
      const label = card.customMetricLabels?.find(metric => metric.key === error.key)?.label ?? error.key
      showErrorToast(`metric-${card.id}:${error.key}`, `Metric unavailable: ${label}`, `${card.title}: ${error.message}`)
    }
  }, [card.id, card.title, metricErrorSignature])
  useEffect(() => () => {
    for (const id of metricErrorIds.current) clearErrorToast(`metric-${id}`)
  }, [])
  useEffect(() => {
    setMetricDetail(detail => {
      if (!detail) return null
      if (detail.customMetricKeys) return detail
      return {
        ...detail,
        history: resourceMetricHistory(history)
      }
    })
  }, [history])
  useEffect(() => {
    setMetricDetail(detail => {
      if (!detail?.customMetricKeys) return detail
      const metrics = detail.customMetricKeys.flatMap(key => {
        const metric = customMetrics.find(candidate => candidate.key === key)
        return metric && 'unit' in metric ? [metric] : []
      })
      if (metrics.length !== detail.customMetricKeys.length) return detail
      return {
        ...detail,
        history: customMetricsHistory(metrics),
        historyPeriodMs: metrics[0]!.historyPeriodMs
      }
    })
  }, [customMetrics])
  const hasActions = showResourceUsageTooltip || Boolean(card.description)

  function handleTooltipOpenChange(tooltipId: string, open: boolean) {
    if (open) setActiveTooltip(tooltipId)
    else if (activeTooltip === tooltipId) setActiveTooltip(null)
  }

  function handleTooltipTriggerPointerDown(event: ReactPointerEvent<HTMLButtonElement>, tooltipId: string) {
    event.stopPropagation()
    if (event.pointerType !== 'touch') return

    event.preventDefault()
    setActiveTooltip(activeTooltip === tooltipId ? null : tooltipId)
  }

  function handleCardPointerDownCapture(event: ReactPointerEvent<HTMLAnchorElement>) {
    if (!activeTooltip || (event.target instanceof Element && event.target.closest('.card-action-button'))) return

    event.preventDefault()
    dismissesTooltip.current = true
    setActiveTooltip(null)
  }

  function handleCardClickCapture(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!dismissesTooltip.current) return

    event.preventDefault()
    event.stopPropagation()
    dismissesTooltip.current = false
  }

  const cardClassName = cn(
    'dashmark-app-card group/card h-full overflow-hidden transition-[background-color,translate] not-has-[.card-action-button:hover]:hover:-translate-y-0.5',
    asCard
      ? 'min-w-0 bg-card not-has-[.card-action-button:hover]:hover:bg-surface-hover not-has-[.card-action-button:active]:active:bg-surface-hover dark:not-has-[.card-action-button:hover]:hover:bg-accent dark:not-has-[.card-action-button:active]:active:bg-accent'
      : 'min-w-0 border-0 bg-surface shadow-none not-has-[.card-action-button:hover]:hover:bg-surface-hover not-has-[.card-action-button:active]:active:bg-surface-hover'
  )

  return (
    <>
      <a
      href={card.url}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      className="dashmark-app-link block h-full rounded-lg"
      onPointerEnter={showResourceUsageTooltip ? () => setResourceCardHovered(true) : undefined}
      onPointerLeave={showResourceUsageTooltip ? () => setResourceCardHovered(false) : undefined}
      onPointerDownCapture={handleCardPointerDownCapture}
      onClickCapture={handleCardClickCapture}
    >
      <Card className={cardClassName}>
        <CardContent className="dashmark-app-content relative flex min-h-24 items-center gap-5 p-3">
          <AppIcon icon={card.icon} title={card.title} asCard={asCard} />
          <div className="dashmark-app-details flex min-w-0 flex-1 flex-col gap-2">
            <div className="dashmark-app-header flex min-w-0">
              <MarqueeText className={cn('dashmark-app-title min-w-0 flex-1 text-sm font-semibold sm:text-[0.9375rem] lg:text-base', hasActions && 'mr-[65px]')}>
                {card.title}
              </MarqueeText>
            </div>
            <MarqueeText className="dashmark-app-url text-xs text-muted-foreground">
              {card.url}
            </MarqueeText>
            {showStatusBadge && (
              <div className="dashmark-app-status-container">
                <StatusBadge
                  state={card.state}
                  health={card.health}
                  loading={isLoading && card.hasContainer}
                  asCard={asCard}
                />
              </div>
            )}
          </div>
          {hasActions && (
            <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
              <div className="absolute top-2 right-2 flex items-center gap-1">
                {showResourceUsageTooltip && (
                  <Tooltip open={resourceTooltipOpen} onOpenChange={open => handleTooltipOpenChange(resourceTooltipId, open)}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="dashmark-app-resources-trigger card-action-button cursor-help rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                        onClick={e => e.preventDefault()}
                        onPointerDown={event => handleTooltipTriggerPointerDown(event, resourceTooltipId)}
                      >
                        <Gauge className="h-4 w-4" />
                        <span className="sr-only">{strings.card.resourceUsage}</span>
                      </button>
                    </TooltipTrigger>
                    <ResourceUsageTooltip
                      card={card}
                      resources={resources}
                      history={history}
                      historyPeriodMs={historyPeriodMs}
                      customMetrics={customMetrics}
                      loading={resourcesLoading}
                      onDetailSelect={detail => {
                        setMetricDetail(detail)
                      }}
                    />
                  </Tooltip>
                )}
                {card.description && (
                  <Tooltip open={activeTooltip === descriptionTooltipId} onOpenChange={open => handleTooltipOpenChange(descriptionTooltipId, open)}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="dashmark-app-description-trigger card-action-button cursor-help rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                        onClick={e => e.preventDefault()}
                        onPointerDown={event => handleTooltipTriggerPointerDown(event, descriptionTooltipId)}
                      >
                        <Info className="h-4 w-4" />
                        <span className="sr-only">{strings.card.description}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center" collisionPadding={16} className="dashmark-app-description max-w-xs">
                      <p>{card.description}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
      </a>
      <MetricDetailDialog detail={metricDetail} onOpen={handleMetricDialogOpen} onOpenChange={handleMetricDialogOpenChange} />
    </>
  )
})
