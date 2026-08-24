import type { APIRoute } from 'astro'
import { getConfig } from '@/lib/config'
import { addResourceUsageVaryHeader, getContainerMetricUsage } from '@/lib/docker'
import { getLatestMetricUsage, getMetricHistory, getResourceMetricHistory, startMetricsCollection } from '@/lib/metrics'
import type { CustomMetric, ResourceUsageResponse } from '@/lib/status'

export async function getResourceUsageResponse(request: Request): Promise<Response> {
  const config = getConfig()
  startMetricsCollection(config)
  const cardId = new URL(request.url).searchParams.get('id')
  // Authorize the card without triggering a second Docker/custom-source collection.
  const access = cardId ? await getContainerMetricUsage(config, request.headers, cardId, false) : undefined
  const usage = cardId && access ? getLatestMetricUsage(cardId) : undefined
  const metricUsage = cardId && usage ? { cardId, ...usage } : undefined
  const historyPeriodMs = access?.historyPeriodMs ?? config.metricsHistoryPeriodMs
  const customMetrics: CustomMetric[] = metricUsage?.customMetrics.map(metric => 'unit' in metric
    ? {
        ...metric,
        history: getMetricHistory(config, metricUsage.cardId, metric.key, historyPeriodMs),
        historyPeriodMs
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
    history: cardId && access ? getResourceMetricHistory(config, cardId, historyPeriodMs) : [],
    historyPeriodMs,
    pending: access !== undefined && usage === undefined,
    customMetrics,
    metricErrors: usage?.metricErrors ?? access?.metricErrors ?? []
  }
  return new Response(JSON.stringify(body), { status: 200, headers })
}

export const GET: APIRoute = ({ request }) => getResourceUsageResponse(request)
