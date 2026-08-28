import { useCallback, useEffect, useState } from 'react'
import { isMetricsResponse, type ContainerResources, type CustomMetric, type ResourceMetricSample, type UptimeMetric } from '@/lib/status'
import { DEFAULT_METRICS_POLL_INTERVAL_MS } from '@/lib/constants'
import { demoResourceUsage } from '@/demo/resources'
import { demoUptimeMetrics } from '@/demo/uptime'

const PENDING_METRICS_RETRY_MS = 1_000

type MetricUsage = {
  resources: ContainerResources | null
  history: ResourceMetricSample[]
  historyPeriodMs: number
  customMetrics: CustomMetric[]
  metricErrors: { key: string; message: string }[]
  uptimeMetrics: UptimeMetric[]
  loading: boolean
}

function useDemoMetrics(cardId: string, active: boolean, update: (sample: ResourceMetricSample) => void, pollIntervalMs: number) {
  useEffect(() => {
    if (!active) return
    const refresh = () => update(demoResourceUsage(cardId, Date.now()))
    refresh()
    const timer = setInterval(refresh, pollIntervalMs)
    return () => clearInterval(timer)
  }, [active, cardId, pollIntervalMs, update])
}

export function useMetrics(cardId: string, enabled: boolean, active: boolean, initialResources?: ContainerResources, pollIntervalMs = DEFAULT_METRICS_POLL_INTERVAL_MS, isDemo = false): MetricUsage {
  const [resources, setResources] = useState<ContainerResources | null>(initialResources ?? null)
  const [history, setHistory] = useState<ResourceMetricSample[]>([])
  const [historyPeriodMs, setHistoryPeriodMs] = useState(5 * 60_000)
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([])
  const [metricErrors, setMetricErrors] = useState<{ key: string; message: string }[]>([])
  const [uptimeMetrics, setUptimeMetrics] = useState<UptimeMetric[]>([])
  const [loading, setLoading] = useState(false)
  const updateDemo = useCallback(
    (sample: ResourceMetricSample) => {
      setResources(sample)
      setHistory((previous) =>
        previous.length > 0 ? [...previous.slice(-89), sample] : Array.from({ length: 30 }, (_, index) => demoResourceUsage(cardId, sample.timestamp - (29 - index) * pollIntervalMs))
      )
      setLoading(false)
      setUptimeMetrics(demoUptimeMetrics(cardId, sample.timestamp))
    },
    [cardId]
  )

  useEffect(() => {
    if (!initialResources || isDemo) return
    setResources(initialResources)
    setHistory([])
    setCustomMetrics([])
    setMetricErrors([])
    setUptimeMetrics([])
    setLoading(false)
  }, [initialResources, isDemo])
  useDemoMetrics(cardId, enabled && active && isDemo, updateDemo, pollIntervalMs)
  useEffect(() => {
    if (initialResources || !enabled || !active || isDemo) return
    setResources(null)
    setHistory([])
    setCustomMetrics([])
    setMetricErrors([])
    setUptimeMetrics([])
    setLoading(true)
    let stopped = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let pending = false
    const poll = async () => {
      controller = new AbortController()
      try {
        const response = await fetch(`/api/metrics?id=${encodeURIComponent(cardId)}`, { signal: controller.signal })
        const data: unknown = await response.json()
        if (!stopped && response.ok && isMetricsResponse(data)) {
          pending = data.pending === true
          setResources(data.resource)
          setHistory(data.history ?? [])
          setCustomMetrics(data.customMetrics)
          setUptimeMetrics(data.uptimeMetrics ?? [])
          setMetricErrors(data.metricErrors)
          if (data.historyPeriodMs) setHistoryPeriodMs(data.historyPeriodMs)
        }
      } catch {
        if (!stopped) {
          pending = false
          setResources(null)
          setHistory([])
          setCustomMetrics([])
          setUptimeMetrics([])
          setMetricErrors([])
        }
      } finally {
        controller = undefined
        if (!stopped) {
          setLoading(pending)
          timeout = setTimeout(poll, pending ? PENDING_METRICS_RETRY_MS : pollIntervalMs)
        }
      }
    }
    poll()
    return () => {
      stopped = true
      controller?.abort()
      if (timeout) clearTimeout(timeout)
    }
  }, [active, cardId, enabled, initialResources, isDemo, pollIntervalMs])
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
