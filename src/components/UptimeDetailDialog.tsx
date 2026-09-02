import { useEffect, useState } from 'react'
import { Gauge, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { UptimeMetricSummary } from '@/lib/realtime-client'
import { UptimeHeartbeat, uptimeBucketsForRange, uptimePercent } from './UptimeHeartbeat'
import { useLocalization } from './localization'

export function UptimeDetailDialog({ metric, onOpenChange }: { metric: UptimeMetricSummary | null; onOpenChange: (open: boolean) => void }) {
  const { locale, messages } = useLocalization()
  const ranges = [
    { key: '24h', label: messages.time.ranges.day, durationMs: 24 * 60 * 60 * 1_000 },
    { key: '7d', label: messages.time.ranges.week, durationMs: 7 * 24 * 60 * 60 * 1_000 },
    { key: '30d', label: messages.time.ranges.month, durationMs: 30 * 24 * 60 * 60 * 1_000 }
  ] as const
  const formatPercent = (value: number | undefined): string =>
    value === undefined ? messages.uptime.noData : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(value / 100)
  const [rangeIndex, setRangeIndex] = useState(2)
  const [dialogContent, setDialogContent] = useState<HTMLDivElement | null>(null)
  const [displayedMetric, setDisplayedMetric] = useState(metric)
  useEffect(() => {
    if (metric) setDisplayedMetric(metric)
  }, [metric])
  const currentMetric = metric ?? displayedMetric
  const range = ranges[rangeIndex]!
  const buckets = currentMetric ? uptimeBucketsForRange(currentMetric.buckets, range.key) : []
  const percent = uptimePercent(buckets)
  return (
    <Dialog open={metric !== null} onOpenChange={onOpenChange}>
      <DialogContent
        ref={setDialogContent}
        showCloseButton={false}
        className="dashmark-metric-dialog"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.currentTarget.dataset.state === 'closed') setDisplayedMetric(null)
        }}
      >
        {currentMetric && (
          <>
            <DialogHeader className="dashmark-metric-dialog-header !flex-row !items-center !justify-between !space-y-0">
              <DialogTitle className="flex items-center gap-2 text-sm font-medium tracking-[0.18em] text-muted-foreground uppercase">
                <Gauge className="h-4 w-4 shrink-0" aria-hidden="true" />
                {currentMetric.label}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={range.key}
                  onValueChange={(value) => {
                    const index = ranges.findIndex((candidate) => candidate.key === value)
                    if (index >= 0) setRangeIndex(index)
                  }}
                  spacing={0}
                  className="rounded-md bg-muted p-0.5"
                  aria-label={messages.uptime.period}
                >
                  {ranges.map((candidate) => (
                    <ToggleGroupItem key={candidate.key} value={candidate.key} className="h-6 min-w-0 cursor-pointer px-2 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">
                      {candidate.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <button
                  type="button"
                  className="cursor-pointer rounded-sm p-1 opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">{messages.common.close}</span>
                </button>
              </div>
              <DialogDescription className="sr-only">{messages.uptime.history}</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 pt-2">
              <div>
                <p className="text-3xl font-[550] tabular-nums">{formatPercent(percent)}</p>
                <p className="text-xs text-muted-foreground">{messages.uptime.availability}</p>
              </div>
              <UptimeHeartbeat buckets={buckets} className="h-20 gap-1" showTooltips collisionBoundary={dialogContent} />
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-sm bg-success" />
                  {messages.uptime.up}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-sm bg-destructive" />
                  {messages.uptime.down}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-sm bg-warning" />
                  {messages.uptime.partial}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-sm bg-muted-foreground/30" />
                  {messages.uptime.noData}
                </span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
