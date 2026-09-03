import { lazy, memo, Suspense, useCallback, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Card as CardType } from '@/lib/docker'
import { MarqueeText } from './MarqueeText'
import { MetricsTooltip } from './MetricsTooltip'
import { StatusBadge } from './StatusBadge'
import { AppCardActions } from './AppCardActions'
import { AppCardIcon } from './AppCardIcon'
import type { MetricDetail } from './app-card-metrics'
import { UptimeDetailDialog } from './UptimeDetailDialog'
import { isMetricUsageActive, isStatusBadgeVisible, shouldShowResources, useLiveMetricDetail, useMetricErrorToasts } from './use-app-card-metrics'
import { useMetrics } from './use-metrics'
import { useTooltipController } from './tooltip-controller'
import type { UptimeMetricSummary } from '@/lib/realtime-client'

const loadMetricDetailDialog = () =>
  import('./MetricDetailDialog').then(({ MetricDetailDialog }) => ({
    default: MetricDetailDialog
  }))
const MetricDetailDialog = lazy(loadMetricDetailDialog)

type AppCardProps = {
  card: CardType
  showStatus?: boolean
  showMetrics?: boolean
  asCard?: boolean
  isLoading?: boolean
  openInNewTab?: boolean
}

export const AppCard = memo(function AppCard({ card, showStatus = true, showMetrics = true, asCard = false, isLoading = false, openInNewTab = false }: AppCardProps) {
  const { activeTooltip, setActiveTooltip } = useTooltipController()
  const dismissesTooltip = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [touchGlimmer, setTouchGlimmer] = useState(false)
  const [detail, setDetail] = useState<MetricDetail | null>(null)
  const [uptimeDetail, setUptimeDetail] = useState<UptimeMetricSummary | null>(null)
  const showResources = shouldShowResources(card, showMetrics)
  const resourceId = `resource-${card.id}`
  const descriptionId = `description-${card.id}`
  const resourceOpen = activeTooltip === resourceId
  const usage = useMetrics(card.id, showResources && !card.isDemo, isMetricUsageActive(resourceOpen, hovered, detail, uptimeDetail), card.resourceUsage, card.isDemo)
  useMetricErrorToasts(card, usage.metricErrors)
  useLiveMetricDetail(setDetail, usage.history, usage.customMetrics)
  const setTooltip = (id: string, open: boolean) => (open ? setActiveTooltip(id) : activeTooltip === id ? setActiveTooltip(null) : undefined)
  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation()
    if (event.pointerType === 'touch') {
      event.preventDefault()
      setActiveTooltip(activeTooltip === id ? null : id)
    }
  }
  const closeDetail = useCallback((open: boolean) => {
    if (!open) setDetail(null)
  }, [])
  const showBadge = isStatusBadgeVisible(card, showStatus, isLoading)
  const hasActions = showResources || Boolean(card.description)
  const className = cn(
    'dashmark-app-card group/card h-full overflow-hidden transition-[background-color,translate] not-has-[.card-action-button:hover]:hover:-translate-y-0.5',
    asCard
      ? 'dashmark-card-gradient min-w-0 bg-card not-has-[.card-action-button:hover]:hover:bg-surface-hover not-has-[.card-action-button:active]:active:bg-surface-hover dark:not-has-[.card-action-button:hover]:hover:bg-accent dark:not-has-[.card-action-button:active]:active:bg-accent'
      : 'min-w-0 border-0 bg-surface shadow-none not-has-[.card-action-button:hover]:hover:bg-surface-hover not-has-[.card-action-button:active]:active:bg-surface-hover'
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
          if (activeTooltip && !(event.target instanceof Element && event.target.closest('.card-action-button, .dashmark-app-resources'))) {
            event.preventDefault()
            dismissesTooltip.current = true
            setActiveTooltip(null)
          }
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch' && !event.defaultPrevented) {
            setTouchGlimmer(true)
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
        <Card className={cn(className, touchGlimmer && 'dashmark-app-card-glimmering')}>
          <CardContent className="dashmark-app-content relative flex h-24 items-center gap-3 p-3">
            <AppCardIcon icon={card.icon} title={card.title} asCard={asCard} />
            <div className="dashmark-app-details flex min-w-0 flex-1 flex-col gap-2">
              <div className="dashmark-app-header flex min-w-0">
                <MarqueeText className={cn('dashmark-app-title min-w-0 flex-1 text-sm font-[550] sm:text-[0.9375rem] lg:text-base', hasActions && 'me-[65px]')}>{card.title}</MarqueeText>
              </div>
              <MarqueeText className="dashmark-app-url text-xs text-muted-foreground">
                <bdi dir="ltr">{card.url}</bdi>
              </MarqueeText>
              {showBadge && (
                <div className="dashmark-app-status-container">
                  <StatusBadge state={card.state} health={card.health} loading={isLoading && card.hasContainer} asCard={asCard} />
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
                onDescriptionOpenChange={(open) => setTooltip(descriptionId, open)}
                onResourceIntent={() => {
                  void loadMetricDetailDialog()
                }}
                onPointerDown={pointerDown}
              >
                {showResources && <MetricsTooltip card={card} {...usage} onDetailSelect={setDetail} onUptimeDetailSelect={setUptimeDetail} />}
              </AppCardActions>
            )}
          </CardContent>
        </Card>
      </a>
      {detail && (
        <Suspense fallback={null}>
          <MetricDetailDialog detail={detail} onOpen={() => setActiveTooltip(null)} onOpenChange={closeDetail} />
        </Suspense>
      )}
      <UptimeDetailDialog
        metric={uptimeDetail}
        onOpenChange={(open) => {
          if (!open) setUptimeDetail(null)
        }}
      />
    </>
  )
})
