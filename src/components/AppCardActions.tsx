import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Gauge, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TOOLTIP_DELAY_MS } from '@/lib/constants'
import type { Card } from '@/lib/docker'
import { useLocalization } from './localization'

type AppCardActionsProps = {
  card: Card
  showResources: boolean
  resourceOpen: boolean
  descriptionOpen: boolean
  onResourceOpenChange: (open: boolean) => void
  onDescriptionOpenChange: (open: boolean) => void
  onResourceIntent: () => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, id: string) => void
  children: ReactNode
}

export function AppCardActions({ card, showResources, resourceOpen, descriptionOpen, onResourceOpenChange, onDescriptionOpenChange, onResourceIntent, onPointerDown, children }: AppCardActionsProps) {
  const { messages } = useLocalization()
  const resourceId = `resource-${card.id}`
  const descriptionId = `description-${card.id}`
  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <div className="absolute top-2 end-2 flex items-center gap-1">
        {showResources && (
          <Tooltip open={resourceOpen} onOpenChange={onResourceOpenChange}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dashmark-app-resources-trigger card-action-button cursor-help rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                onClick={(event) => event.preventDefault()}
                onFocus={onResourceIntent}
                onPointerEnter={onResourceIntent}
                onPointerDown={(event) => onPointerDown(event, resourceId)}
              >
                <Gauge className="h-4 w-4" />
                <span className="sr-only">{messages.card.resourceUsage}</span>
              </button>
            </TooltipTrigger>
            {children}
          </Tooltip>
        )}
        {card.description && (
          <Tooltip open={descriptionOpen} onOpenChange={onDescriptionOpenChange}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dashmark-app-description-trigger card-action-button cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 dark:hover:text-muted-foreground/70"
                onClick={(event) => event.preventDefault()}
                onPointerDown={(event) => onPointerDown(event, descriptionId)}
              >
                <Info className="h-4 w-4" />
                <span className="sr-only">{messages.card.description}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" collisionPadding={16} className="dashmark-app-description max-w-xs">
              <p>{card.description}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}
