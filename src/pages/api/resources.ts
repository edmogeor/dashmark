import type { APIRoute } from 'astro'
import { getConfig } from '@/lib/config'
import { addResourceUsageVaryHeader, canViewMetric, getContainerMetricUsage } from '@/lib/docker'
import { getLatestMetricUsage, getMetricHistory, getResourceMetricHistory, startMetricsCollection } from '@/lib/metrics'
import type { ContainerResources, CustomMetric, ResourceMetricSample, ResourceUsageResponse } from '@/lib/status'

function visibleResource<T extends ContainerResources>(resource: T, visible: (metric: string) => boolean): T {
  return {
    ...resource,
    cpuPercent: visible('cpu') ? resource.cpuPercent : undefined,
    memoryUsage: visible('memory') ? resource.memoryUsage : undefined,
    memoryLimit: visible('memory') ? resource.memoryLimit : undefined,
    receivedBytesPerSecond: visible('network') ? resource.receivedBytesPerSecond : undefined,
    sentBytesPerSecond: visible('network') ? resource.sentBytesPerSecond : undefined,
    networkRatePending: visible('network') ? resource.networkRatePending : undefined
  }
}

export async function getResourceUsageResponse(request: Request): Promise<Response> {
  const config = getConfig()
  startMetricsCollection(config)
  const cardId = new URL(request.url).searchParams.get('id')
  // Authorize the card without triggering a second Docker/custom-source collection.
  const access = cardId ? await getContainerMetricUsage(config, request.headers, cardId, false) : undefined
  const usage = cardId && access ? getLatestMetricUsage(cardId) : undefined
  const visible = (metric: string) => canViewMetric(config, request.headers, access?.metricsAccess, metric)
  const metricUsage = cardId && usage ? { cardId, ...usage } : undefined
  const historyPeriodMs = access?.historyPeriodMs ?? config.metricsHistoryPeriodMs
  const customMetrics: CustomMetric[] = metricUsage?.customMetrics.filter(metric => visible(metric.key)).map(metric => 'unit' in metric
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
    resource: usage?.resource ? visibleResource(usage.resource, visible) : null,
    history: cardId && access ? getResourceMetricHistory(config, cardId, historyPeriodMs).map(sample => visibleResource<ResourceMetricSample>(sample, visible)) : [],
    historyPeriodMs,
    pending: access !== undefined && usage === undefined,
    customMetrics,
    metricErrors: (usage?.metricErrors ?? access?.metricErrors ?? []).filter(error => visible(error.key))
  }
  return new Response(JSON.stringify(body), { status: 200, headers })
}

export const GET: APIRoute = ({ request }) => getResourceUsageResponse(request)
