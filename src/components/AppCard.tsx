import { memo, useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { Gauge, Info, LoaderCircle } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { MarqueeText } from './MarqueeText'
import type { Card as CardType } from '@/lib/docker'
import { getInitials } from '@/lib/initials'
import { strings } from '@/lib/strings'
import { useIsDark } from '@/lib/use-is-dark'
import { isResourceUsageResponse, type ContainerResources } from '@/lib/status'

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

function ResourceMetric({ label, value, percent, pending = false }: { label: string; value: ReactNode; percent?: number; pending?: boolean }) {
  return (
    <div className={cn('grid gap-1.5', pending && 'opacity-50')}>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      {percent !== undefined && <Progress value={Math.min(100, Math.max(0, percent))} aria-label={`${label}: ${value}`} />}
    </div>
  )
}

function NetworkMetric({ label, value }: { label: string; value: number | undefined }) {
  if (value !== undefined) {
    return <ResourceMetric label={label} value={`${formatBytes(value)}/s`} />
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

function ResourceUsageTooltip({ card, resources }: { card: CardType; resources: ContainerResources | null }) {
  const memoryPercent = resources?.memoryUsage !== undefined && resources.memoryLimit
    ? (resources.memoryUsage / resources.memoryLimit) * 100
    : undefined
  const showNetwork = card.resourceStats?.includes('network')
  const hasUsage = resources?.cpuPercent !== undefined || resources?.memoryUsage !== undefined
    || resources?.receivedBytesPerSecond !== undefined || resources?.sentBytesPerSecond !== undefined || (resources !== null && showNetwork)

  return (
    <TooltipContent side="top" align="center" collisionPadding={16} className="dashmark-app-resources w-60 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold">{strings.card.resourceUsage}</span>
        {card.host && (
          <span className="dashmark-app-resource-host inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {strings.card.host}: {card.host}
          </span>
        )}
      </div>
      {hasUsage ? (
        <div className="grid gap-3">
          {resources?.cpuPercent !== undefined && (
            <ResourceMetric label={strings.card.cpu} value={formatPercent(resources.cpuPercent)} percent={resources.cpuPercent} />
          )}
          {resources?.memoryUsage !== undefined && (
            <ResourceMetric
              label={strings.card.memory}
              value={resources.memoryLimit ? `${formatBytes(resources.memoryUsage)} / ${formatBytes(resources.memoryLimit)}` : formatBytes(resources.memoryUsage)}
              percent={memoryPercent ?? 0}
            />
          )}
          {resources !== null && showNetwork && (
            <>
              <NetworkMetric label={strings.card.received} value={resources.receivedBytesPerSecond} />
              <NetworkMetric label={strings.card.sent} value={resources.sentBytesPerSecond} />
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{strings.card.unavailable}</p>
      )}
    </TooltipContent>
  )
}

function useResourceUsage(cardId: string, enabled: boolean, open: boolean): ContainerResources | null {
  const [resources, setResources] = useState<ContainerResources | null>(null)

  useEffect(() => {
    if (!enabled || !open) return

    setResources(null)

    let stopped = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined

    async function poll() {
      controller = new AbortController()
      try {
        const response = await fetch(`/api/resources?id=${encodeURIComponent(cardId)}`, { signal: controller.signal })
        const data: unknown = await response.json()
        if (!stopped && response.ok && isResourceUsageResponse(data)) setResources(data.resource)
      } catch {
        if (!stopped) setResources(null)
      } finally {
        controller = undefined
        if (!stopped) timeout = setTimeout(poll, 2_000)
      }
    }

    poll()
    return () => {
      stopped = true
      controller?.abort()
      if (timeout) clearTimeout(timeout)
    }
  }, [cardId, enabled, open])

  return resources
}

export const AppCard = memo(function AppCard({ card, showStatus = true, showResourceUsage = true, asCard = false, isLoading = false, openInNewTab = false }: AppCardProps) {
  const hasStatus = card.health === 'starting' || card.health === 'unhealthy' || Boolean(card.state)
  const showStatusBadge = showStatus && card.showStatus !== false && (hasStatus || (isLoading && card.hasContainer))
  const showResourceUsageTooltip = showResourceUsage && card.showStatus !== false && card.hasContainer && card.resourceStats !== undefined && card.resourceStats.length > 0
  const [resourceTooltipOpen, setResourceTooltipOpen] = useState(false)
  const resources = useResourceUsage(card.id, showResourceUsageTooltip, resourceTooltipOpen)
  const hasActions = showResourceUsageTooltip || Boolean(card.description)
  const cardClassName = cn(
    'dashmark-app-card group/card h-full overflow-hidden transition-[background-color,translate] not-has-[.card-action-button:hover]:hover:-translate-y-0.5',
    asCard
      ? 'min-w-0 bg-card not-has-[.card-action-button:hover]:hover:bg-surface-hover not-has-[.card-action-button:active]:active:bg-surface-hover dark:not-has-[.card-action-button:hover]:hover:bg-accent dark:not-has-[.card-action-button:active]:active:bg-accent'
      : 'min-w-0 border-0 bg-surface shadow-none not-has-[.card-action-button:hover]:hover:bg-surface-hover not-has-[.card-action-button:active]:active:bg-surface-hover'
  )

  return (
    <a
      href={card.url}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      className="dashmark-app-link block h-full rounded-lg"
    >
      <Card className={cardClassName}>
        <CardContent className="dashmark-app-content relative flex min-h-24 items-center gap-5 p-3">
          <AppIcon icon={card.icon} title={card.title} asCard={asCard} />
          <div className="dashmark-app-details min-w-0 flex-1">
            <div className="dashmark-app-header flex min-w-0">
              <MarqueeText className={cn('dashmark-app-title min-w-0 flex-1 text-sm font-semibold sm:text-[0.9375rem] lg:text-base', hasActions && 'mr-[4.5rem]')}>
                {card.title}
              </MarqueeText>
            </div>
            <MarqueeText className="dashmark-app-url text-xs text-muted-foreground">
              {card.url}
            </MarqueeText>
            {showStatusBadge && (
              <div className="dashmark-app-status-container mt-2">
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
            <TooltipProvider>
              <div className="absolute top-3 right-3 flex items-center gap-1">
                {showResourceUsageTooltip && (
                  <Tooltip open={resourceTooltipOpen} onOpenChange={setResourceTooltipOpen}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="dashmark-app-resources-trigger card-action-button cursor-help rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                        onClick={e => e.preventDefault()}
                        onPointerDown={e => e.stopPropagation()}
                      >
                        <Gauge className="h-4 w-4" />
                        <span className="sr-only">{strings.card.resourceUsage}</span>
                      </button>
                    </TooltipTrigger>
                    <ResourceUsageTooltip card={card} resources={resources} />
                  </Tooltip>
                )}
                {card.description && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="dashmark-app-description-trigger card-action-button cursor-help rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                        onClick={e => e.preventDefault()}
                        onPointerDown={e => e.stopPropagation()}
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
  )
})
