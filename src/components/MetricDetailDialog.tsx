import { memo, useEffect, useId, useMemo, useState } from 'react'
import { Gauge, X } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { chartDomain, endLabelOffset } from '@/lib/chart-layout'
import { downsampleChartData, metricData, tickerConfig, type ChartPoint, type MetricDetail, type MetricSeries } from './app-card-metrics'

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit'
})
const exactTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit'
})

function formatTimestamp(timestamp: unknown, formatter = timestampFormatter): string {
  const value = Number(timestamp)
  return Number.isFinite(value) ? formatter.format(value) : ''
}

function chartData(detail: MetricDetail): ChartPoint[] {
  const data = downsampleChartData(metricData(detail.history, detail.series), detail.series)
  return data.map((point, index, points) => {
    const labels = { ...point }
    for (const series of detail.series) {
      const value = point[series.key]
      if (index === points.length - 1 && typeof value === 'number') labels[`${series.key}Label`] = detail.formatValue(value)
    }
    return labels
  })
}

function MetricTooltip({ detail }: { detail: MetricDetail }) {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(hover: none)')
    const updateIsTouch = () => setIsTouch(mediaQuery.matches)
    updateIsTouch()
    mediaQuery.addEventListener('change', updateIsTouch)
    return () => mediaQuery.removeEventListener('change', updateIsTouch)
  }, [])

  return (
    <ChartTooltip
      cursor={false}
      trigger={isTouch ? 'click' : 'hover'}
      content={({ active, label, payload }) => {
        const values =
          payload?.flatMap((item) => {
            const series = detail.series.find((candidate) => candidate.key === item.dataKey)
            const value = Number(item.value)
            return series && Number.isFinite(value) ? [[series, value] as const] : []
          }) ?? []
        if (!active || values.length === 0) return null
        return (
          <div className="dashmark-metric-chart-tooltip grid gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
            <span className="dashmark-metric-chart-tooltip-time text-muted-foreground">{formatTimestamp(label, exactTimestampFormatter)}</span>
            {values.map(([series, value]) => (
              <div key={series.key} className="dashmark-metric-chart-tooltip-value flex items-center justify-between gap-4 font-mono font-medium tabular-nums" data-series-key={series.key}>
                {detail.series.length > 1 && <span className="dashmark-metric-chart-tooltip-label text-muted-foreground">{series.label}</span>}
                <span className="dashmark-metric-chart-tooltip-number">{(detail.formatTooltipValue ?? detail.formatValue)(value)}</span>
              </div>
            ))}
          </div>
        )
      }}
    />
  )
}

function EndLabel({ series, labels, domain }: { series: MetricSeries; labels: { key: string; value: number }[]; domain: [number, number] }) {
  return (
    <LabelList
      dataKey={`${series.key}Label`}
      position="insideRight"
      content={(props) => {
        const x = Number(props.x)
        const y = Number(props.y)
        const label = props.value === undefined ? '' : String(props.value)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !label) return null
        const width = label.length * 9 + 16
        const offset = endLabelOffset(series.key, y, labels, domain, props.viewBox as { y?: number; height?: number } | undefined)
        return (
          <g className="dashmark-metric-chart-end-label" transform={`translate(${x - width - 4} ${y - 12 + offset})`}>
            <rect width={width} height={24} rx={8} fill="var(--background)" />
            <text x={8} y={16} fill={series.color} fontSize={16} fontWeight={700}>
              {label}
            </text>
          </g>
        )
      }}
    />
  )
}

function MetricSeriesLine({
  series,
  index,
  chart,
  gradientId,
  labels,
  domain
}: {
  series: MetricSeries
  index: number
  chart: 'area' | 'line' | 'step'
  gradientId: string
  labels: { key: string; value: number }[]
  domain: [number, number]
}) {
  const props = {
    dataKey: series.key,
    type: chart === 'step' ? 'stepAfter' : 'linear',
    stroke: series.color,
    strokeWidth: 2,
    dot: false,
    activeDot: {
      r: 4,
      fill: series.color,
      stroke: series.color,
      strokeWidth: 2
    },
    isAnimationActive: false
  } as const
  const label = <EndLabel series={series} labels={labels} domain={domain} />
  return chart === 'area' ? (
    <Area className="dashmark-metric-chart-series" {...props} fill={`url(#${gradientId}-${index})`}>
      {label}
    </Area>
  ) : (
    <Line className="dashmark-metric-chart-series" {...props}>
      {label}
    </Line>
  )
}

function MetricChart({ detail }: { detail: MetricDetail }) {
  const gradientId = useId().replace(/:/g, '')
  const data = useMemo(() => chartData(detail), [detail])
  const values = data.flatMap((point) => detail.series.flatMap((series) => (typeof point[series.key] === 'number' ? [point[series.key] as number] : [])))
  const domain = chartDomain(values)
  const endLabels = detail.series.flatMap((series) => (typeof data.at(-1)?.[series.key] === 'number' ? [{ key: series.key, value: data.at(-1)![series.key] as number }] : []))
  const end = data.at(-1)?.timestamp ?? Date.now()
  const start = end - detail.historyPeriodMs
  const chart = detail.chart ?? 'step'
  const Chart = chart === 'area' ? AreaChart : LineChart
  const axisFormatter = (value: unknown) => (Number.isFinite(Number(value)) ? (detail.formatAxisValue ?? detail.formatValue)(Number(value)) : '')
  return (
    <div className="dashmark-metric-dialog-body flex h-80 w-full flex-col">
      <div className="min-h-0 flex-1">
        <ChartContainer config={tickerConfig} className="dashmark-metric-chart h-full w-full aspect-auto" aria-label={`${detail.label} chart`}>
          <Chart className="dashmark-metric-chart-svg" data={data} margin={{ top: 12, right: 4, bottom: 4, left: 0 }} accessibilityLayer={false} throttleDelay={50}>
            {chart === 'area' && (
              <defs>
                {detail.series.map((series, index) => (
                  <linearGradient key={series.key} id={`${gradientId}-${index}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={series.color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={series.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
            )}
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={[start, end]}
              allowDataOverflow
              className="dashmark-metric-chart-x-axis"
              tickFormatter={(value) => formatTimestamp(value)}
              tickLine={false}
              axisLine={false}
              ticks={Array.from({ length: 4 }, (_, index) => start + ((end - start) * index) / 3)}
            />
            <YAxis tickFormatter={axisFormatter} tickLine={false} axisLine={false} width={72} className="dashmark-metric-chart-y-axis" tick={{ fontSize: 10 }} domain={domain} />
            <MetricTooltip detail={detail} />
            {detail.series.map((series, index) => (
              <MetricSeriesLine key={series.key} series={series} index={index} chart={chart} gradientId={gradientId} labels={endLabels} domain={domain} />
            ))}
          </Chart>
        </ChartContainer>
      </div>
      {detail.series.length > 1 && (
        <div className="dashmark-metric-chart-legend flex shrink-0 justify-center gap-4 pt-2 text-xs leading-none font-medium text-muted-foreground normal-case">
          {detail.series.map((series) => (
            <span key={series.key} className="dashmark-metric-chart-legend-item flex items-center gap-1.5" data-series-key={series.key}>
              <span className="dashmark-metric-chart-legend-swatch h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: series.color }} />
              {series.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export const MetricDetailDialog = memo(function MetricDetailDialog({ detail, onOpen, onOpenChange }: { detail: MetricDetail | null; onOpen: () => void; onOpenChange: (open: boolean) => void }) {
  const [displayedDetail, setDisplayedDetail] = useState(detail)
  useEffect(() => {
    if (detail) setDisplayedDetail(detail)
  }, [detail])
  const currentDetail = detail ?? displayedDetail
  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="dashmark-metric-dialog"
        onOpenAutoFocus={onOpen}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.currentTarget.dataset.state === 'closed') setDisplayedDetail(null)
        }}
      >
        {currentDetail && (
          <>
            <DialogHeader className="dashmark-metric-dialog-header !flex-row !items-center !justify-between !space-y-0">
              <DialogTitle className="dashmark-metric-dialog-title flex h-4 items-center gap-2 text-sm leading-none font-medium tracking-[0.18em] text-muted-foreground uppercase">
                <Gauge className="h-4 w-4 shrink-0" aria-hidden="true" />
                {currentDetail.label}
              </DialogTitle>
              <button
                type="button"
                className="dashmark-metric-dialog-close cursor-pointer rounded-sm p-1 opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
              <DialogDescription className="sr-only">Live {currentDetail.label.toLowerCase()} details</DialogDescription>
            </DialogHeader>
            <MetricChart detail={currentDetail} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
})
