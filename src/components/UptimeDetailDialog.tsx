import { useEffect, useState } from 'react'
import { Gauge, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { UptimeMetric } from '@/lib/status'
import { UptimeHeartbeat, uptimeBuckets, uptimePercent } from './UptimeHeartbeat'

const ranges = [
  { label: '24h', durationMs: 24 * 60 * 60 * 1_000, bucketCount: 24 },
  { label: '7d', durationMs: 7 * 24 * 60 * 60 * 1_000, bucketCount: 21 },
  { label: '30d', durationMs: 30 * 24 * 60 * 60 * 1_000, bucketCount: 30 }
]

function formatPercent(value: number | undefined): string {
  return value === undefined ? 'No data' : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
}

export function UptimeDetailDialog({ metric, onOpenChange }: { metric: UptimeMetric | null; onOpenChange: (open: boolean) => void }) {
  const [rangeIndex, setRangeIndex] = useState(2)
  const [dialogContent, setDialogContent] = useState<HTMLDivElement | null>(null)
  const [displayedMetric, setDisplayedMetric] = useState(metric)
  useEffect(() => {
    if (metric) setDisplayedMetric(metric)
  }, [metric])
  const currentMetric = metric ?? displayedMetric
  const range = ranges[rangeIndex]!
  const percent = uptimePercent(uptimeBuckets(currentMetric?.observations ?? [], range.durationMs, range.bucketCount))
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
                  value={range.label}
                  onValueChange={(value) => {
                    const index = ranges.findIndex((candidate) => candidate.label === value)
                    if (index >= 0) setRangeIndex(index)
                  }}
                  spacing={0}
                  className="rounded-md bg-muted p-0.5"
                  aria-label="Uptime period"
                >
                  {ranges.map((candidate) => (
                    <ToggleGroupItem key={candidate.label} value={candidate.label} className="h-6 min-w-0 cursor-pointer px-2 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">
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
                  <span className="sr-only">Close</span>
                </button>
              </div>
              <DialogDescription className="sr-only">Uptime history</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 pt-2">
              <div>
                <p className="text-3xl font-[550] tabular-nums">{formatPercent(percent)}</p>
                <p className="text-xs text-muted-foreground">availability for the selected period</p>
              </div>
              <UptimeHeartbeat
                observations={currentMetric.observations}
                durationMs={range.durationMs}
                bucketCount={range.bucketCount}
                className="h-20 gap-1"
                showTooltips
                collisionBoundary={dialogContent}
              />
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-sm bg-success" />
                  Up
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-sm bg-destructive" />
                  Down
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-sm bg-warning" />
                  Partial
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-sm bg-muted-foreground/30" />
                  No data
                </span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
