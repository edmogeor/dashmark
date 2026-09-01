import { useEffect, useState } from 'react'
import type { ContainerResources, CustomMetric, ResourceMetricSample } from '@/lib/status'
import type { UptimeMetricSummary } from '@/lib/realtime-client'
import { useRealtimeMetrics } from './use-realtime'

type MetricUsage = {
  resources: ContainerResources | null
  history: ResourceMetricSample[]
  historyPeriodMs: number
  customMetrics: CustomMetric[]
  metricErrors: { key: string; message: string }[]
  uptimeMetrics: UptimeMetricSummary[]
  loading: boolean
}

export function useMetrics(cardId: string, enabled: boolean, active: boolean, initialResources?: ContainerResources): MetricUsage {
  const [resources, setResources] = useState<ContainerResources | null>(initialResources ?? null)
  const [history, setHistory] = useState<ResourceMetricSample[]>([])
  const [historyPeriodMs, setHistoryPeriodMs] = useState(5 * 60_000)
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([])
  const [metricErrors, setMetricErrors] = useState<{ key: string; message: string }[]>([])
  const [uptimeMetrics, setUptimeMetrics] = useState<UptimeMetricSummary[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!initialResources) return
    setResources(initialResources)
    setHistory([])
    setCustomMetrics([])
    setMetricErrors([])
    setUptimeMetrics([])
    setLoading(false)
  }, [initialResources])
  useEffect(() => {
    if (!enabled || !active) return
    setResources(null)
    setHistory([])
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
