import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { statusLabel, strings } from '@/i18n'

type StatusBadgeProps = {
  state?: string
  health?: string
  loading?: boolean
  asCard?: boolean
}

const STATUS_COLOR_CLASSES: Record<string, string> = {
  running: 'dashmark-state-success',
  healthy: 'dashmark-state-success',
  starting: 'dashmark-state-warning',
  paused: 'dashmark-state-warning',
  created: 'dashmark-state-info',
  restarting: 'dashmark-state-info',
  unhealthy: 'dashmark-state-error',
  exited: 'dashmark-state-error',
  dead: 'dashmark-state-error',
  removing: 'dashmark-state-error'
}

function getColorClass(status: string): string {
  return STATUS_COLOR_CLASSES[status] ?? 'bg-muted text-muted-foreground'
}

export function StatusBadge({ state, health, loading, asCard = false }: StatusBadgeProps) {
  if (loading) {
    return (
      <span
        className={cn('dashmark-app-status dashmark-app-status-loading inline-flex h-5 w-5 items-center justify-center rounded-full', asCard ? 'bg-muted' : 'bg-surface-active')}
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

  return <span className={cn('dashmark-app-status dashmark-state-badge inline-flex select-none items-center rounded-full px-2.5 py-1 text-xs font-medium', colorClass)}>{statusLabel(display)}</span>
}
