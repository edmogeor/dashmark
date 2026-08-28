import type { UptimeObservation, UptimeStatus } from '@/lib/status'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const HOUR_MS = 60 * 60 * 1_000

function formatResponseTime(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}ms`
}

export type UptimeBucketStatus = UptimeStatus | 'mixed'
export type UptimeBucket = {
  start: number
  end: number
  status: UptimeBucketStatus
  successes: number
  failures: number
  slowestResponseTimeMs?: number
}

export function uptimeBuckets(observations: UptimeObservation[], durationMs: number, bucketCount: number, now = Date.now()): UptimeBucket[] {
  const bucketMs = durationMs / bucketCount
  const currentBucketStart = Math.floor(now / bucketMs) * bucketMs
  const hasCurrentObservation = observations.some((observation) => observation.timestamp >= currentBucketStart && observation.timestamp <= now)
  const end = hasCurrentObservation ? currentBucketStart + bucketMs : currentBucketStart
  const start = end - durationMs
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = start + index * bucketMs
    const bucketEnd = bucketStart + bucketMs
    const entries = observations.filter((entry) => entry.timestamp >= bucketStart && entry.timestamp < bucketEnd)
    const successes = entries.filter((entry) => entry.status === 'up').length
    const failures = entries.filter((entry) => entry.status === 'down').length
    const responseTimes = entries.flatMap((entry) => (entry.responseTimeMs === undefined ? [] : [entry.responseTimeMs]))
    return {
      start: bucketStart,
      end: bucketEnd,
      status: failures > 0 && successes > 0 ? 'mixed' : failures > 0 ? 'down' : successes > 0 ? 'up' : 'unknown',
      successes,
      failures,
      slowestResponseTimeMs: responseTimes.length > 0 ? Math.max(...responseTimes) : undefined
    }
  })
}

export function uptimePercent(buckets: UptimeBucket[]): number | undefined {
  const successes = buckets.reduce((total, bucket) => total + bucket.successes, 0)
  const failures = buckets.reduce((total, bucket) => total + bucket.failures, 0)
  return successes + failures > 0 ? (successes / (successes + failures)) * 100 : undefined
}

export function formatUptimeBucketTime(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const yesterday = startOfDay - 24 * HOUR_MS
  const daysSinceMonday = (today.getDay() + 6) % 7
  const startOfWeek = startOfDay - daysSinceMonday * 24 * HOUR_MS
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(timestamp)
  const calendarDate = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(timestamp)
  const relativeDay = timestamp >= startOfDay ? 'Today' : timestamp >= yesterday ? 'Yesterday' : timestamp >= startOfWeek ? day : calendarDate
  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
  return `${relativeDay}, ${time}`
}

function bucketLabel(bucket: UptimeBucket): string {
  const counts =
    bucket.status === 'unknown'
      ? 'No checks were recorded'
      : [
          bucket.successes > 0 ? `${bucket.successes} successful check${bucket.successes === 1 ? '' : 's'}` : '',
          bucket.failures > 0 ? `${bucket.failures} failed check${bucket.failures === 1 ? '' : 's'}` : ''
        ]
          .filter(Boolean)
          .join(', ')
  const responseTime = bucket.slowestResponseTimeMs === undefined ? '' : `, slowest response ${formatResponseTime(bucket.slowestResponseTimeMs)}`
  return `${formatUptimeBucketTime(bucket.start)}: ${counts}${responseTime}`
}

const statusClass: Record<UptimeBucketStatus, string> = {
  up: 'bg-success',
  down: 'bg-destructive',
  mixed: 'bg-warning',
  unknown: 'bg-muted-foreground/30'
}

export const uptimeBucketStatusLabel: Record<UptimeBucketStatus, string> = {
  up: 'Up',
  down: 'Down',
  mixed: 'Partial',
  unknown: 'No data'
}

const statusTextClass: Record<UptimeBucketStatus, string> = {
  up: 'text-success',
  down: 'text-destructive',
  mixed: 'text-warning',
  unknown: 'text-muted-foreground'
}

function UptimeBucketTooltip({ bucket }: { bucket: UptimeBucket }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4 leading-none">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatUptimeBucketTime(bucket.start)}
        </span>
        <span className={cn('font-medium', statusTextClass[bucket.status])}>{uptimeBucketStatusLabel[bucket.status]}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border/60 pt-2 leading-none tabular-nums">
        <span className="text-muted-foreground">Successful</span>
        <span className="text-right font-medium">{bucket.successes}</span>
        <span className="text-muted-foreground">Failed</span>
        <span className="text-right font-medium">{bucket.failures}</span>
        {bucket.slowestResponseTimeMs !== undefined && (
          <>
            <span className="text-muted-foreground">Slowest</span>
            <span className="text-right font-medium">{formatResponseTime(bucket.slowestResponseTimeMs)}</span>
          </>
        )}
      </div>
    </div>
  )
}

function UptimeCell({
  bucket,
  onHover,
  showTooltips,
  collisionBoundary
}: {
  bucket: UptimeBucket
  onHover?: (bucket: UptimeBucket) => void
  showTooltips: boolean
  collisionBoundary?: Element | null
}) {
  const className = cn('dashmark-uptime-heartbeat-cell min-w-0 rounded-sm', statusClass[bucket.status])
  if (showTooltips)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={cn(className, 'cursor-help focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')} aria-label={bucketLabel(bucket)} />
        </TooltipTrigger>
        <TooltipContent side="top" collisionBoundary={collisionBoundary} collisionPadding={8} className="w-48 p-3 text-xs">
          <UptimeBucketTooltip bucket={bucket} />
        </TooltipContent>
      </Tooltip>
    )
  return <span className={className} aria-label={bucketLabel(bucket)} onPointerEnter={() => onHover?.(bucket)} />
}

export function UptimeHeartbeat({
  observations,
  durationMs,
  bucketCount,
  className,
  onBucketHover,
  showTooltips = false,
  collisionBoundary
}: {
  observations: UptimeObservation[]
  durationMs: number
  bucketCount: number
  className?: string
  onBucketHover?: (bucket: UptimeBucket | undefined) => void
  showTooltips?: boolean
  collisionBoundary?: Element | null
}) {
  const buckets = uptimeBuckets(observations, durationMs, bucketCount)
  const cells = (
    <div
      className={cn('dashmark-uptime-heartbeat grid grid-flow-col auto-cols-fr gap-0.5', className)}
      aria-label={`Uptime history for the last ${Math.round(durationMs / HOUR_MS)} hours`}
      onPointerLeave={() => onBucketHover?.(undefined)}
    >
      {buckets.map((bucket) => (
        <UptimeCell key={bucket.start} bucket={bucket} onHover={onBucketHover} showTooltips={showTooltips} collisionBoundary={collisionBoundary} />
      ))}
    </div>
  )
  return showTooltips ? <TooltipProvider delayDuration={0}>{cells}</TooltipProvider> : cells
}
