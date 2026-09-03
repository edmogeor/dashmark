import { useEffect, useLayoutEffect, useState } from 'react'
import { METRICS_HISTORY_PERIOD_MS } from '@/lib/constants'
import type { ContainerResources, CustomMetric, MetricError, ResourceMetricSample } from '@/lib/status'
import type { UptimeMetricSummary } from '@/lib/realtime-client'
import { useRealtimeMetrics } from './use-realtime'
import { demoMetricsSnapshot } from '@/demo/metrics'

type MetricUsage = {
  resources: ContainerResources | null
  history: ResourceMetricSample[]
  historyPeriodMs: number
  customMetrics: CustomMetric[]
  metricErrors: MetricError[]
  uptimeMetrics: UptimeMetricSummary[]
  loading: boolean
}

export function useMetrics(cardId: string, enabled: boolean, active: boolean, initialResources?: ContainerResources, demo = false): MetricUsage {
  const [resources, setResources] = useState<ContainerResources | null>(initialResources ?? null)
  const [history, setHistory] = useState<ResourceMetricSample[]>([])
  const [historyPeriodMs, setHistoryPeriodMs] = useState(METRICS_HISTORY_PERIOD_MS)
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([])
  const [metricErrors, setMetricErrors] = useState<MetricError[]>([])
  const [uptimeMetrics, setUptimeMetrics] = useState<UptimeMetricSummary[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!initialResources || demo) return
    setResources(initialResources)
    setHistory([])
    setHistoryPeriodMs(METRICS_HISTORY_PERIOD_MS)
    setCustomMetrics([])
    setMetricErrors([])
    setUptimeMetrics([])
    setLoading(false)
  }, [demo, initialResources])
  useEffect(() => {
    if (!demo || !initialResources || !active) return
    const update = () => {
      const metrics = demoMetricsSnapshot(cardId, initialResources)
      setResources(metrics.resource)
      setHistory(metrics.history)
    }
    update()
    const timer = setInterval(update, 10_000)
    return () => clearInterval(timer)
  }, [active, cardId, demo, initialResources])
  useLayoutEffect(() => {
    if (!enabled || !active) return
    setResources(null)
    setHistory([])
    setHistoryPeriodMs(METRICS_HISTORY_PERIOD_MS)
    setCustomMetrics([])
    setMetricErrors([])
    setUptimeMetrics([])
    setLoading(true)
  }, [active, enabled])
  useRealtimeMetrics(
    cardId,
    enabled && active,
    (metrics) => {
      setResources(metrics.resource)
      setHistory(metrics.history ?? [])
      setCustomMetrics(metrics.customMetrics)
      setUptimeMetrics(metrics.uptimeMetrics ?? [])
      setMetricErrors(metrics.metricErrors)
      if (metrics.historyPeriodMs) setHistoryPeriodMs(metrics.historyPeriodMs)
      setLoading(metrics.pending === true)
    },
    (unavailable) => {
      if (!unavailable) return setLoading(true)
      setResources(null)
      setHistory([])
      setHistoryPeriodMs(METRICS_HISTORY_PERIOD_MS)
      setCustomMetrics([])
      setMetricErrors([])
      setUptimeMetrics([])
      setLoading(false)
    }
  )
  return {
    resources,
    history,
    historyPeriodMs,
    customMetrics,
    metricErrors,
    uptimeMetrics,
    loading
  }
}
