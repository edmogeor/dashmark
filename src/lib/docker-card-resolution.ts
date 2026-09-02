import type { ServiceMetricOverrides, ServiceOverrides } from './config-file-types'
import { loadMetricCatalog } from './config-file-metrics'
import { COMPOSE_SERVICE_LABEL } from './constants'
import type { DockerContainer } from './docker-api'
import { hasDashmarkLabels, isValidUrl, parseLabels, parseResourceStats, traefikUrl, type ParsedLabels } from './labels'
import { resolveMetricSources } from './metric-source-resolution'

export type ResolvedMetricCard = {
  labels: Pick<ParsedLabels, 'resourceStats' | 'metrics' | 'metricsPollIntervalMs' | 'metricsHistoryPeriodMs' | 'metricsAccess'>
  metricDefinitions: ServiceMetricOverrides
  customMetrics?: ServiceMetricOverrides
  customMetricErrors?: Record<string, string>
}

export type ResolvedContainer = Omit<ResolvedMetricCard, 'labels'> & {
  container: DockerContainer
  name: string
  yamlKey?: string
  labels: ParsedLabels
  url?: string
}

function containerName(container: DockerContainer): string {
  const name = container.Names?.[0] ?? ''
  return name.startsWith('/') ? name.slice(1) : name
}

export function lookupYamlService(yamlServices: Record<string, ServiceOverrides>, hostId: string, container: DockerContainer): { key?: string; service?: ServiceOverrides } {
  const name = containerName(container)
  const composeService = container.Labels?.[COMPOSE_SERVICE_LABEL]
  const keys = [`${hostId}/${name}`, ...(composeService ? [`${hostId}/${composeService}`] : []), name, ...(composeService ? [composeService] : [])]
  const key = keys.find((candidate) => yamlServices[candidate] !== undefined)
  return key === undefined ? {} : { key, service: yamlServices[key] }
}

function mergeWithYaml(labels: ReturnType<typeof parseLabels>, yamlService?: ServiceOverrides): ReturnType<typeof parseLabels> {
  if (!yamlService) return labels
  const yamlMetrics = yamlService.metrics
  const metricsAccess = yamlMetrics?.entryAccess ?? {}
  return {
    hidden: yamlService.hidden ?? labels.hidden,
    url: yamlService.url ?? labels.url,
    metricSources: { ...labels.metricSources, ...yamlMetrics?.sources },
    title: yamlService.title ?? labels.title,
    description: yamlService.description ?? labels.description,
    icon: yamlService.icon ?? labels.icon,
    category: yamlService.category ?? labels.category,
    order: yamlService.order ?? labels.order,
    showStatus: yamlService.showStatus ?? labels.showStatus,
    resourceStats: yamlMetrics ? (parseResourceStats(yamlMetrics.entries) ?? []) : labels.resourceStats,
    metrics: yamlMetrics ? yamlMetrics.entries : labels.metrics,
    metricsPollIntervalMs: yamlMetrics?.collection?.intervalMs ?? labels.metricsPollIntervalMs,
    metricsHistoryPeriodMs: yamlMetrics?.collection?.retentionMs ?? labels.metricsHistoryPeriodMs,
    metricsAccess: Object.keys(metricsAccess).length > 0 ? metricsAccess : labels.metricsAccess,
    access: yamlService.access ?? labels.access,
    searchAliases: yamlService.searchAliases ?? labels.searchAliases
  }
}

function resolveCardUrl(primaryUrl: string | undefined, labels: Record<string, string>, useTraefikFallback: boolean): string | undefined {
  if (primaryUrl && isValidUrl(primaryUrl)) return primaryUrl
  if (!useTraefikFallback) return undefined
  const derived = traefikUrl(labels)
  return derived && isValidUrl(derived) ? derived : undefined
}

function selectedCatalogMetrics(keys: string[] | undefined): ServiceMetricOverrides {
  const catalog = loadMetricCatalog()
  return Object.fromEntries((keys ?? []).flatMap((key) => (catalog[key] ? [[key, catalog[key]]] : [])))
}

export function resolveContainer(yamlServices: Record<string, ServiceOverrides>, hostId: string, container: DockerContainer): ResolvedContainer {
  const { key: yamlKey, service: yamlService } = lookupYamlService(yamlServices, hostId, container)
  const rawLabels = container.Labels ?? {}
  const labels = mergeWithYaml(parseLabels(rawLabels), yamlService)
  const url = resolveCardUrl(labels.url, rawLabels, yamlService !== undefined || hasDashmarkLabels(rawLabels))
  const metricDefinitions = { ...selectedCatalogMetrics(labels.metrics), ...yamlService?.metrics?.entryOverrides }
  return {
    container,
    name: containerName(container),
    yamlKey,
    labels,
    metricDefinitions,
    customMetrics: resolveMetricSources(metricDefinitions, url, labels.metricSources, rawLabels, yamlService?.metrics?.entryInputs),
    customMetricErrors: yamlService?.metrics?.entryErrors,
    url
  }
}

export function resolveYamlMetrics(service: ServiceOverrides, url: string): ResolvedMetricCard {
  const labels = mergeWithYaml(parseLabels({}), service)
  const metricDefinitions = { ...selectedCatalogMetrics(labels.metrics), ...service.metrics?.entryOverrides }
  return {
    labels,
    metricDefinitions,
    customMetrics: resolveMetricSources(metricDefinitions, url, labels.metricSources, {}, service.metrics?.entryInputs),
    customMetricErrors: service.metrics?.entryErrors
  }
}
