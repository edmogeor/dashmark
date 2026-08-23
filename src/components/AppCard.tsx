import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { Info } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { MarqueeText } from './MarqueeText'
import type { Card as CardType } from '@/lib/docker'
import { getInitials } from '@/lib/initials'
import { strings } from '@/lib/strings'
import { useIsDark } from '@/lib/use-is-dark'

type AppCardProps = {
  card: CardType
  showStatus?: boolean
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

export const AppCard = memo(function AppCard({ card, showStatus = true, asCard = false, isLoading = false, openInNewTab = false }: AppCardProps) {
  const hasStatus = card.health === 'starting' || card.health === 'unhealthy' || Boolean(card.state)
  const showStatusBadge = showStatus && card.showStatus !== false && (hasStatus || (isLoading && card.hasContainer))
  const cardClassName = cn(
    'dashmark-app-card group/card h-full overflow-hidden transition-[background-color,translate] not-has-[.info-button:hover]:hover:-translate-y-0.5',
    asCard
      ? 'min-w-0 bg-card not-has-[.info-button:hover]:hover:bg-surface-hover not-has-[.info-button:active]:active:bg-surface-hover dark:not-has-[.info-button:hover]:hover:bg-accent dark:not-has-[.info-button:active]:active:bg-accent'
      : 'min-w-0 border-0 bg-surface shadow-none not-has-[.info-button:hover]:hover:bg-surface-hover not-has-[.info-button:active]:active:bg-surface-hover'
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
              <MarqueeText className={cn('dashmark-app-title min-w-0 flex-1 text-sm font-semibold sm:text-[0.9375rem] lg:text-base', card.description && 'pr-6')}>
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
          {card.description && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="dashmark-app-description-trigger info-button absolute top-3 right-3 cursor-help rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
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
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </a>
  )
})
