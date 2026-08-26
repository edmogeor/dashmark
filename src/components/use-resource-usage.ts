import { useCallback, useEffect, useState } from 'react'
import {
  isResourceUsageResponse,
  type ContainerResources,
  type CustomMetric,
  type ResourceMetricSample,
} from '@/lib/status'
import { RESOURCE_USAGE_POLL_INTERVAL_MS } from '@/lib/constants'

type ResourceUsage = {
  resources: ContainerResources | null
  history: ResourceMetricSample[]
  historyPeriodMs: number
  customMetrics: CustomMetric[]
  metricErrors: { key: string; message: string }[]
  loading: boolean
}

function demoResourceUsage(
  cardId: string,
  timestamp: number,
): ResourceMetricSample {
  const phase =
    [...cardId].reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    ) / 20
  const seconds = timestamp / 1_000
  return {
    timestamp,
    cpuPercent:
      18 +
      Math.sin(seconds / 7 + phase) * 12 +
      Math.sin(seconds / 2 + phase) * 3,
    memoryUsage: (850 + Math.sin(seconds / 18 + phase) * 120) * 1_024 * 1_024,
    memoryLimit: 2 * 1_024 * 1_024 * 1_024,
    receivedBytesPerSecond:
      (1_200 + Math.sin(seconds / 5 + phase) * 450) * 1_024,
    sentBytesPerSecond: (320 + Math.sin(seconds / 8 + phase) * 180) * 1_024,
  }
}

function useDemoResourceUsage(
  cardId: string,
  active: boolean,
  update: (sample: ResourceMetricSample) => void,
) {
  useEffect(() => {
    if (!active) return
    const refresh = () => update(demoResourceUsage(cardId, Date.now()))
    refresh()
    const timer = setInterval(refresh, RESOURCE_USAGE_POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [active, cardId, update])
}

export function useResourceUsage(
  cardId: string,
  enabled: boolean,
  active: boolean,
  initialResources?: ContainerResources,
  isDemo = false,
): ResourceUsage {
  const [resources, setResources] = useState<ContainerResources | null>(
    initialResources ?? null,
  )
  const [history, setHistory] = useState<ResourceMetricSample[]>([])
  const [historyPeriodMs, setHistoryPeriodMs] = useState(5 * 60_000)
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([])
  const [metricErrors, setMetricErrors] = useState<
    { key: string; message: string }[]
  >([])
  const [loading, setLoading] = useState(false)
  const updateDemo = useCallback(
    (sample: ResourceMetricSample) => {
      setResources(sample)
      setHistory((previous) =>
        previous.length > 0
          ? [...previous.slice(-89), sample]
          : Array.from({ length: 30 }, (_, index) =>
              demoResourceUsage(
                cardId,
                sample.timestamp -
                  (29 - index) * RESOURCE_USAGE_POLL_INTERVAL_MS,
              ),
            ),
      )
      setLoading(false)
    },
    [cardId],
  )

  useEffect(() => {
    if (!initialResources || isDemo) return
    setResources(initialResources)
    setHistory([])
    setCustomMetrics([])
    setMetricErrors([])
    setLoading(false)
  }, [initialResources, isDemo])
  useDemoResourceUsage(cardId, enabled && active && isDemo, updateDemo)
  useEffect(() => {
    if (initialResources || !enabled || !active || isDemo) return
    setResources(null)
    setHistory([])
    setCustomMetrics([])
    setMetricErrors([])
    setLoading(true)
    let stopped = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let pending = false
    const poll = async () => {
      controller = new AbortController()
      try {
        const response = await fetch(
          `/api/resources?id=${encodeURIComponent(cardId)}`,
          { signal: controller.signal },
        )
        const data: unknown = await response.json()
        if (!stopped && response.ok && isResourceUsageResponse(data)) {
          pending = data.pending === true
          setResources(data.resource)
          setHistory(data.history ?? [])
          setCustomMetrics(data.customMetrics)
          setMetricErrors(data.metricErrors)
          if (data.historyPeriodMs) setHistoryPeriodMs(data.historyPeriodMs)
        }
      } catch {
        if (!stopped) {
          pending = false
          setResources(null)
          setHistory([])
          setCustomMetrics([])
          setMetricErrors([])
        }
      } finally {
        controller = undefined
        if (!stopped) {
          setLoading(pending)
          timeout = setTimeout(poll, RESOURCE_USAGE_POLL_INTERVAL_MS)
        }
      }
    }
    poll()
    return () => {
      stopped = true
      controller?.abort()
      if (timeout) clearTimeout(timeout)
    }
  }, [active, cardId, enabled, initialResources, isDemo])
  return {
    resources,
    history,
    historyPeriodMs,
    customMetrics,
    metricErrors,
    loading,
  }
}
