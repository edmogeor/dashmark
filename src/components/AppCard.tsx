import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Gauge, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Card as CardType } from '@/lib/docker'
import { getInitials } from '@/lib/initials'
import { strings } from '@/lib/strings'
import { useIsDark } from '@/lib/use-is-dark'
import { TOOLTIP_DELAY_MS } from '@/lib/constants'
import { showErrorToast, clearStaleErrorToasts } from '@/lib/error-toasts'
import { MarqueeText } from './MarqueeText'
import { MetricDetailDialog } from './MetricDetailDialog'
import { MetricsTooltip } from './MetricsTooltip'
import { StatusBadge } from './StatusBadge'
import {
  customMetricsHistory,
  resourceMetricHistory,
  type MetricDetail,
} from './app-card-metrics'
import { useMetrics } from './use-metrics'
import { useTooltipController } from './tooltip-controller'
import type { CustomMetric, ResourceMetricSample, UptimeMetric } from '@/lib/status'
import { UptimeDetailDialog } from './UptimeDetailDialog'

type AppCardProps = {
  card: CardType
  showStatus?: boolean
  showMetrics?: boolean
  asCard?: boolean
  isLoading?: boolean
  openInNewTab?: boolean
}

function InitialsPlaceholder({
  title,
  asCard,
}: {
  title: string
  asCard: boolean
}) {
  return (
    <div
      className={cn(
        'dashmark-app-icon dashmark-app-icon-placeholder flex h-12 w-12 items-center justify-center rounded-lg pl-1 text-sm font-semibold text-foreground/50',
        asCard ? 'bg-surface dark:bg-background' : 'bg-card',
      )}
    >
      {getInitials(title)}
    </div>
  )
}

function useContrastAwareSrc(icon: CardType['icon']): string | undefined {
  const isDark = useIsDark()
  if (icon.type !== 'image') return undefined
  if (!icon.contrast) return icon.src
  if (icon.contrast === 'dark' && isDark)
    return icon.src.replace(/\.svg$/, '-light.svg')
  if (icon.contrast === 'light' && !isDark)
    return icon.src.replace(/\.svg$/, '-dark.svg')
  return icon.src
}

function AppIcon({
  icon,
  title,
  asCard,
}: {
  icon: CardType['icon']
  title: string
  asCard: boolean
}) {
  const [error, setError] = useState(false)
  const src = useContrastAwareSrc(icon)
  return icon.type === 'image' && src && !error ? (
    <img
      src={src}
      alt={icon.alt}
      className="dashmark-app-icon h-12 w-12 object-contain pl-1"
      loading="lazy"
      onError={() => setError(true)}
    />
  ) : (
    <InitialsPlaceholder title={title} asCard={asCard} />
  )
}

function useMetricErrorToasts(
  card: CardType,
  metricErrors: { key: string; message: string }[],
) {
  const allErrors = [...(card.metricErrors ?? []), ...metricErrors]
  const signature = allErrors
    .map((error) => `${error.key}:${error.message}`)
    .join('|')
  useEffect(() => {
    const activeErrors = new Set(
      allErrors.map((error) => `metric-${card.id}:${error.key}`),
    )
    for (const error of allErrors) {
      const label =
        card.customMetricLabels?.find((metric) => metric.key === error.key)
          ?.label ?? error.key
      showErrorToast(
        `metric-${card.id}:${error.key}`,
        `${card.title} metric unavailable`,
        `${label}: ${error.message}`,
      )
    }
    clearStaleErrorToasts(`metric-${card.id}:`, activeErrors)
  }, [card.id, card.title, signature])
}

function useLiveMetricDetail(
  setDetail: Dispatch<SetStateAction<MetricDetail | null>>,
  history: ResourceMetricSample[],
  customMetrics: CustomMetric[],
) {
  useEffect(
    () =>
      setDetail((current) =>
        !current || current.customMetricKeys
          ? current
          : { ...current, history: resourceMetricHistory(history) },
      ),
    [history, setDetail],
  )
  useEffect(
    () =>
      setDetail((current) => {
        if (!current?.customMetricKeys) return current
        const metrics = current.customMetricKeys.flatMap((key) => {
          const metric = customMetrics.find(
            (candidate) => candidate.key === key,
          )
          return metric && 'unit' in metric ? [metric] : []
        })
        return metrics.length === current.customMetricKeys.length
          ? {
              ...current,
              history: customMetricsHistory(metrics),
              historyPeriodMs: metrics[0]!.historyPeriodMs,
            }
          : current
      }),
    [customMetrics, setDetail],
  )
}

function AppCardActions({
  card,
  showResources,
  resourceOpen,
  descriptionOpen,
  onResourceOpenChange,
  onDescriptionOpenChange,
  onPointerDown,
  children,
}: {
  card: CardType
  showResources: boolean
  resourceOpen: boolean
  descriptionOpen: boolean
  onResourceOpenChange: (open: boolean) => void
  onDescriptionOpenChange: (open: boolean) => void
  onPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
  ) => void
  children: ReactNode
}) {
  const resourceId = `resource-${card.id}`
  const descriptionId = `description-${card.id}`
  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {showResources && (
          <Tooltip open={resourceOpen} onOpenChange={onResourceOpenChange}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dashmark-app-resources-trigger card-action-button cursor-help rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                onClick={(event) => event.preventDefault()}
                onPointerDown={(event) => onPointerDown(event, resourceId)}
              >
                <Gauge className="h-4 w-4" />
                <span className="sr-only">{strings.card.resourceUsage}</span>
              </button>
            </TooltipTrigger>
            {children}
          </Tooltip>
        )}
        {card.description && (
          <Tooltip
            open={descriptionOpen}
            onOpenChange={onDescriptionOpenChange}
          >
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dashmark-app-description-trigger card-action-button cursor-help rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                onClick={(event) => event.preventDefault()}
                onPointerDown={(event) => onPointerDown(event, descriptionId)}
              >
                <Info className="h-4 w-4" />
                <span className="sr-only">{strings.card.description}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="center"
              collisionPadding={16}
              className="dashmark-app-description max-w-xs"
            >
              <p>{card.description}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

export const AppCard = memo(function AppCard({
  card,
  showStatus = true,
  showMetrics = true,
  asCard = false,
  isLoading = false,
  openInNewTab = false,
}: AppCardProps) {
  const { activeTooltip, setActiveTooltip } = useTooltipController()
  const dismissesTooltip = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [detail, setDetail] = useState<MetricDetail | null>(null)
  const [uptimeDetail, setUptimeDetail] = useState<UptimeMetric | null>(null)
  const hasSelectedCustomMetric = card.metrics?.some(
    (metric) => !['cpu', 'memory', 'network', 'none'].includes(metric),
  ) ?? false
  const hasCustomMetrics =
    (card.customMetricLabels?.length ?? 0) > 0 ||
    (card.metricErrors?.length ?? 0) > 0 ||
    hasSelectedCustomMetric
  const showResources =
    showMetrics &&
    card.showStatus !== false &&
    ((card.hasContainer &&
      ((card.resourceStats?.length ?? 0) > 0 || hasCustomMetrics)) ||
      (!card.hasContainer && hasCustomMetrics))
  const resourceId = `resource-${card.id}`
  const descriptionId = `description-${card.id}`
  const resourceOpen = activeTooltip === resourceId
  const usage = useMetrics(
    card.id,
    showResources,
    resourceOpen || hovered || detail !== null,
    card.resourceUsage,
    card.metricsPollIntervalMs,
    card.isDemo,
  )
  useMetricErrorToasts(card, usage.metricErrors)
  useLiveMetricDetail(setDetail, usage.history, usage.customMetrics)
  const setTooltip = (id: string, open: boolean) =>
    open
      ? setActiveTooltip(id)
      : activeTooltip === id
        ? setActiveTooltip(null)
        : undefined
  const pointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    event.stopPropagation()
    if (event.pointerType === 'touch') {
      event.preventDefault()
      setActiveTooltip(activeTooltip === id ? null : id)
    }
  }
  const closeDetail = useCallback((open: boolean) => {
    if (!open) setDetail(null)
  }, [])
  const hasStatus =
    card.health === 'starting' ||
    card.health === 'unhealthy' ||
    Boolean(card.state)
  const showBadge =
    showStatus &&
    card.showStatus !== false &&
    (hasStatus || (isLoading && card.hasContainer))
  const hasActions = showResources || Boolean(card.description)
  const className = cn(
    'dashmark-app-card group/card h-full overflow-hidden transition-[background-color,translate] not-has-[.card-action-button:hover]:hover:-translate-y-0.5',
    asCard
      ? 'min-w-0 bg-card not-has-[.card-action-button:hover]:hover:bg-surface-hover not-has-[.card-action-button:active]:active:bg-surface-hover dark:not-has-[.card-action-button:hover]:hover:bg-accent dark:not-has-[.card-action-button:active]:active:bg-accent'
      : 'min-w-0 border-0 bg-surface shadow-none not-has-[.card-action-button:hover]:hover:bg-surface-hover not-has-[.card-action-button:active]:active:bg-surface-hover',
  )
  return (
    <>
      <a
        href={card.url}
        target={openInNewTab ? '_blank' : undefined}
        rel={openInNewTab ? 'noopener noreferrer' : undefined}
        className="dashmark-app-link block h-full rounded-lg"
        onPointerEnter={showResources ? () => setHovered(true) : undefined}
        onPointerLeave={showResources ? () => setHovered(false) : undefined}
        onPointerDownCapture={(event) => {
          if (
            activeTooltip &&
            !(
              event.target instanceof Element &&
              event.target.closest('.card-action-button')
            )
          ) {
            event.preventDefault()
            dismissesTooltip.current = true
            setActiveTooltip(null)
          }
        }}
        onClickCapture={(event: ReactMouseEvent<HTMLAnchorElement>) => {
          if (dismissesTooltip.current) {
            event.preventDefault()
            event.stopPropagation()
            dismissesTooltip.current = false
          }
        }}
      >
        <Card className={className}>
          <CardContent className="dashmark-app-content relative flex min-h-24 items-center gap-5 p-3">
            <AppIcon icon={card.icon} title={card.title} asCard={asCard} />
            <div className="dashmark-app-details flex min-w-0 flex-1 flex-col gap-2">
              <div className="dashmark-app-header flex min-w-0">
                <MarqueeText
                  className={cn(
                    'dashmark-app-title min-w-0 flex-1 text-sm font-semibold sm:text-[0.9375rem] lg:text-base',
                    hasActions && 'mr-[65px]',
                  )}
                >
                  {card.title}
                </MarqueeText>
              </div>
              <MarqueeText className="dashmark-app-url text-xs text-muted-foreground">
                {card.url}
              </MarqueeText>
              {showBadge && (
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
              <AppCardActions
                card={card}
                showResources={showResources}
                resourceOpen={resourceOpen}
                descriptionOpen={activeTooltip === descriptionId}
                onResourceOpenChange={(open) => setTooltip(resourceId, open)}
                onDescriptionOpenChange={(open) =>
                  setTooltip(descriptionId, open)
                }
                onPointerDown={pointerDown}
              >
                {showResources && (
                  <MetricsTooltip
                    card={card}
                    {...usage}
                    onDetailSelect={setDetail}
                    onUptimeDetailSelect={setUptimeDetail}
                  />
                )}
              </AppCardActions>
            )}
          </CardContent>
        </Card>
      </a>
      <MetricDetailDialog
        detail={detail}
        onOpen={() => setActiveTooltip(null)}
        onOpenChange={closeDetail}
      />
      <UptimeDetailDialog
        metric={uptimeDetail}
        onOpenChange={(open) => { if (!open) setUptimeDetail(null) }}
      />
    </>
  )
})
