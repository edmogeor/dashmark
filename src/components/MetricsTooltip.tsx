import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle, Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { badgeColor } from '@/lib/badge-color'
import type { Card as CardType } from '@/lib/docker'
import type { ContainerResources, CustomMetric, CustomMetricStateColor, ResourceMetricSample } from '@/lib/status'
import type { UptimeMetricSummary } from '@/lib/realtime-client'
import { formatBytes, formatCustomMetric, formatPercent } from './app-card-metric-formatters'
import { customMetricDetail, networkMetricDetail, resourceMetricDetail } from './app-card-metric-details'
import type { MetricDetail } from './app-card-metrics'
import { formatUptimeBucketTime, UptimeHeartbeat, uptimeBucketStatusLabel, uptimeBucketsForRange, uptimePercent } from './UptimeHeartbeat'
import type { UptimeBucket } from '@/lib/uptime-buckets'
import { useLocalization } from './localization'

type Props = {
  card: CardType
  resources: ContainerResources | null
  history: ResourceMetricSample[]
  historyPeriodMs: number
  customMetrics: CustomMetric[]
  uptimeMetrics: UptimeMetricSummary[]
  loading: boolean
  onDetailSelect: (detail: MetricDetail) => void
  onUptimeDetailSelect: (metric: UptimeMetricSummary) => void
}

function ResourceMetric({ label, value, metricKey, pending = false, onSelect }: { label: string; value: ReactNode; metricKey?: string; pending?: boolean; onSelect?: () => void }) {
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
        interactive && 'card-action-button cursor-pointer hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
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
      <span className="dashmark-app-resource-metric-label min-w-0 truncate text-muted-foreground">{label}</span>
      <div className="dashmark-app-resource-metric-value ms-auto shrink-0">
        <span className="dashmark-app-resource-metric-number font-medium tabular-nums">{value}</span>
      </div>
    </div>
  )
}

function PendingMetric({ label, metricKey, waitingForNetwork = false }: { label: string; metricKey?: string; waitingForNetwork?: boolean }) {
  const { messages } = useLocalization()
  return (
    <ResourceMetric
      label={label}
      metricKey={metricKey}
      pending
      value={
        <span role="status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span className="sr-only">{waitingForNetwork ? messages.card.waitingForNetwork : messages.card.loading(label)}</span>
        </span>
      }
    />
  )
}

function UnavailableMetric({ label, metricKey }: { label: string; metricKey?: string }) {
  return <ResourceMetric label={label} metricKey={metricKey} value={useLocalization().messages.card.unavailable} pending />
}

function MetricList({ scrollable, children }: { scrollable: boolean; children: ReactNode }) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ top: false, bottom: false })

  useEffect(() => {
    if (!scrollable) return
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]')
    if (!viewport) return
    const updateFade = () =>
      setFade({
        top: viewport.scrollTop > 1,
        bottom: viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1
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
      <ScrollArea ref={scrollAreaRef} className="h-full pe-4">
        {content}
      </ScrollArea>
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-4 bg-linear-to-b from-popover to-transparent transition-opacity', fade.top ? 'opacity-100' : 'opacity-0')} />
      <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-linear-to-t from-popover to-transparent transition-opacity', fade.bottom ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}

function MetricBadge({ value, valueLabel, color }: { value: string; valueLabel?: string; color: CustomMetricStateColor }) {
  return <Badge className={cn('dashmark-state-badge max-w-full rounded-full', `dashmark-state-${color}`)}>{valueLabel ?? value.replace(/_/g, ' ')}</Badge>
}

function NetworkMetrics({
  resources,
  pending,
  history,
  historyPeriodMs,
  onSelect
}: Pick<Props, 'resources' | 'history' | 'historyPeriodMs'> & {
  pending: boolean
  onSelect: (detail: MetricDetail) => void
}) {
  const { locale, messages } = useLocalization()
  const detail = () => onSelect(networkMetricDetail(history, historyPeriodMs, messages.metrics.networkUsage, messages.card.received, messages.card.sent, locale))
  return (
    <>
      {(['received', 'sent'] as const).map((key) => {
        const value = resources?.[key === 'received' ? 'receivedBytesPerSecond' : 'sentBytesPerSecond']
        return value !== undefined ? (
          <ResourceMetric key={key} label={messages.card[key]} metricKey={key} value={`${formatBytes(value, locale)}/s`} onSelect={detail} />
        ) : pending ? (
          <PendingMetric key={key} label={messages.card[key]} metricKey={key} waitingForNetwork />
        ) : (
          <UnavailableMetric key={key} label={messages.card[key]} metricKey={key} />
        )
      })}
    </>
  )
}

function ResourceStatMetric({
  metricKey,
  resources,
  history,
  historyPeriodMs,
  onSelect
}: Pick<Props, 'resources' | 'history' | 'historyPeriodMs'> & {
  metricKey: 'cpu' | 'memory'
  onSelect: (detail: MetricDetail) => void
}) {
  const { locale, messages } = useLocalization()
  const label = messages.card[metricKey]
  const value = metricKey === 'cpu' ? resources?.cpuPercent : resources?.memoryUsage
  if (value === undefined || !resources) return <UnavailableMetric label={label} metricKey={metricKey} />
  return (
    <ResourceMetric
      label={label}
      metricKey={metricKey}
      value={metricKey === 'memory' ? (resources.memoryLimit ? formatPercent((value / resources.memoryLimit) * 100, locale) : formatBytes(value, locale)) : formatPercent(value, locale)}
      onSelect={() => onSelect(resourceMetricDetail(label, history, historyPeriodMs, metricKey, resources, locale))}
    />
  )
}

function PendingMetricEntry({ metricKey, label }: { metricKey: string; label: string }) {
  const { messages } = useLocalization()
  if (metricKey !== 'network') return <PendingMetric label={label} metricKey={metricKey} />
  return (
    <>
      <PendingMetric label={messages.card.received} metricKey="received" />
      <PendingMetric label={messages.card.sent} metricKey="sent" />
    </>
  )
}

function CustomMetrics({ selected, customMetrics, onSelect }: { selected: { key: string; label: string }[]; customMetrics: CustomMetric[]; onSelect: (detail: MetricDetail) => void }) {
  const { locale } = useLocalization()
  return (
    <>
      {selected.map((selectedMetric) => {
        const metric = customMetrics.find((candidate) => candidate.key === selectedMetric.key)
        if (!metric) return <UnavailableMetric key={selectedMetric.key} label={selectedMetric.label} metricKey={selectedMetric.key} />
        if ('pending' in metric && metric.pending) return <PendingMetric key={metric.key} label={metric.label} metricKey={metric.key} />
        if (!('unit' in metric))
          return (
            <ResourceMetric
              key={metric.key}
              label={metric.label}
              metricKey={metric.key}
              value={'color' in metric ? <MetricBadge value={metric.value} valueLabel={metric.valueLabel} color={metric.color} /> : metric.value}
            />
          )
        const interactive = metric.chart !== 'none'
        return (
          <ResourceMetric
            key={metric.key}
            label={metric.label}
            metricKey={metric.key}
            value={formatCustomMetric(metric.value, metric.unit, locale)}
            onSelect={interactive ? () => onSelect(customMetricDetail(metric, customMetrics, locale)) : undefined}
          />
        )
      })}
    </>
  )
}

function formatUptimePercent(value: number | undefined, locale: ReturnType<typeof useLocalization>['locale'], messages: ReturnType<typeof useLocalization>['messages']): string {
  return value === undefined ? messages.card.unavailable : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(value / 100)
}

function uptimeBucketSummary(
  bucket: UptimeBucket,
  locale: ReturnType<typeof useLocalization>['locale'],
  messages: ReturnType<typeof useLocalization>['messages']
): {
  label: string
  value: string
} {
  const label = formatUptimeBucketTime(bucket.start, locale, messages)
  const value = uptimeBucketStatusLabel(bucket.status, messages)
  return { label, value }
}

function UptimeMetricRow({ metric, onSelect }: { metric: UptimeMetricSummary; onSelect: (metric: UptimeMetricSummary) => void }) {
  const { locale, messages } = useLocalization()
  const [hoveredBucket, setHoveredBucket] = useState<UptimeBucket>()
  const buckets = uptimeBucketsForRange(metric.buckets, '24h')
  const summary = hoveredBucket
    ? uptimeBucketSummary(hoveredBucket, locale, messages)
    : {
        label: metric.label,
        value: formatUptimePercent(uptimePercent(buckets), locale, messages)
      }
  return (
    <button
      type="button"
      className="dashmark-uptime-metric card-action-button grid cursor-pointer gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onSelect(metric)
      }}
      aria-label={messages.metrics.viewHistory(metric.label.toLowerCase())}
    >
      <div className="grid gap-0.5 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-muted-foreground">{summary.label}</span>
          <span className="font-medium tabular-nums">{summary.value}</span>
        </div>
      </div>
      <UptimeHeartbeat buckets={buckets} className="h-3" onBucketHover={setHoveredBucket} />
    </button>
  )
}

function SelectedMetrics({
  selected,
  customMetrics,
  uptimeMetrics,
  onDetailSelect,
  onUptimeDetailSelect
}: {
  selected: { key: string; label: string }[]
  customMetrics: CustomMetric[]
  uptimeMetrics: UptimeMetricSummary[]
  onDetailSelect: (detail: MetricDetail) => void
  onUptimeDetailSelect: (metric: UptimeMetricSummary) => void
}) {
  return selected.map((selectedMetric) => {
    const metric = uptimeMetrics.find((candidate) => candidate.key === selectedMetric.key)
    return metric ? (
      <UptimeMetricRow key={metric.key} metric={metric} onSelect={onUptimeDetailSelect} />
    ) : (
      <CustomMetrics key={selectedMetric.key} selected={[selectedMetric]} customMetrics={customMetrics} onSelect={onDetailSelect} />
    )
  })
}

function ResourceMetrics({ card, resources, history, historyPeriodMs, customMetrics, uptimeMetrics, loading, onDetailSelect, onUptimeDetailSelect }: Props) {
  const { messages } = useLocalization()
  const showCpu = card.resourceStats?.includes('cpu')
  const showMemory = card.resourceStats?.includes('memory')
  const showNetwork = card.resourceStats?.includes('network') && !card.usesHostNetwork
  const selected = card.customMetricLabels ?? card.metrics?.filter((key) => !['cpu', 'memory', 'network', 'none'].includes(key)).map((key) => ({ key, label: key })) ?? []
  const configuredMetrics = card.metrics?.filter(
    (key) => (key === 'cpu' && showCpu) || (key === 'memory' && showMemory) || (key === 'network' && showNetwork) || selected.some((metric) => metric.key === key)
  )
  const metrics = configuredMetrics ?? [...(showCpu ? ['cpu'] : []), ...(showMemory ? ['memory'] : []), ...(showNetwork ? ['network'] : []), ...selected.map((metric) => metric.key)]
  const metricCount = metrics.reduce((count, key) => count + (key === 'network' ? 2 : 1), 0)
  const selectedByKey = new Map(selected.map((metric) => [metric.key, metric]))
  const metricLabel = (key: string) => (key === 'cpu' || key === 'memory' ? messages.card[key] : (selectedByKey.get(key)?.label ?? key))
  if (loading && resources === null)
    return (
      <MetricList scrollable={metricCount > 4}>
        {metrics.map((key) => (
          <PendingMetricEntry key={key} metricKey={key} label={metricLabel(key)} />
        ))}
      </MetricList>
    )
  return (
    <MetricList scrollable={metricCount > 4}>
      {metrics.map((key) => {
        if (key === 'cpu' || key === 'memory')
          return <ResourceStatMetric key={key} metricKey={key} resources={resources} history={history} historyPeriodMs={historyPeriodMs} onSelect={onDetailSelect} />
        if (key === 'network')
          return (
            <NetworkMetrics key={key} resources={resources} pending={loading || resources?.networkRatePending === true} history={history} historyPeriodMs={historyPeriodMs} onSelect={onDetailSelect} />
          )
        const metric = selectedByKey.get(key)
        return metric ? (
          <SelectedMetrics key={key} selected={[metric]} customMetrics={customMetrics} uptimeMetrics={uptimeMetrics} onDetailSelect={onDetailSelect} onUptimeDetailSelect={onUptimeDetailSelect} />
        ) : null
      })}
    </MetricList>
  )
}

export function MetricsTooltip(props: Props) {
  const { messages } = useLocalization()
  const { card } = props
  return (
    <TooltipContent side="top" align="center" collisionPadding={16} className="dashmark-app-resources w-60 p-3" data-card-id={card.id}>
      <div className="dashmark-app-resources-header mb-3 flex items-baseline justify-between gap-3 border-b pb-2">
        <span className="dashmark-app-resources-title text-[0.6875rem] leading-none font-medium tracking-[0.18em] text-muted-foreground uppercase">{messages.metrics.title}</span>
        {card.host && (
          <span className={cn('dashmark-app-resource-host inline-flex select-none items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', badgeColor(card.hostColor ?? 0))}>
            <Server className="h-3 w-3" aria-hidden="true" />
            {card.host}
          </span>
        )}
      </div>
      <ResourceMetrics {...props} />
    </TooltipContent>
  )
}
