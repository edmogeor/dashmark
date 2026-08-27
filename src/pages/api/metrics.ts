import type { APIRoute } from 'astro'
import { getConfig } from '@/lib/config'
import { sharedCacheControl } from '@/lib/cache'
import { addResourceUsageVaryHeader, canViewMetric, getContainerMetricUsage } from '@/lib/docker'
import { getLatestMetricUsage, getMetricHistory, getResourceMetricHistory, startMetricsCollection } from '@/lib/metrics'
import type { ContainerResources, CustomMetric, MetricsResponse, ResourceMetricSample } from '@/lib/status'
import { demoUptimeMetrics } from '@/demo/uptime'

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

export async function getMetricsResponse(request: Request): Promise<Response> {
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
    'Cache-Control': sharedCacheControl(access?.metricsPollIntervalMs ?? config.metricsPollIntervalMs)
  })
  addResourceUsageVaryHeader(headers, config)

  const body: MetricsResponse = {
    resource: usage?.resource ? visibleResource(usage.resource, visible) : null,
    history: cardId && access ? getResourceMetricHistory(config, cardId, historyPeriodMs).map(sample => visibleResource<ResourceMetricSample>(sample, visible)) : [],
    historyPeriodMs,
    pending: access !== undefined && usage === undefined,
    customMetrics,
    uptimeMetrics: process.env.MOCK_AUTH === 'true'
      ? demoUptimeMetrics(cardId ?? '', Date.now())
      : (metricUsage?.uptimeMetrics ?? []).filter(metric => visible(metric.key)),
    metricErrors: (usage?.metricErrors ?? access?.metricErrors ?? []).filter(error => visible(error.key))
  }
  return new Response(JSON.stringify(body), { status: 200, headers })
}

export const GET: APIRoute = ({ request }) => getMetricsResponse(request)
