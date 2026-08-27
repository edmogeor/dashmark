import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle, Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { badgeColor, chartColorVariable } from '@/lib/badge-color'
import type { Card as CardType } from '@/lib/docker'
import { strings } from '@/lib/strings'
import type {
  ContainerResources,
  CustomMetric,
  CustomMetricStateColor,
  NumericCustomMetric,
  ResourceMetricSample,
  UptimeMetric,
} from '@/lib/status'
import {
  customMetricsHistory,
  formatAxisBytes,
  formatAxisCustomMetric,
  formatAxisPercent,
  formatBytes,
  formatCustomMetric,
  formatDetailedBytes,
  formatDetailedCustomMetric,
  formatDetailedPercent,
  formatPercent,
  resourceMetricHistory,
  tickerConfig,
  type MetricDetail,
} from './app-card-metrics'
import { formatUptimeBucketTime, UptimeHeartbeat, uptimeBuckets, uptimePercent, type UptimeBucket } from './UptimeHeartbeat'

type Props = {
  card: CardType
  resources: ContainerResources | null
  history: ResourceMetricSample[]
  historyPeriodMs: number
  customMetrics: CustomMetric[]
  uptimeMetrics: UptimeMetric[]
  loading: boolean
  onDetailSelect: (detail: MetricDetail) => void
  onUptimeDetailSelect: (metric: UptimeMetric) => void
}

function ResourceMetric({
  label,
  value,
  metricKey,
  pending = false,
  onSelect,
}: {
  label: string
  value: ReactNode
  metricKey?: string
  pending?: boolean
  onSelect?: () => void
}) {
  const interactive = onSelect !== undefined && !pending
  const select = (event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onSelect?.()
  }
  return (
    <div
      className={cn(
        'dashmark-app-resource-metric flex min-h-8 items-center gap-3 rounded-md px-1.5 text-xs',
        pending && 'opacity-50 cursor-not-allowed',
        interactive &&
          'card-action-button cursor-pointer hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
      role={interactive ? 'button' : undefined}
      aria-disabled={pending || undefined}
      data-metric-key={metricKey}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? select : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') select(event)
            }
          : undefined
      }
    >
      <span className="dashmark-app-resource-metric-label min-w-0 truncate text-muted-foreground">
        {label}
      </span>
      <div className="dashmark-app-resource-metric-value ml-auto shrink-0">
        <span className="dashmark-app-resource-metric-number font-medium tabular-nums">
          {value}
        </span>
      </div>
    </div>
  )
}

function PendingMetric({
  label,
  metricKey,
  waitingForNetwork = false,
}: {
  label: string
  metricKey?: string
  waitingForNetwork?: boolean
}) {
  return (
    <ResourceMetric
      label={label}
      metricKey={metricKey}
      pending
      value={
        <span role="status">
          <LoaderCircle
            className="h-3.5 w-3.5 animate-spin"
            aria-hidden="true"
          />
          <span className="sr-only">
            {waitingForNetwork
              ? strings.card.waitingForNetwork
              : `Loading ${label}`}
          </span>
        </span>
      }
    />
  )
}

function UnavailableMetric({
  label,
  metricKey,
}: {
  label: string
  metricKey?: string
}) {
  return (
    <ResourceMetric
      label={label}
      metricKey={metricKey}
      value={strings.card.unavailable}
      pending
    />
  )
}

function MetricList({
  scrollable,
  children,
}: {
  scrollable: boolean
  children: ReactNode
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ top: false, bottom: false })

  useEffect(() => {
    if (!scrollable) return
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]')
    if (!viewport) return
    const updateFade = () => setFade({
      top: viewport.scrollTop > 1,
      bottom: viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1,
    })
    updateFade()
    viewport.addEventListener('scroll', updateFade)
    const observer = new ResizeObserver(updateFade)
    observer.observe(viewport)
    observer.observe(viewport.firstElementChild ?? viewport)
    return () => {
      viewport.removeEventListener('scroll', updateFade)
      observer.disconnect()
    }
  }, [scrollable])

  const content = <div className="dashmark-app-resources-list grid gap-1">{children}</div>
  if (!scrollable) return content
  return (
    <div className="relative h-36">
      <ScrollArea ref={scrollAreaRef} className="h-full pr-4">{content}</ScrollArea>
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-4 bg-linear-to-b from-popover to-transparent transition-opacity', fade.top ? 'opacity-100' : 'opacity-0')} />
      <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-linear-to-t from-popover to-transparent transition-opacity', fade.bottom ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}

function MetricBadge({
  value,
  valueLabel,
  color,
}: {
  value: string
  valueLabel?: string
  color: CustomMetricStateColor
}) {
  return (
    <Badge
      className={cn(
        'dashmark-state-badge max-w-full rounded-full',
        `dashmark-state-${color}`,
      )}
    >
      {valueLabel ?? value.replace(/_/g, ' ')}
    </Badge>
  )
}

function resourceDetail(
  label: string,
  history: ResourceMetricSample[],
  historyPeriodMs: number,
  key: 'cpu' | 'memory',
  resources: ContainerResources,
): MetricDetail {
  const memory = key === 'memory'
  const limit = resources.memoryLimit
  return {
    label,
    history: resourceMetricHistory(history),
    historyPeriodMs,
    series: [
      {
        key,
        label,
        color: tickerConfig[key].color,
        value: (sample) =>
          memory && limit && sample.memory !== undefined
            ? (sample.memory / limit) * 100
            : sample[key],
      },
    ],
    formatValue: (value) =>
      memory && limit
        ? formatDetailedPercent(value)
        : memory
          ? formatDetailedBytes(value)
          : formatDetailedPercent(value),
    formatTooltipValue:
      memory && limit
        ? (value) =>
            `${formatDetailedBytes((value / 100) * limit)} (${formatDetailedPercent(value)})`
        : undefined,
    formatAxisValue:
      memory && limit
        ? formatAxisPercent
        : memory
          ? formatAxisBytes
          : formatAxisPercent,
    chart: 'line',
  }
}

function networkDetail(
  history: ResourceMetricSample[],
  historyPeriodMs: number,
): MetricDetail {
  return {
    label: 'Network usage',
    history: resourceMetricHistory(history),
    historyPeriodMs,
    series: [
      {
        key: 'received',
        label: strings.card.received,
        color: tickerConfig.received.color,
        value: (sample) => sample.received,
      },
      {
        key: 'sent',
        label: strings.card.sent,
        color: tickerConfig.sent.color,
        value: (sample) => sample.sent,
      },
    ],
    formatValue: (value) => `${formatDetailedBytes(value)}/s`,
    formatAxisValue: (value) => `${formatAxisBytes(value)}/s`,
    chart: 'step',
  }
}

function customMetricDetail(
  metric: NumericCustomMetric,
  customMetrics: CustomMetric[],
): MetricDetail {
  const chartMetrics =
    metric.chartGroup === undefined
      ? [metric]
      : customMetrics.filter(
          (candidate): candidate is NumericCustomMetric =>
            'unit' in candidate && candidate.chartGroup === metric.chartGroup,
        )
  return {
    label: metric.label,
    history: customMetricsHistory(chartMetrics),
    historyPeriodMs: metric.historyPeriodMs,
    series: chartMetrics.map((candidate, index) => ({
      key: candidate.key,
      label: candidate.label,
      color: chartColorVariable(index),
      value: (sample) => sample[candidate.key],
    })),
    formatValue: (value) => formatDetailedCustomMetric(value, metric.unit),
    formatAxisValue: (value) => formatAxisCustomMetric(value, metric.unit),
    chart: metric.chart === 'none' ? 'step' : metric.chart,
    customMetricKeys: chartMetrics.map((candidate) => candidate.key),
  }
}

function NetworkMetrics({
  resources,
  pending,
  history,
  historyPeriodMs,
  onSelect,
}: Pick<Props, 'resources' | 'history' | 'historyPeriodMs'> & {
  pending: boolean
  onSelect: (detail: MetricDetail) => void
}) {
  const detail = () => onSelect(networkDetail(history, historyPeriodMs))
  return (
    <>
      {(['received', 'sent'] as const).map((key) => {
        const value =
          resources?.[
            key === 'received' ? 'receivedBytesPerSecond' : 'sentBytesPerSecond'
          ]
        return value !== undefined ? (
          <ResourceMetric
            key={key}
            label={strings.card[key]}
            metricKey={key}
            value={`${formatBytes(value)}/s`}
            onSelect={detail}
          />
        ) : pending ? (
          <PendingMetric
            key={key}
            label={strings.card[key]}
            metricKey={key}
            waitingForNetwork
          />
        ) : (
          <UnavailableMetric
            key={key}
            label={strings.card[key]}
            metricKey={key}
          />
        )
      })}
    </>
  )
}

function CustomMetrics({
  selected,
  customMetrics,
  onSelect,
}: {
  selected: { key: string; label: string }[]
  customMetrics: CustomMetric[]
  onSelect: (detail: MetricDetail) => void
}) {
  return (
    <>
      {selected.map((selectedMetric) => {
        const metric = customMetrics.find(
          (candidate) => candidate.key === selectedMetric.key,
        )
        if (!metric)
          return (
            <UnavailableMetric
              key={selectedMetric.key}
              label={selectedMetric.label}
              metricKey={selectedMetric.key}
            />
          )
        if ('pending' in metric && metric.pending)
          return (
            <PendingMetric
              key={metric.key}
              label={metric.label}
              metricKey={metric.key}
            />
          )
        if (!('unit' in metric))
          return (
            <ResourceMetric
              key={metric.key}
              label={metric.label}
              metricKey={metric.key}
              value={
                'color' in metric ? (
                  <MetricBadge
                    value={metric.value}
                    valueLabel={metric.valueLabel}
                    color={metric.color}
                  />
                ) : (
                  metric.value
                )
              }
            />
          )
        const interactive = metric.chart !== 'none'
        return (
          <ResourceMetric
            key={metric.key}
            label={metric.label}
            metricKey={metric.key}
            value={formatCustomMetric(metric.value, metric.unit)}
            onSelect={
              interactive
                ? () => onSelect(customMetricDetail(metric, customMetrics))
                : undefined
            }
          />
        )
      })}
    </>
  )
}

function formatUptimePercent(value: number | undefined): string {
  return value === undefined
    ? strings.card.unavailable
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
}

function uptimeBucketSummary(bucket: UptimeBucket): { label: string; value: string } {
  const label = formatUptimeBucketTime(bucket.start)
  const value = {
    up: 'Up',
    down: 'Down',
    mixed: 'Partial',
    unknown: 'No data',
  }[bucket.status]
  return { label, value }
}

function UptimeMetricRow({ metric, onSelect }: { metric: UptimeMetric; onSelect: (metric: UptimeMetric) => void }) {
  const [hoveredBucket, setHoveredBucket] = useState<UptimeBucket>()
  const buckets = uptimeBuckets(metric.observations, 24 * 60 * 60 * 1_000, 24)
  const summary = hoveredBucket ? uptimeBucketSummary(hoveredBucket) : { label: metric.label, value: formatUptimePercent(uptimePercent(buckets)) }
  return (
    <button
      type="button"
      className="dashmark-uptime-metric card-action-button grid cursor-pointer gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onSelect(metric)
      }}
      aria-label={`View ${metric.label.toLowerCase()} history`}
    >
      <div className="grid gap-0.5 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-muted-foreground">{summary.label}</span>
          <span className="font-medium tabular-nums">{summary.value}</span>
        </div>
      </div>
      <UptimeHeartbeat observations={metric.observations} durationMs={24 * 60 * 60 * 1_000} bucketCount={24} className="h-3" onBucketHover={setHoveredBucket} />
    </button>
  )
}

function SelectedMetrics({
  selected,
  customMetrics,
  uptimeMetrics,
  onDetailSelect,
  onUptimeDetailSelect,
}: {
  selected: { key: string; label: string }[]
  customMetrics: CustomMetric[]
  uptimeMetrics: UptimeMetric[]
  onDetailSelect: (detail: MetricDetail) => void
  onUptimeDetailSelect: (metric: UptimeMetric) => void
}) {
  return selected.map((selectedMetric) => {
    const metric = uptimeMetrics.find((candidate) => candidate.key === selectedMetric.key)
    return metric
      ? <UptimeMetricRow key={metric.key} metric={metric} onSelect={onUptimeDetailSelect} />
      : <CustomMetrics key={selectedMetric.key} selected={[selectedMetric]} customMetrics={customMetrics} onSelect={onDetailSelect} />
  })
}

function ResourceMetrics({
  card,
  resources,
  history,
  historyPeriodMs,
  customMetrics,
  uptimeMetrics,
  loading,
  onDetailSelect,
  onUptimeDetailSelect,
}: Props) {
  const showCpu = card.resourceStats?.includes('cpu')
  const showMemory = card.resourceStats?.includes('memory')
  const showNetwork =
    card.resourceStats?.includes('network') && !card.usesHostNetwork
  const selected =
    card.customMetricLabels ??
    card.metrics
      ?.filter((key) => !['cpu', 'memory', 'network', 'none'].includes(key))
      .map((key) => ({ key, label: key })) ??
    []
  const metricCount = Number(showCpu) + Number(showMemory) + (showNetwork ? 2 : 0) + selected.length
  if (loading && resources === null)
    return (
      <MetricList scrollable={metricCount > 4}>
        {showCpu && <PendingMetric label={strings.card.cpu} metricKey="cpu" />}
        {showMemory && (
          <PendingMetric label={strings.card.memory} metricKey="memory" />
        )}
        {showNetwork && (
          <>
            <PendingMetric label={strings.card.received} metricKey="received" />
            <PendingMetric label={strings.card.sent} metricKey="sent" />
          </>
        )}
        {selected.map((metric) => (
          <PendingMetric
            key={metric.key}
            label={metric.label}
            metricKey={metric.key}
          />
        ))}
      </MetricList>
    )
  return (
    <MetricList scrollable={metricCount > 4}>
      {showCpu &&
        (resources?.cpuPercent !== undefined ? (
          <ResourceMetric
            label={strings.card.cpu}
            metricKey="cpu"
            value={formatPercent(resources.cpuPercent)}
            onSelect={() =>
              onDetailSelect(
                resourceDetail(
                  strings.card.cpu,
                  history,
                  historyPeriodMs,
                  'cpu',
                  resources,
                ),
              )
            }
          />
        ) : (
          <UnavailableMetric label={strings.card.cpu} metricKey="cpu" />
        ))}
      {showMemory &&
        (resources?.memoryUsage !== undefined ? (
          <ResourceMetric
            label={strings.card.memory}
            metricKey="memory"
            value={
              resources.memoryLimit
                ? formatPercent(
                    (resources.memoryUsage / resources.memoryLimit) * 100,
                  )
                : formatBytes(resources.memoryUsage)
            }
            onSelect={() =>
              onDetailSelect(
                resourceDetail(
                  strings.card.memory,
                  history,
                  historyPeriodMs,
                  'memory',
                  resources,
                ),
              )
            }
          />
        ) : (
          <UnavailableMetric label={strings.card.memory} metricKey="memory" />
        ))}
      {showNetwork && (
        <NetworkMetrics
          resources={resources}
          pending={loading || resources?.networkRatePending === true}
          history={history}
          historyPeriodMs={historyPeriodMs}
          onSelect={onDetailSelect}
        />
      )}
      <SelectedMetrics
        selected={selected}
        customMetrics={customMetrics}
        uptimeMetrics={uptimeMetrics}
        onDetailSelect={onDetailSelect}
        onUptimeDetailSelect={onUptimeDetailSelect}
      />
    </MetricList>
  )
}

export function MetricsTooltip(props: Props) {
  const { card } = props
  return (
    <TooltipContent
      side="top"
      align="center"
      collisionPadding={16}
      className="dashmark-app-resources w-60 p-3"
      data-card-id={card.id}
    >
      <div className="dashmark-app-resources-header mb-3 flex items-baseline justify-between gap-3 border-b pb-2">
        <span className="dashmark-app-resources-title text-[0.6875rem] leading-none font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Metrics
        </span>
        {card.host && (
          <span
            className={cn(
              'dashmark-app-resource-host inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              badgeColor(card.hostColor ?? 0),
            )}
          >
            <Server className="h-3 w-3" aria-hidden="true" />
            {card.host}
          </span>
        )}
      </div>
      <ResourceMetrics {...props} />
    </TooltipContent>
  )
}
