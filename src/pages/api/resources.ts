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
  const metricUsage = cardId && usage ? { cardId, ...usage } : undefined
  if (metricUsage?.resource) {
    saveResourceMetric(config, metricUsage.cardId, metricUsage.resource, metricUsage.historyPeriodMs)
  }
  if (metricUsage) {
    for (const metric of metricUsage.customMetrics) {
      if (typeof metric.value === 'number') {
        saveMetricSample(config, metricUsage.cardId, metric.key, metric.value, metricUsage.historyPeriodMs)
      }
    }
  }
  const customMetrics: CustomMetric[] = metricUsage?.customMetrics.map(metric => 'unit' in metric
    ? {
        ...metric,
        history: getMetricHistory(config, metricUsage.cardId, metric.key, metricUsage.historyPeriodMs),
        historyPeriodMs: metricUsage.historyPeriodMs
      }
    : metric
  ) ?? []
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store'
  })
  addResourceUsageVaryHeader(headers, config)

  const body: ResourceUsageResponse = {
    resource: usage?.resource ?? null,
    history: metricUsage ? getResourceMetricHistory(config, metricUsage.cardId, metricUsage.historyPeriodMs) : [],
    historyPeriodMs: usage?.historyPeriodMs ?? config.metricsHistoryPeriodMs,
    customMetrics,
    metricErrors: usage?.metricErrors ?? []
  }
  return new Response(JSON.stringify(body), { status: 200, headers })
}

export const GET: APIRoute = ({ request }) => getResourceUsageResponse(request)
