import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { statusLabel, strings } from '@/lib/strings'

type StatusBadgeProps = {
  state?: string
  health?: string
  loading?: boolean
  asCard?: boolean
}

function getColorClass(status: string): string {
  switch (status) {
    case 'running':
    case 'healthy':
      return 'bg-success/15 text-success'
    case 'starting':
    case 'paused':
      return 'bg-warning/15 text-warning'
    case 'created':
    case 'restarting':
      return 'bg-info/15 text-info'
    case 'unhealthy':
    case 'exited':
    case 'dead':
    case 'removing':
      return 'bg-destructive/15 text-destructive'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function StatusBadge({ state, health, loading, asCard = false }: StatusBadgeProps) {
  if (loading) {
    return (
      <span
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-full',
          asCard ? 'bg-muted' : 'bg-surface-active'
        )}
        aria-busy="true"
        aria-label={strings.status.loading}
      >
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </span>
    )
  }

  const display = health === 'starting' || health === 'unhealthy' ? health : state

  if (!display) return null

  const colorClass = getColorClass(display.toLowerCase())

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass
      )}
    >
      {statusLabel(display)}
    </span>
  )
}
