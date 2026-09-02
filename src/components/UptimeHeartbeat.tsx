import { useState, type PointerEvent } from 'react'
import type { UptimeBucket } from '@/lib/uptime-buckets'
import type { UptimeRange } from '@/lib/uptime-ranges'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { defaultLocale, formatDateTime, getMessages, type Locale, type Messages } from '@/i18n'
import { useLocalization } from './localization'

const HOUR_MS = 60 * 60 * 1_000

function startOfWeek(date: Date, locale: Locale): number {
  const localeWithWeekInfo: Intl.Locale & { getWeekInfo?: () => { firstDay: number } } = new Intl.Locale(locale)
  const weekInfo = localeWithWeekInfo.getWeekInfo?.()
  if (!weekInfo) return Number.NaN
  const firstDay = weekInfo.firstDay
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() - (firstDay % 7) + 7) % 7)).getTime()
}

function formatResponseTime(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'millisecond', unitDisplay: 'narrow', maximumFractionDigits: 2 }).format(value)
}

export type UptimeBucketStatus = UptimeBucket['status']

export function uptimePercent(buckets: UptimeBucket[]): number | undefined {
  const successes = buckets.reduce((total, bucket) => total + bucket.successes, 0)
  const failures = buckets.reduce((total, bucket) => total + bucket.failures, 0)
  return successes + failures > 0 ? (successes / (successes + failures)) * 100 : undefined
}

export function uptimeBucketsForRange(buckets: Record<UptimeRange, UptimeBucket[]>, range: UptimeRange): UptimeBucket[] {
  return buckets[range]
}

export function formatUptimeBucketTime(timestamp: number, locale: Locale = defaultLocale, messages: Messages = getMessages(locale)): string {
  const date = new Date(timestamp)
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const yesterday = startOfDay - 24 * HOUR_MS
  const weekStart = startOfWeek(today, locale)
  const day = formatDateTime(timestamp, { weekday: 'long' }, locale)
  const calendarDate = formatDateTime(
    timestamp,
    {
      month: 'short',
      day: 'numeric'
    },
    locale
  )
  const relativeDay = timestamp >= startOfDay ? messages.time.today : timestamp >= yesterday ? messages.time.yesterday : timestamp >= weekStart ? day : calendarDate
  const time = formatDateTime(
    date,
    {
      hour: '2-digit',
      minute: '2-digit'
    },
    locale
  )
  return messages.time.dateTime(relativeDay, time)
}

function bucketLabel(bucket: UptimeBucket, locale: Locale, messages: Messages): string {
  const counts =
    bucket.status === 'unknown'
      ? messages.uptime.noChecks
      : new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
          [
            bucket.successes > 0 ? messages.uptime.successfulChecks(bucket.successes, new Intl.NumberFormat(locale).format(bucket.successes)) : '',
            bucket.failures > 0 ? messages.uptime.failedChecks(bucket.failures, new Intl.NumberFormat(locale).format(bucket.failures)) : ''
          ].filter(Boolean)
        )
  const responseTime = bucket.slowestResponseTimeMs === undefined ? undefined : messages.uptime.slowestResponse(formatResponseTime(bucket.slowestResponseTimeMs, locale))
  return messages.uptime.bucketSummary(formatUptimeBucketTime(bucket.start, locale, messages), counts, responseTime)
}

const statusClass: Record<UptimeBucketStatus, string> = {
  up: 'bg-success',
  down: 'bg-destructive',
  mixed: 'bg-warning',
  unknown: 'bg-muted-foreground/30'
}

export function uptimeBucketStatusLabel(status: UptimeBucketStatus, messages: Messages = getMessages()): string {
  if (status === 'up') return messages.uptime.up
  if (status === 'down') return messages.uptime.down
  if (status === 'mixed') return messages.uptime.partial
  return messages.uptime.noData
}

const statusTextClass: Record<UptimeBucketStatus, string> = {
  up: 'text-success',
  down: 'text-destructive',
  mixed: 'text-warning',
  unknown: 'text-muted-foreground'
}

function UptimeBucketTooltip({ bucket }: { bucket: UptimeBucket }) {
  const { locale, messages } = useLocalization()
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4 leading-none">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatUptimeBucketTime(bucket.start, locale, messages)}
        </span>
        <span className={cn('font-medium', statusTextClass[bucket.status])}>{uptimeBucketStatusLabel(bucket.status, messages)}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border/60 pt-2 leading-none tabular-nums">
        <span className="text-muted-foreground">{messages.uptime.successful}</span>
        <span className="text-end font-medium">{new Intl.NumberFormat(locale).format(bucket.successes)}</span>
        <span className="text-muted-foreground">{messages.uptime.failed}</span>
        <span className="text-end font-medium">{new Intl.NumberFormat(locale).format(bucket.failures)}</span>
        {bucket.slowestResponseTimeMs !== undefined && (
          <>
            <span className="text-muted-foreground">{messages.uptime.slowest}</span>
            <span className="text-end font-medium">{formatResponseTime(bucket.slowestResponseTimeMs, locale)}</span>
          </>
        )}
      </div>
    </div>
  )
}

function UptimeCell({
  bucket,
  onHover,
  selectedBucketStart,
  onTouchSelect,
  onBlur,
  onMouseEnter,
  showTooltips,
  collisionBoundary
}: {
  bucket: UptimeBucket
  onHover?: (bucket: UptimeBucket) => void
  selectedBucketStart: number | null | undefined
  onTouchSelect: (bucketStart: number) => void
  onBlur: () => void
  onMouseEnter: () => void
  showTooltips: boolean
  collisionBoundary?: Element | null
}) {
  const { locale, messages } = useLocalization()
  const className = cn('dashmark-uptime-heartbeat-cell min-w-0 rounded-sm', statusClass[bucket.status])
  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== 'touch') return
    event.preventDefault()
    event.currentTarget.focus()
    onTouchSelect(bucket.start)
  }

  const open = selectedBucketStart === undefined ? undefined : selectedBucketStart === bucket.start
  if (showTooltips)
    return (
      <Tooltip open={open}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(className, 'cursor-help focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}
            aria-label={bucketLabel(bucket, locale, messages)}
            onPointerDown={handlePointerDown}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') onMouseEnter()
            }}
            onFocus={onMouseEnter}
            onBlur={onBlur}
          />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8} collisionBoundary={collisionBoundary} collisionPadding={8} className="w-48 p-3 text-xs">
          <UptimeBucketTooltip bucket={bucket} />
        </TooltipContent>
      </Tooltip>
    )
  return <span className={className} aria-label={bucketLabel(bucket, locale, messages)} onPointerEnter={() => onHover?.(bucket)} />
}

export function UptimeHeartbeat({
  buckets,
  className,
  onBucketHover,
  showTooltips = false,
  collisionBoundary
}: {
  buckets: UptimeBucket[]
  className?: string
  onBucketHover?: (bucket: UptimeBucket | undefined) => void
  showTooltips?: boolean
  collisionBoundary?: Element | null
}) {
  const { messages } = useLocalization()
  const [selectedBucketStart, setSelectedBucketStart] = useState<number | null | undefined>(undefined)
  function toggleTouchTooltip(bucketStart: number) {
    setSelectedBucketStart((current) => (current === bucketStart ? null : bucketStart))
  }

  const cells = (
    <div className={cn('dashmark-uptime-heartbeat grid grid-flow-col auto-cols-fr gap-0.5', className)} aria-label={messages.uptime.history} onPointerLeave={() => onBucketHover?.(undefined)}>
      {buckets.map((bucket) => (
        <UptimeCell
          key={bucket.start}
          bucket={bucket}
          onHover={onBucketHover}
          selectedBucketStart={selectedBucketStart}
          onTouchSelect={toggleTouchTooltip}
          onBlur={() => setSelectedBucketStart(null)}
          onMouseEnter={() => setSelectedBucketStart(undefined)}
          showTooltips={showTooltips}
          collisionBoundary={collisionBoundary}
        />
      ))}
    </div>
  )
  return showTooltips ? <TooltipProvider delayDuration={0}>{cells}</TooltipProvider> : cells
}
