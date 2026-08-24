import type { APIRoute } from 'astro'
import { getConfig } from '@/lib/config'
import { addResourceUsageVaryHeader, getContainerMetricUsage } from '@/lib/docker'
import { getMetricHistory, getResourceMetricHistory, saveMetricSample, saveResourceMetric, startMetricsCollection } from '@/lib/metrics'
import type { CustomMetric, ResourceUsageResponse } from '@/lib/status'

export async function getResourceUsageResponse(request: Request): Promise<Response> {
  const config = getConfig()
  startMetricsCollection(config)
  const cardId = new URL(request.url).searchParams.get('id')
  const usage = cardId ? await getContainerMetricUsage(config, request.headers, cardId) : undefined
  if (usage?.resource && cardId) saveResourceMetric(config, cardId, usage.resource, usage.historyPeriodMs)
  if (usage && cardId) {
    for (const metric of usage.customMetrics) {
      if (typeof metric.value === 'number') saveMetricSample(config, cardId, metric.key, metric.value, usage.historyPeriodMs)
    }
  }
  const customMetrics: CustomMetric[] = []
  if (usage && cardId) {
    for (const metric of usage.customMetrics) {
      if ('unit' in metric) {
        customMetrics.push({
          ...metric,
          history: getMetricHistory(config, cardId, metric.key, usage.historyPeriodMs),
          historyPeriodMs: usage.historyPeriodMs
        })
      } else customMetrics.push(metric)
    }
  }
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store'
  })
  addResourceUsageVaryHeader(headers, config)

  const body: ResourceUsageResponse = {
    resource: usage?.resource ?? null,
    history: cardId && usage ? getResourceMetricHistory(config, cardId, usage.historyPeriodMs) : [],
    historyPeriodMs: usage?.historyPeriodMs ?? config.metricsHistoryPeriodMs,
    customMetrics,
    metricErrors: usage?.metricErrors ?? []
  }
  return new Response(JSON.stringify(body), { status: 200, headers })
}

export const GET: APIRoute = ({ request }) => getResourceUsageResponse(request)
