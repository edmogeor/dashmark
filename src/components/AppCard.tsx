import { memo, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { Gauge, Info, LoaderCircle, Server } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts'
import { StatusBadge } from './StatusBadge'
import { MarqueeText } from './MarqueeText'
import type { Card as CardType } from '@/lib/docker'
import { getInitials } from '@/lib/initials'
import { strings } from '@/lib/strings'
import { useIsDark } from '@/lib/use-is-dark'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isResourceUsageResponse, type ContainerResources, type CustomMetric, type CustomMetricChart, type CustomMetricSample, type CustomMetricUnit, type ResourceMetricSample } from '@/lib/status'
import { RESOURCE_USAGE_POLL_INTERVAL_MS, TOOLTIP_DELAY_MS } from '@/lib/constants'
import { useTooltipController } from './tooltip-controller'
import { badgeColor } from '@/lib/badge-color'
import { toast } from 'sonner'

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

function formatBytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = value === 0 ? 0 : Math.min(Math.floor(Math.log(value) / Math.log(1_024)), units.length - 1)
  const amount = value / 1_024 ** index
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`
}

function formatPercent(value: number): string {
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`
}

function formatAxisPercent(value: number): string {
  return `${Math.round(value / 5) * 5}%`
}

function formatAxisBytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = value === 0 ? 0 : Math.min(Math.floor(Math.log(value) / Math.log(1_024)), units.length - 1)
  const amount = value / 1_024 ** index
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

type MetricKey = 'cpu' | 'memory' | 'received' | 'sent'
type ChartPoint = { timestamp: number } & Partial<Record<MetricKey, number>> & Partial<Record<`${MetricKey}Label`, string>>

type MetricSeries = {
  key: MetricKey
  label: string
  value: (sample: ResourceMetricSample) => number | undefined
}

type MetricDetail = {
  label: string
  history: ResourceMetricSample[]
  historyPeriodMs: number
  series: MetricSeries[]
  formatValue: (value: number) => string
  formatAxisValue?: (value: number) => string
  chart?: Exclude<CustomMetricChart, 'none'>
  customMetricKey?: string
}

function metricData(history: ResourceMetricSample[], series: MetricSeries[]): ChartPoint[] {
  return history.map(sample => {
    const point: ChartPoint = { timestamp: sample.timestamp }
    for (const item of series) {
      const value = item.value(sample)
      if (value !== undefined) point[item.key] = value
    }
    return point
  }).filter(sample => series.some(item => sample[item.key] !== undefined))
}

function customMetricHistory(history: CustomMetricSample[]): ResourceMetricSample[] {
  return history.map(sample => ({ timestamp: sample.timestamp, cpuPercent: sample.value }))
}

function formatTimestamp(timestamp: unknown): string {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value)
}

function formatExactTimestamp(timestamp: unknown): string {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(value)
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

function MetricDetailDialog({ detail, onOpen, onOpenChange }: { detail: MetricDetail | null; onOpen: () => void; onOpenChange: (open: boolean) => void }) {
  const [displayedDetail, setDisplayedDetail] = useState(detail)
  const [chartRoot, setChartRoot] = useState<HTMLDivElement | null>(null)
  const [chartDimensions, setChartDimensions] = useState<{ width: number; height: number } | null>(null)
  const isOpen = detail !== null
  useEffect(() => {
    if (detail) setDisplayedDetail(detail)
  }, [detail])
  useEffect(() => {
    if (!isOpen || !chartRoot) return
    setChartDimensions(null)
    const measure = () => {
      const { width, height } = chartRoot.getBoundingClientRect()
      if (width > 0 && height > 0) setChartDimensions({ width: Math.round(width), height: Math.round(height) })
    }
    measure()
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setChartDimensions({ width: Math.round(width), height: Math.round(height) })
    })
    observer.observe(chartRoot)
    return () => observer.disconnect()
  }, [chartRoot, isOpen])
  const currentDetail = detail ?? displayedDetail
  const data = currentDetail
    ? metricData(currentDetail.history, currentDetail.series).map((point, index, points) => {
      const pointWithLabels: ChartPoint = { ...point }
      for (const item of currentDetail.series) {
        const value = point[item.key]
        if (index === points.length - 1 && typeof value === 'number') {
          pointWithLabels[`${item.key}Label`] = currentDetail.formatValue(value)
        }
      }
      return pointWithLabels
    })
    : []
  const values = currentDetail ? data.flatMap(point => currentDetail.series.flatMap(item => {
    const value = point[item.key]
    return typeof value === 'number' ? [value] : []
  })) : []
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const padding = Math.max((maximum - minimum) * 0.1, Math.abs(maximum) * 0.05, 1)
  const domain: [number, number] = [minimum - padding, maximum + padding]
  const end = data.at(-1)?.timestamp ?? Date.now()
  const start = end - (currentDetail?.historyPeriodMs ?? 5 * 60_000)
  const timeTicks = Array.from({ length: 4 }, (_, index) => start + ((end - start) * index) / 3)
  const chart = currentDetail?.chart ?? 'step'
  const Chart = chart === 'area' ? AreaChart : LineChart

  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={onOpen}
        onAnimationEnd={event => {
          if (event.target === event.currentTarget && event.currentTarget.dataset.state === 'closed') setDisplayedDetail(null)
        }}
      >
        {currentDetail && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm font-medium tracking-[0.16em] text-muted-foreground uppercase">
                <Gauge className="h-4 w-4" aria-hidden="true" />
                {currentDetail.label}
              </DialogTitle>
              <DialogDescription className="sr-only">Live {currentDetail.label.toLowerCase()} details</DialogDescription>
            </DialogHeader>
            <div ref={setChartRoot} className="h-80 w-full">
            {chartDimensions && <ChartContainer config={tickerConfig} initialDimension={chartDimensions} className="h-full w-full aspect-auto" aria-label={`${currentDetail.label} chart`}>
              <Chart data={data} margin={{ top: 12, right: 4, bottom: 4, left: 0 }} accessibilityLayer={false}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={[start, end]}
                  allowDataOverflow
                  tickFormatter={formatTimestamp}
                  tickLine={false}
                  axisLine={false}
                  ticks={timeTicks}
                />
                <YAxis
                  tickFormatter={currentDetail.formatAxisValue ?? currentDetail.formatValue}
                  tickLine={false}
                  axisLine={false}
                  width={60}
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
                      <div className="grid gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                        <span className="text-muted-foreground">{formatExactTimestamp(label)}</span>
                        {values.map(([series, value]) => (
                          <div key={series.key} className="flex items-center justify-between gap-4 font-mono font-medium tabular-nums">
                            {currentDetail.series.length > 1 && <span className="text-muted-foreground">{series.label}</span>}
                            <span>{currentDetail.formatValue(value)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }}
                />
                {currentDetail.series.map(series => {
                  const props = {
                    dataKey: series.key,
                    type: chart === 'line' ? 'linear' : 'stepAfter',
                    stroke: `var(--color-${series.key})`,
                    strokeWidth: 2,
                    dot: false,
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
                      const width = label.length * 9 + 8
                      return (
                        <g transform={`translate(${x - width - 4} ${y - 12})`}>
                          <rect width={width} height={24} rx={8} fill="var(--background)" />
                          <text x={4} y={16} fill={`var(--color-${series.key})`} fontSize={16} fontWeight={700}>{label}</text>
                        </g>
                      )
                    }}
                  />
                  return chart === 'area'
                    ? <Area key={series.key} {...props} fill={`var(--color-${series.key})`} fillOpacity={0.2}>{label}</Area>
                    : <Line key={series.key} {...props}>{label}</Line>
                })}
              </Chart>
            </ChartContainer>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ResourceMetric({ label, value, pending = false, onSelect }: {
  label: string
  value: ReactNode
  pending?: boolean
  onSelect?: () => void
}) {
  const interactive = onSelect !== undefined

  return (
    <div
      className={cn(
        'flex min-h-8 items-center gap-3 rounded-md px-1.5 text-xs',
        pending && 'opacity-50',
        interactive && 'card-action-button cursor-pointer hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
      )}
      role={interactive ? 'button' : undefined}
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
      <span className="text-muted-foreground">{label}</span>
      <div className="ml-auto min-w-0">
        <span className="font-medium tabular-nums">{value}</span>
      </div>
    </div>
  )
}

function NetworkMetric({ label, value, onSelect }: {
  label: string
  value: number | undefined
  onSelect: () => void
}) {
  if (value !== undefined) {
    return <ResourceMetric label={label} value={`${formatBytes(value)}/s`} onSelect={onSelect} />
  }

  return (
    <ResourceMetric
      label={label}
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

function LoadingResourceMetric({ label }: { label: string }) {
  return (
    <ResourceMetric
      label={label}
      value={(
        <span role="status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span className="sr-only">{strings.card.loadingResourceUsage}</span>
        </span>
      )}
      pending
    />
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
  const selectedCustomMetrics = card.customMetricLabels ?? card.metrics
    ?.filter(key => !['cpu', 'memory', 'network', 'none'].includes(key))
    .map(key => ({ key, label: key })) ?? []
  const hasUsage = customMetrics.length > 0 || resources?.cpuPercent !== undefined || resources?.memoryUsage !== undefined
    || resources?.receivedBytesPerSecond !== undefined || resources?.sentBytesPerSecond !== undefined || (resources !== null && showNetwork)
  const showNetworkDetails = () => onDetailSelect({
    label: 'Network usage',
    history,
    historyPeriodMs,
    series: [
      { key: 'received', label: strings.card.received, value: sample => sample.receivedBytesPerSecond },
      { key: 'sent', label: strings.card.sent, value: sample => sample.sentBytesPerSecond }
    ],
    formatValue: value => `${formatBytes(value)}/s`,
    formatAxisValue: value => `${formatAxisBytes(value)}/s`
  })

  return (
    <TooltipContent side="top" align="center" collisionPadding={16} className="dashmark-app-resources w-60 p-3">
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b pb-2">
        <span className="text-[0.6875rem] leading-none font-medium tracking-[0.16em] text-muted-foreground uppercase">{strings.card.resourceUsage}</span>
        {card.host && (
          <span className={cn('dashmark-app-resource-host inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', badgeColor(card.hostColor ?? 0))}>
            <Server className="h-3 w-3" aria-hidden="true" />
            {card.host}
          </span>
        )}
      </div>
      {loading && resources === null ? (
        <div className="grid gap-1">
          {showCpu && <LoadingResourceMetric label={strings.card.cpu} />}
          {showMemory && <LoadingResourceMetric label={strings.card.memory} />}
          {showNetwork && (
            <>
              <LoadingResourceMetric label={strings.card.received} />
              <LoadingResourceMetric label={strings.card.sent} />
            </>
          )}
          {selectedCustomMetrics.map(metric => <LoadingResourceMetric key={metric.key} label={metric.label} />)}
        </div>
      ) : hasUsage ? (
        <div className="grid gap-1">
          {resources?.cpuPercent !== undefined && (
            <ResourceMetric
              label={strings.card.cpu}
              value={formatPercent(resources.cpuPercent)}
              onSelect={() => onDetailSelect({
                label: strings.card.cpu,
                history,
                historyPeriodMs,
                series: [{ key: 'cpu', label: strings.card.cpu, value: sample => sample.cpuPercent }],
                formatValue: formatPercent,
                formatAxisValue: formatAxisPercent
              })}
            />
          )}
          {resources?.memoryUsage !== undefined && (
            <ResourceMetric
              label={strings.card.memory}
              value={resources.memoryLimit ? `${formatBytes(resources.memoryUsage)} / ${formatBytes(resources.memoryLimit)}` : formatBytes(resources.memoryUsage)}
              onSelect={() => onDetailSelect({
                label: strings.card.memory,
                history,
                historyPeriodMs,
                series: [{ key: 'memory', label: strings.card.memory, value: sample => sample.memoryUsage }],
                formatValue: formatBytes,
                formatAxisValue: formatAxisBytes
              })}
            />
          )}
          {resources !== null && showNetwork && (
            <>
              <NetworkMetric
                label={strings.card.received}
                value={resources.receivedBytesPerSecond}
                onSelect={showNetworkDetails}
              />
              <NetworkMetric
                label={strings.card.sent}
                value={resources.sentBytesPerSecond}
                onSelect={showNetworkDetails}
              />
            </>
          )}
          {customMetrics.map(metric => {
            if (!('unit' in metric)) {
              return <ResourceMetric key={metric.key} label={metric.label} value={metric.value} />
            }
            if (metric.chart === 'none') {
              return <ResourceMetric key={metric.key} label={metric.label} value={formatCustomMetric(metric.value, metric.unit)} />
            }
            const chart = metric.chart
            return (
              <ResourceMetric
                key={metric.key}
                label={metric.label}
                value={formatCustomMetric(metric.value, metric.unit)}
                onSelect={() => onDetailSelect({
                  label: metric.label,
                  history: customMetricHistory(metric.history),
                  historyPeriodMs: metric.historyPeriodMs,
                  series: [{ key: 'cpu', label: metric.label, value: sample => sample.cpuPercent }],
                  formatValue: value => formatCustomMetric(value, metric.unit),
                  formatAxisValue: value => formatAxisCustomMetric(value, metric.unit),
                  chart,
                  customMetricKey: metric.key
                })}
              />
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{strings.card.unavailable}</p>
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

    async function poll() {
      controller = new AbortController()
      try {
        const response = await fetch(`/api/resources?id=${encodeURIComponent(cardId)}`, { signal: controller.signal })
        const data: unknown = await response.json()
        if (!stopped && response.ok && isResourceUsageResponse(data)) {
          setResources(data.resource)
          setHistory(data.history ?? [])
          setCustomMetrics(data.customMetrics)
          setMetricErrors(data.metricErrors)
          if (data.historyPeriodMs) setHistoryPeriodMs(data.historyPeriodMs)
        }
      } catch {
        if (!stopped) {
          setResources(null)
          setHistory([])
          setCustomMetrics([])
          setMetricErrors([])
        }
      } finally {
        controller = undefined
        if (!stopped) {
          setLoading(false)
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
  const hasSelectedCustomMetric = card.metrics?.some(metric => !['cpu', 'memory', 'network', 'none'].includes(metric)) ?? false
  const showResourceUsageTooltip = showResourceUsage && card.showStatus !== false && card.hasContainer
    && ((card.resourceStats !== undefined && card.resourceStats.length > 0) || hasSelectedCustomMetric)
  const [resourceCardHovered, setResourceCardHovered] = useState(false)
  const [metricDetail, setMetricDetail] = useState<MetricDetail | null>(null)
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
      if (!activeErrors.has(id)) toast.dismiss(`metric-${id}`)
    }
    metricErrorIds.current = activeErrors
    for (const error of allMetricErrors) {
      toast.error('Metric unavailable', {
        id: `metric-${card.id}:${error.key}`,
        description: `${card.title}: ${error.message}`
      })
    }
  }, [card.id, card.title, metricErrorSignature])
  useEffect(() => {
    setMetricDetail(detail => {
      if (!detail) return null
      if (detail.customMetricKey) return detail
      return {
        ...detail,
        history
      }
    })
  }, [history])
  useEffect(() => {
    setMetricDetail(detail => {
      if (!detail?.customMetricKey) return detail
      const metric = customMetrics.find(metric => metric.key === detail.customMetricKey && 'unit' in metric)
      if (!metric || !('unit' in metric)) return detail
      return {
        ...detail,
        history: customMetricHistory(metric.history),
        historyPeriodMs: metric.historyPeriodMs
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
      <MetricDetailDialog detail={metricDetail} onOpen={() => setActiveTooltip(null)} onOpenChange={open => {
        if (!open) setMetricDetail(null)
      }} />
    </>
  )
})
