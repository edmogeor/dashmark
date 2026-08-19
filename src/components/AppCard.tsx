import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { Info, Box } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { MarqueeText } from './MarqueeText'
import type { Card as CardType } from '@/lib/docker'
import { getInitials } from '@/lib/initials'
import { strings } from '@/lib/strings'

type AppCardProps = {
  card: CardType
  showStatus?: boolean
  asCard?: boolean
  isLoading?: boolean
}

function InitialsPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-foreground/50 transition-colors group-hover/card:bg-card">
      {getInitials(title)}
    </div>
  )
}

function AppIcon({ icon, title }: { icon: CardType['icon']; title: string }) {
  const [error, setError] = useState(false)

  if (icon.type === 'none') {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground transition-colors group-hover/card:bg-card">
        <Box className="h-5 w-5" />
      </div>
    )
  }

  if (icon.type === 'image' && !error) {
    return (
      <img
        src={icon.src}
        alt={icon.alt}
        className="h-10 w-10 object-contain"
        loading="lazy"
        onError={() => setError(true)}
      />
    )
  }

  return <InitialsPlaceholder title={title} />
}

export const AppCard = memo(function AppCard({ card, showStatus = true, asCard = false, isLoading = false }: AppCardProps) {
  const cardClassName = cn(
    'group/card h-full overflow-hidden transition-[background-color,translate] not-has-[.info-button:hover]:hover:-translate-y-0.5',
    asCard
      ? 'min-w-0 bg-card not-has-[.info-button:hover]:hover:bg-accent'
      : 'min-w-0 border-0 bg-surface shadow-none not-has-[.info-button:hover]:hover:bg-surface-hover'
  )

  return (
    <a href={card.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg">
      <Card className={cardClassName}>
        <CardContent className="flex items-start gap-4 p-4">
          <AppIcon icon={card.icon} title={card.title} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <MarqueeText className="min-w-0 flex-1 font-semibold">
                {card.title}
              </MarqueeText>
              {card.description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="info-button shrink-0 cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                        onClick={e => e.preventDefault()}
                      >
                        <Info className="h-4 w-4" />
                        <span className="sr-only">{strings.card.description}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center" collisionPadding={16} className="max-w-xs">
                      <p>{card.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <MarqueeText className="text-xs text-muted-foreground">
              {card.url}
            </MarqueeText>
            {showStatus && (
              <div className="mt-2">
                <StatusBadge
                  state={card.state}
                  health={card.health}
                  loading={isLoading && card.hasContainer}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </a>
  )
})
