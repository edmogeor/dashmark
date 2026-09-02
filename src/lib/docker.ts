import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import type { AppConfig, DockerHostConfig } from './config'
import { loadYamlConfig } from './config-file'
import { loadMetricCatalog } from './config-file-metrics'
import type { MetricOverride, ServiceMetricOverrides, ServiceOverrides } from './config-file-types'
import { parseLabels, parseResourceStats, isValidUrl, traefikUrl, hasDashmarkLabels, RESOURCE_STATS, type ParsedLabels, type ResourceStat } from './labels'
import { resolveIcon, type IconResult } from './icons'
import { resolveDescription } from './descriptions'
import { getUser, hasAllowedAccess } from './auth'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { dashmarkError, errorMessage, isRecord, type DashmarkError } from './errors'
import { strings } from '@/i18n'
import type { ContainerResources, ContainerStatus, UptimeMetric } from './status'
import { collectCustomMetric } from './custom-metrics'
import { getUptimeObservationHistory, mergeUptimeObservationHistory } from './metrics-storage'
import { localizeMetricLabel } from './metric-translations'
import { resolveMetricSources } from './metric-source-resolution'
import {
  DOCKER_REQUEST_TIMEOUT_MS,
  DOCKER_MAX_RESPONSE_BYTES,
  DOCKER_STATUS_CACHE_TTL_MS,
  DOCKER_EVENT_RECONNECT_DELAY_MS,
  DOCKER_TLS_PORT,
  DOCKER_PLAIN_PORT,
  DOCKER_API_FALLBACK_VERSION,
  COMPOSE_SERVICE_LABEL,
  UPTIME_HISTORY_PERIOD_MS
} from './constants'

export type Card = {
  id: string
  title: string
  description?: string
  url: string
  icon: IconResult
  category?: string
  order?: number
  showStatus?: boolean
  state?: string
  health?: string
  resourceStats?: ResourceStat[]
  metrics?: string[]
  customMetricLabels?: { key: string; label: string }[]
  customMetricKeys?: string[]
  uptimeMetricKeys?: string[]
  metricsPollIntervalMs?: number
  metricsHistoryPeriodMs?: number
  metricsAccess?: Record<string, string[]>
  metricErrors?: { key: string; code: 'collection_failed' | 'configuration_invalid' }[]
  resourceUsage?: ContainerResources
  searchAliases: string[]
  hasContainer: boolean
  access: string[]
  host?: string
  hostColor?: number
  usesHostNetwork?: boolean
  isDemo?: boolean
}

type DockerContainer = {
  Id: string
  Names?: string[]
  Image: string
  ImageID: string
  State: string
  Status: string
  Labels?: Record<string, string>
  HostConfig?: {
    NetworkMode?: string
  }
}

type DockerHost = {
  socketPath?: string
  hostname?: string
  port?: number
  secure?: boolean
}

type DiscoveredContainer = {
  hostId: string
  container: DockerContainer
}

type DockerStats = {
  cpuStats: {
    totalUsage: number
    systemUsage: number
    onlineCpus?: number
    cpuCount: number
  }
  previousCpuStats: {
    totalUsage: number
    systemUsage: number
  }
  memoryUsage?: number
  memoryLimit?: number
  receivedBytes?: number
  sentBytes?: number
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function isDockerContainer(value: unknown): value is DockerContainer {
  return (
    isRecord(value) &&
    typeof value.Id === 'string' &&
    (value.Names === undefined || isStringArray(value.Names)) &&
    typeof value.Image === 'string' &&
    typeof value.ImageID === 'string' &&
    typeof value.State === 'string' &&
    typeof value.Status === 'string' &&
    (value.Labels === undefined || isStringRecord(value.Labels)) &&
    (value.HostConfig === undefined || (isRecord(value.HostConfig) && (value.HostConfig.NetworkMode === undefined || typeof value.HostConfig.NetworkMode === 'string')))
  )
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function parseDockerStats(value: unknown): DockerStats | undefined {
  if (!isRecord(value) || !isRecord(value.cpu_stats) || !isRecord(value.precpu_stats)) return undefined
  const cpuUsage = isRecord(value.cpu_stats.cpu_usage) ? value.cpu_stats.cpu_usage : undefined
  const previousCpuUsage = isRecord(value.precpu_stats.cpu_usage) ? value.precpu_stats.cpu_usage : undefined
  const totalUsage = number(cpuUsage?.total_usage)
  const previousTotalUsage = number(previousCpuUsage?.total_usage)
  const systemUsage = number(value.cpu_stats.system_cpu_usage)
  const previousSystemUsage = number(value.precpu_stats.system_cpu_usage)
  if (totalUsage === undefined || previousTotalUsage === undefined || systemUsage === undefined || previousSystemUsage === undefined) {
    return undefined
  }

  const perCpuUsage = cpuUsage?.percpu_usage
  const cpuCount = Array.isArray(perCpuUsage) ? perCpuUsage.length : 1
  const onlineCpus = number(value.cpu_stats.online_cpus)
  const memoryStats = isRecord(value.memory_stats) ? value.memory_stats : undefined
  const networks = isRecord(value.networks) ? Object.values(value.networks) : []
  const receivedBytes = networks.reduce<number | undefined>(
    (total, network) => {
      const received = isRecord(network) ? number(network.rx_bytes) : undefined
      return total === undefined || received === undefined ? undefined : total + received
    },
    networks.length > 0 ? 0 : undefined
  )
  const sentBytes = networks.reduce<number | undefined>(
    (total, network) => {
      const sent = isRecord(network) ? number(network.tx_bytes) : undefined
      return total === undefined || sent === undefined ? undefined : total + sent
    },
    networks.length > 0 ? 0 : undefined
  )
  return {
    cpuStats: { totalUsage, systemUsage, onlineCpus, cpuCount },
    previousCpuStats: {
      totalUsage: previousTotalUsage,
      systemUsage: previousSystemUsage
    },
    memoryUsage: number(memoryStats?.usage),
    memoryLimit: number(memoryStats?.limit),
    receivedBytes,
    sentBytes
  }
}

function parseDockerHost(dockerHost: string): DockerHost {
  if (dockerHost.startsWith('unix://')) {
    return { socketPath: dockerHost.slice('unix://'.length) }
  }

  if (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://') || dockerHost.startsWith('https://')) {
    const url = new URL(dockerHost.replace(/^tcp:/, 'http:'))
    const secure = url.protocol === 'https:'
    const defaultPort = secure ? DOCKER_TLS_PORT : DOCKER_PLAIN_PORT
    return {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : defaultPort,
      secure
    }
  }

  return { socketPath: dockerHost }
}

const apiVersionCache = new Map<string, string>()

type Timestamped<T> = { data: T; timestamp: number }
const containerListCache = new Map<string, Timestamped<DockerContainer[]>>()
const networkUsageCache = new Map<string, { receivedBytes: number; sentBytes: number; timestamp: number }>()
async function rawDockerRequest(dockerHost: string, path: string, apiVersion?: string): Promise<unknown> {
  const host = parseDockerHost(dockerHost)

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: 'GET',
      path: apiVersion ? `/v${apiVersion}${path}` : path
    }

    if (host.socketPath) {
      options.socketPath = host.socketPath
    } else if (host.hostname && host.port) {
      options.hostname = host.hostname
      options.port = host.port
    }

    const request = host.secure ? https.request : http.request
    const req = request(options, (res) => {
      let data = ''
      let responseBytes = 0
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        responseBytes += Buffer.byteLength(chunk)
        if (responseBytes > DOCKER_MAX_RESPONSE_BYTES) {
          req.destroy(new Error(`Docker API response exceeded ${DOCKER_MAX_RESPONSE_BYTES} bytes`))
          return
        }
        data += chunk
      })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error(`Docker API ${options.path} returned invalid JSON`))
          }
        } else {
          reject(new Error(`Docker API ${options.path} returned ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(DOCKER_REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Docker API request timed out after ${DOCKER_REQUEST_TIMEOUT_MS}ms`))
    })
    req.end()
  })
}

async function getDockerApiVersion(dockerHost: string): Promise<string> {
  const cachedVersion = apiVersionCache.get(dockerHost)
  if (cachedVersion) return cachedVersion

  try {
    const data = await rawDockerRequest(dockerHost, '/version')
    if (!isRecord(data) || typeof data.ApiVersion !== 'string') {
      throw new Error('Docker API version response had an invalid format')
    }
    const version = data.ApiVersion
    apiVersionCache.set(dockerHost, version)
    return version
  } catch (error) {
    const message = errorMessage(error)
    const fallback = DOCKER_API_FALLBACK_VERSION
    logger.warn('docker', logMessages.docker.apiVersionFallback, {
      dockerHost,
      fallback,
      error: message
    })
    apiVersionCache.set(dockerHost, fallback)
    return fallback
  }
}

async function dockerRequest(dockerHost: string, path: string): Promise<unknown> {
  const apiVersion = await getDockerApiVersion(dockerHost)
  return rawDockerRequest(dockerHost, path, apiVersion)
}

export function watchContainerEvents(config: AppConfig, onChange: () => void): () => void {
  let stopped = false
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const requests = new Set<http.ClientRequest>()
  const connectedHosts = new Set<string>()

  const scheduleReconnect = (host: DockerHostConfig): void => {
    if (stopped) return
    const timer = setTimeout(() => {
      timers.delete(timer)
      connect(host)
    }, DOCKER_EVENT_RECONNECT_DELAY_MS)
    timer.unref()
    timers.add(timer)
  }

  const connect = (hostConfig: DockerHostConfig): void => {
    void getDockerApiVersion(hostConfig.dockerHost)
      .then((apiVersion) => {
        if (stopped) return
        const host = parseDockerHost(hostConfig.dockerHost)
        const options: http.RequestOptions = {
          method: 'GET',
          path: `/v${apiVersion}/events?filters=${encodeURIComponent(JSON.stringify({ type: ['container'] }))}`
        }
        if (host.socketPath) options.socketPath = host.socketPath
        else if (host.hostname && host.port) {
          options.hostname = host.hostname
          options.port = host.port
        }

        let disconnected = false
        let req: http.ClientRequest
        const reconnect = (): void => {
          if (disconnected) return
          disconnected = true
          requests.delete(req)
          scheduleReconnect(hostConfig)
        }
        const request = host.secure ? https.request : http.request
        req = request(options, (res) => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            res.resume()
            reconnect()
            return
          }
          let pending = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => {
            pending += chunk
            const lines = pending.split('\n')
            pending = lines.pop() ?? ''
            for (const line of lines) {
              try {
                const event = JSON.parse(line)
                if (isRecord(event) && event.Type === 'container') {
                  containerListCache.delete(hostConfig.dockerHost)
                  onChange()
                }
              } catch {
                // Docker event streams are newline-delimited JSON. Ignore malformed events and keep the stream open.
              }
            }
          })
          res.on('end', reconnect)
          res.on('error', reconnect)
          if (connectedHosts.has(hostConfig.dockerHost)) onChange()
          else connectedHosts.add(hostConfig.dockerHost)
        })
        requests.add(req)
        req.on('error', reconnect)
        req.end()
      })
      .catch(() => scheduleReconnect(hostConfig))
  }

  for (const host of configuredDockerHosts(config)) connect(host)
  return () => {
    stopped = true
    for (const timer of timers) clearTimeout(timer)
    for (const request of requests) request.destroy()
    timers.clear()
    requests.clear()
  }
}

async function listContainers(dockerHost: string): Promise<DockerContainer[]> {
  const data = await dockerRequest(dockerHost, '/containers/json?all=1')
  if (!Array.isArray(data) || !data.every(isDockerContainer)) {
    throw new Error('Docker API containers response had an invalid format')
  }
  return data
}

async function getCachedContainers(dockerHost: string, ttlMs: number): Promise<DockerContainer[]> {
  const cached = containerListCache.get(dockerHost)
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data
  }

  const containers = await listContainers(dockerHost)
  containerListCache.set(dockerHost, {
    data: containers,
    timestamp: Date.now()
  })
  return containers
}

function networkRates(dockerHost: string, containerId: string, stats: DockerStats): Pick<ContainerResources, 'receivedBytesPerSecond' | 'sentBytesPerSecond' | 'networkRatePending'> {
  const cacheKey = `${dockerHost}:${containerId}`
  const previous = networkUsageCache.get(cacheKey)
  const timestamp = Date.now()
  const elapsedSeconds = previous ? (timestamp - previous.timestamp) / 1_000 : 0
  const hasNetworkCounters = stats.receivedBytes !== undefined && stats.sentBytes !== undefined
  const receivedBytesPerSecond = previous && elapsedSeconds > 0 && stats.receivedBytes !== undefined ? Math.max(0, (stats.receivedBytes - previous.receivedBytes) / elapsedSeconds) : undefined
  const sentBytesPerSecond = previous && elapsedSeconds > 0 && stats.sentBytes !== undefined ? Math.max(0, (stats.sentBytes - previous.sentBytes) / elapsedSeconds) : undefined
  if (hasNetworkCounters) {
    networkUsageCache.set(cacheKey, {
      receivedBytes: stats.receivedBytes!,
      sentBytes: stats.sentBytes!,
      timestamp
    })
  }
  return {
    receivedBytesPerSecond,
    sentBytesPerSecond,
    networkRatePending: hasNetworkCounters && previous === undefined
  }
}

async function getContainerResources(dockerHost: string, containerId: string, resourceStats: readonly ResourceStat[]): Promise<ContainerResources | undefined> {
  try {
    const data = await dockerRequest(dockerHost, `/containers/${encodeURIComponent(containerId)}/stats?stream=false`)
    const stats = parseDockerStats(data)
    if (!stats) return undefined

    const cpuDelta = stats.cpuStats.totalUsage - stats.previousCpuStats.totalUsage
    const systemDelta = stats.cpuStats.systemUsage - stats.previousCpuStats.systemUsage
    const cpuCount = stats.cpuStats.onlineCpus || stats.cpuStats.cpuCount
    const cpuPercent = systemDelta > 0 && cpuDelta >= 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : undefined
    const network = networkRates(dockerHost, containerId, stats)

    return {
      cpuPercent: resourceStats.includes('cpu') ? cpuPercent : undefined,
      memoryUsage: resourceStats.includes('memory') ? stats.memoryUsage : undefined,
      memoryLimit: resourceStats.includes('memory') ? stats.memoryLimit : undefined,
      receivedBytesPerSecond: resourceStats.includes('network') ? network.receivedBytesPerSecond : undefined,
      sentBytesPerSecond: resourceStats.includes('network') ? network.sentBytesPerSecond : undefined,
      networkRatePending: resourceStats.includes('network') && network.networkRatePending
    }
  } catch {
    return undefined
  }
}

function configuredDockerHosts(config: AppConfig): DockerHostConfig[] {
  return config.dockerHosts?.length ? config.dockerHosts : [{ id: 'default', dockerHost: config.dockerHost }]
}

async function fetchContainers(config: AppConfig): Promise<{ containers: DiscoveredContainer[]; error?: DashmarkError }> {
  const hosts = configuredDockerHosts(config)
  const results = await Promise.allSettled(
    hosts.map(async (host) => ({
      hostId: host.id,
      containers: await getCachedContainers(host.dockerHost, DOCKER_STATUS_CACHE_TTL_MS)
    }))
  )
  const containers: DiscoveredContainer[] = []
  let failure: unknown
  let hasSuccessfulHost = false

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      hasSuccessfulHost = true
      containers.push(
        ...result.value.containers.map((container) => ({
          hostId: result.value.hostId,
          container
        }))
      )
      continue
    }

    failure ??= result.reason
    const message = errorMessage(result.reason)
    const host = hosts[index]
    logger.error('docker', logMessages.docker.listContainersFailed, {
      dockerHost: host?.dockerHost,
      error: message
    })
  }

  if (hasSuccessfulHost || results.length === 0) return { containers }
  const message = errorMessage(failure)
  return {
    containers: [],
    error: dashmarkError('DOCKER_UNREACHABLE', strings.errors.dockerUnreachable, true, message)
  }
}

export function clearDockerCache() {
  apiVersionCache.clear()
  containerListCache.clear()
  networkUsageCache.clear()
  discoveredMetricTargets.clear()
}

function parseHealth(status: string): string | undefined {
  if (status.includes('(healthy)')) return 'healthy'
  if (status.includes('(unhealthy)')) return 'unhealthy'
  if (status.includes('(health: starting)')) return 'starting'
  return undefined
}

function containerName(container: DockerContainer): string {
  const name = container.Names?.[0] ?? ''
  return name.startsWith('/') ? name.slice(1) : name
}

function lookupYamlService(yamlServices: Record<string, ServiceOverrides>, hostId: string, container: DockerContainer): { key?: string; service?: ServiceOverrides } {
  const name = containerName(container)
  const composeService = container.Labels?.[COMPOSE_SERVICE_LABEL]
  const hostName = `${hostId}/${name}`
  if (yamlServices[hostName]) return { key: hostName, service: yamlServices[hostName] }

  if (composeService) {
    const hostComposeService = `${hostId}/${composeService}`
    if (yamlServices[hostComposeService]) {
      return {
        key: hostComposeService,
        service: yamlServices[hostComposeService]
      }
    }
  }

  if (yamlServices[name]) return { key: name, service: yamlServices[name] }

  if (composeService && yamlServices[composeService]) {
    return { key: composeService, service: yamlServices[composeService] }
  }

  return {}
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

function canAccess(config: AppConfig, headers: Headers, access: string[]): boolean {
  return !config.enableAccessControl || hasAllowedAccess(getUser(config, headers), access)
}

function resolveCardDescription(config: AppConfig, description: string | undefined, options: Parameters<typeof resolveDescription>[1]): string | undefined {
  if (description?.trim().toLowerCase() === 'none') return undefined
  return description ?? resolveDescription(config, options)
}

export function filterCardsByAccess(cards: readonly Card[], config: AppConfig, headers: Headers): Card[] {
  return cards
    .filter((card) => canAccess(config, headers, card.access))
    .map((card) => {
      const visible = (metric: string) => canViewMetric(config, headers, card.metricsAccess, metric)
      return {
        ...card,
        resourceStats: card.resourceStats?.filter(visible),
        customMetricLabels: card.customMetricLabels?.filter((metric) => visible(metric.key)),
        metricErrors: card.metricErrors?.filter((error) => visible(error.key))
      }
    })
}

export function missingAccessIdentity(config: AppConfig, headers: Headers, cards: readonly { access: string[] }[]): DashmarkError | undefined {
  if (!config.enableAccessControl || !cards.some((card) => card.access.length > 0)) return undefined

  const user = getUser(config, headers)
  if (user.groups.length > 0 || user.username || user.email) return undefined
  return dashmarkError('MISSING_GROUPS_HEADER', strings.errors.missingGroupsHeader)
}

function resolveCardUrl(primaryUrl: string | undefined, labels: Record<string, string>, useTraefikFallback: boolean): string | undefined {
  if (primaryUrl && isValidUrl(primaryUrl)) return primaryUrl
  if (!useTraefikFallback) return undefined
  const derived = traefikUrl(labels)
  return derived && isValidUrl(derived) ? derived : undefined
}

function selectedCatalogMetrics(keys: string[] | undefined): ServiceMetricOverrides {
  const catalog = loadMetricCatalog()
  return Object.fromEntries(
    (keys ?? []).flatMap((key) => {
      const metric = catalog[key]
      return metric ? [[key, metric]] : []
    })
  )
}

type ResolvedContainer = Omit<ResolvedMetricCard, 'labels'> & {
  container: DockerContainer
  name: string
  yamlKey?: string
  labels: ParsedLabels
  url?: string
}

function resolveContainer(yamlServices: Record<string, ServiceOverrides>, hostId: string, container: DockerContainer): ResolvedContainer {
  const { key: yamlKey, service: yamlService } = lookupYamlService(yamlServices, hostId, container)
  const rawLabels = container.Labels ?? {}
  const labels = mergeWithYaml(parseLabels(rawLabels), yamlService)
  const url = resolveCardUrl(labels.url, rawLabels, yamlService !== undefined || hasDashmarkLabels(rawLabels))
  const metricDefinitions = {
    ...selectedCatalogMetrics(labels.metrics),
    ...yamlService?.metrics?.entryOverrides
  }

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

function resolveYamlMetrics(service: ServiceOverrides, url: string): ResolvedMetricCard {
  const labels = mergeWithYaml(parseLabels({}), service)
  const metricDefinitions = {
    ...selectedCatalogMetrics(labels.metrics),
    ...service?.metrics?.entryOverrides
  }
  return {
    labels,
    metricDefinitions,
    customMetrics: resolveMetricSources(metricDefinitions, url, labels.metricSources, {}, service?.metrics?.entryInputs),
    customMetricErrors: service?.metrics?.entryErrors
  }
}

function isVisibleContainer(config: AppConfig, headers: Headers, { labels, url }: ResolvedContainer): boolean {
  return !labels.hidden && url !== undefined && canAccess(config, headers, labels.access)
}

export function canViewMetric(config: AppConfig, headers: Headers, access: Record<string, string[]> | undefined, metric: string): boolean {
  if (!config.showMetrics) return false
  const user = getUser(config, headers)
  return hasAllowedAccess(user, config.metricsAccess) && hasAllowedAccess(user, access?.[metric] ?? [])
}

async function cardFromContainer(config: AppConfig, resolved: ResolvedContainer, hostId: string, host: string | undefined, hostColor: number): Promise<Card | null> {
  const { container, name, labels, url } = resolved

  if (labels.hidden || !url) return null

  const title = labels.title || name
  const [icon, description] = await Promise.all([
    resolveIcon(config, {
      iconLabel: labels.icon,
      imageName: container.Image,
      title,
      containerName: name
    }),
    resolveCardDescription(config, labels.description, {
      imageName: container.Image,
      title,
      containerName: name
    })
  ])
  return {
    id: `${hostId}:${container.Id}`,
    title,
    description,
    url,
    icon,
    category: labels.category,
    order: labels.order,
    showStatus: labels.showStatus,
    state: container.State,
    health: parseHealth(container.Status),
    searchAliases: labels.searchAliases,
    hasContainer: true,
    access: labels.access,
    host,
    hostColor: host === undefined ? undefined : hostColor,
    usesHostNetwork: container.HostConfig?.NetworkMode === 'host',
    resourceStats: labels.resourceStats ?? [...RESOURCE_STATS],
    metrics: labels.metrics,
    ...metricCardFields(resolved, config)
  }
}

async function cardFromYaml(config: AppConfig, name: string, service: ServiceOverrides, hostColor: number): Promise<Card | null> {
  if (service.hidden || !service.url || !isValidUrl(service.url)) {
    return null
  }

  const title = service.title || name
  const [icon, description] = await Promise.all([
    resolveIcon(config, {
      iconLabel: service.icon,
      title,
      containerName: name
    }),
    resolveCardDescription(config, service.description, {
      title,
      containerName: name
    })
  ])
  const resolved = resolveYamlMetrics(service, service.url)
  return {
    id: `yaml-${name}`,
    title,
    description,
    url: service.url,
    icon,
    category: service.category,
    order: service.order,
    showStatus: service.showStatus,
    searchAliases: service.searchAliases ?? [],
    hasContainer: false,
    access: service.access ?? [],
    host: service.host,
    hostColor: service.host === undefined ? undefined : hostColor,
    metrics: resolved.labels.metrics,
    ...metricCardFields(resolved, config)
  }
}

function sortCards(cards: Card[]): Card[] {
  return cards.sort((a, b) => {
    const categoryA = (a.category ?? '').toLowerCase()
    const categoryB = (b.category ?? '').toLowerCase()
    if (categoryA !== categoryB) return categoryA.localeCompare(categoryB)

    const orderA = a.order ?? Infinity
    const orderB = b.order ?? Infinity
    if (orderA !== orderB) return orderA - orderB

    return a.title.localeCompare(b.title)
  })
}

type LoadedServices = {
  yamlServices: Record<string, ServiceOverrides>
  containers: DiscoveredContainer[]
  error?: DashmarkError
}

async function loadServicesAndContainers(config: AppConfig): Promise<LoadedServices> {
  const yamlConfig = loadYamlConfig(config.configFile)
  if (yamlConfig.error) return { yamlServices: {}, containers: [], error: yamlConfig.error }

  const yamlServices = yamlConfig.config.services
  const { containers, error } = await fetchContainers(config)
  if (error) return { yamlServices, containers, error }

  return { yamlServices, containers }
}

export async function getContainerStatuses(
  config: AppConfig,
  headers: Headers
): Promise<{
  statuses: Record<string, ContainerStatus>
  error?: DashmarkError
}> {
  if (!config.showStatus) {
    return { statuses: {} }
  }

  const { yamlServices, containers, error: loadError } = await loadServicesAndContainers(config)
  if (loadError) return { statuses: {}, error: loadError }
  const resolvedContainers = containers.map(({ hostId, container }) => ({
    hostId,
    container,
    resolved: resolveContainer(yamlServices, hostId, container)
  }))
  const accessCards = resolvedContainers.filter(({ resolved }) => !resolved.labels.hidden && resolved.url !== undefined).map(({ resolved }) => ({ access: resolved.labels.access }))
  const accessError = missingAccessIdentity(config, headers, accessCards)
  if (accessError) return { statuses: {}, error: accessError }

  const statuses = Object.fromEntries(
    resolvedContainers.flatMap(({ hostId, container, resolved }) =>
      isVisibleContainer(config, headers, resolved) ? [[`${hostId}:${container.Id}`, { state: container.State, health: parseHealth(container.Status) }]] : []
    )
  )

  return { statuses }
}

export type CollectedCustomMetric =
  | {
      key: string
      label: string
      unit: Extract<MetricOverride, { valueType: 'number' }>['unit']
      chart: Extract<MetricOverride, { valueType: 'number' }>['chart']
      chartGroup?: string
      rate?: true
      value: number
      pending?: true
    }
  | { key: string; label: string; value: string }
  | {
      key: string
      label: string
      color: Extract<MetricOverride, { valueType: 'state' }>['color']
      valueLabel?: string
      value: string
    }

export type CollectedUptimeMetric = UptimeMetric

export type ContainerMetricUsage = {
  resource?: ContainerResources
  historyPeriodMs: number
  customMetrics: CollectedCustomMetric[]
  uptimeMetrics?: CollectedUptimeMetric[]
  metricErrors: { key: string; code: 'collection_failed' | 'configuration_invalid' }[]
  metricsAccess?: Record<string, string[]>
  metricsPollIntervalMs?: number
}

type SelectedCustomMetric = [key: string, metric: MetricOverride]
type ResolvedMetricCard = {
  labels: Pick<ParsedLabels, 'resourceStats' | 'metrics' | 'metricsPollIntervalMs' | 'metricsHistoryPeriodMs' | 'metricsAccess'>
  metricDefinitions: ServiceMetricOverrides
  customMetrics?: ServiceMetricOverrides
  customMetricErrors?: Record<string, string>
}
type ResolvedMetricDetails = {
  resourceStats: readonly ResourceStat[]
  selectedMetrics: SelectedCustomMetric[]
  metricErrors: ContainerMetricUsage['metricErrors']
  historyPeriodMs: number
  metricsAccess?: Record<string, string[]>
  metricsPollIntervalMs: number
}
type ContainerMetricSample = {
  cardId: string
  resource: ContainerResources | undefined
  customMetrics: CollectedCustomMetric[]
  uptimeMetrics?: CollectedUptimeMetric[]
  metricErrors: ContainerMetricUsage['metricErrors']
  metricsPollIntervalMs: number
  metricsHistoryPeriodMs: number
}

type MetricCollectionTarget = {
  cardId: string
  metricsPollIntervalMs: number
  collect: () => Promise<ContainerMetricSample | undefined>
}

const discoveredMetricTargets = new Map<string, MetricCollectionTarget>()
const MAX_DUE_CARD_COLLECTIONS = 8

function selectedCustomMetrics(resolved: ResolvedMetricCard): SelectedCustomMetric[] {
  if (!resolved.customMetrics) return []
  return selectedMetricLabels(resolved).flatMap(([key]) => {
    const metric = resolved.customMetrics?.[key]
    return metric ? [[key, metric]] : []
  })
}

function selectedMetricLabels(resolved: ResolvedMetricCard): SelectedCustomMetric[] {
  if (!resolved.labels.metrics) return []
  return resolved.labels.metrics.flatMap((key) => {
    const metric = resolved.metricDefinitions[key]
    return metric ? [[key, metric]] : []
  })
}

function selectedCustomMetricErrors(resolved: ResolvedMetricCard): { key: string; code: 'configuration_invalid' }[] {
  if (!resolved.labels.metrics) return []
  return resolved.labels.metrics.flatMap((key) => {
    return resolved.customMetricErrors?.[key] ? [{ key, code: 'configuration_invalid' }] : []
  })
}

function metricDetails(resolved: ResolvedMetricCard, config: AppConfig, hasContainer = true): ResolvedMetricDetails {
  return {
    resourceStats: hasContainer ? (resolved.labels.resourceStats ?? RESOURCE_STATS) : [],
    selectedMetrics: selectedCustomMetrics(resolved),
    metricErrors: selectedCustomMetricErrors(resolved),
    historyPeriodMs: resolved.labels.metricsHistoryPeriodMs ?? config.metricsHistoryPeriodMs,
    metricsAccess: resolved.labels.metricsAccess,
    metricsPollIntervalMs: resolved.labels.metricsPollIntervalMs ?? config.metricsPollIntervalMs
  }
}

function metricCardFields(resolved: ResolvedMetricCard, config: AppConfig) {
  const customMetricLabels = selectedMetricLabels(resolved).map(([key, metric]) => ({ key, label: localizeMetricLabel(config.locale, key, metric.label) }))
  const selectedMetrics = selectedCustomMetrics(resolved)
  const customMetricKeys = selectedMetrics.flatMap(([key, metric]) => (metric.valueType === 'number' ? [key] : []))
  const uptimeMetricKeys = selectedMetrics.flatMap(([key, metric]) => (metric.valueType === 'uptime' ? [key] : []))
  const metricErrors = selectedCustomMetricErrors(resolved)
  return {
    ...(customMetricLabels.length > 0 ? { customMetricLabels } : {}),
    ...(customMetricKeys.length > 0 ? { customMetricKeys } : {}),
    ...(uptimeMetricKeys.length > 0 ? { uptimeMetricKeys } : {}),
    metricsPollIntervalMs: resolved.labels.metricsPollIntervalMs ?? config.metricsPollIntervalMs,
    metricsHistoryPeriodMs: resolved.labels.metricsHistoryPeriodMs,
    metricsAccess: resolved.labels.metricsAccess,
    ...(metricErrors.length > 0 ? { metricErrors } : {})
  }
}

function collectedCustomMetric(locale: AppConfig['locale'], key: string, metric: MetricOverride, value: number | string): CollectedCustomMetric | undefined {
  const label = localizeMetricLabel(locale, key, metric.label)
  if (metric.valueType === 'string' && typeof value === 'string') return { key, label, value }
  if (metric.valueType === 'state' && typeof value === 'string') {
    const valueLabel = metric.stateLabels?.[value]
    return {
      key,
      label,
      ...(valueLabel === undefined ? {} : { valueLabel }),
      color: metric.stateColors?.[value] ?? metric.color,
      value
    }
  }
  if (metric.valueType === 'number' && typeof value === 'number') {
    return {
      key,
      label,
      unit: metric.unit,
      chart: metric.chart,
      ...(metric.chartGroup === undefined ? {} : { chartGroup: metric.chartGroup }),
      ...(metric.rate ? { rate: true } : {}),
      value
    }
  }
  return undefined
}

async function collectSelectedCustomMetrics(
  config: AppConfig,
  cardId: string,
  historyPeriodMs: number,
  metrics: SelectedCustomMetric[],
  metricErrors: ContainerMetricUsage['metricErrors']
): Promise<Pick<ContainerMetricUsage, 'customMetrics' | 'uptimeMetrics' | 'metricErrors'>> {
  const uptimeHistoryPeriodMs = Math.max(historyPeriodMs, UPTIME_HISTORY_PERIOD_MS)
  const results = await Promise.all(
    metrics.map(async ([key, metric]) => {
      const uptimeHistory = metric.valueType === 'uptime' ? getUptimeObservationHistory(config, cardId, key, uptimeHistoryPeriodMs) : []
      const result = await collectCustomMetric(key, metric, metric.valueType === 'uptime' && metric.source.initialQuery !== undefined && uptimeHistory.length === 0)
      return { key, metric, uptimeHistory, result }
    })
  )
  const customMetrics: ContainerMetricUsage['customMetrics'] = []
  const uptimeMetrics: ContainerMetricUsage['uptimeMetrics'] = []
  const collectedErrors = [...metricErrors]
  for (const { key, metric, uptimeHistory, result } of results) {
    if ('observations' in result && metric.valueType === 'uptime') {
      const observations = mergeUptimeObservationHistory(config, cardId, key, result.observations, uptimeHistoryPeriodMs)
      uptimeMetrics.push({
        key,
        label: localizeMetricLabel(config.locale, key, metric.label),
        current: observations.at(-1)?.status ?? 'unknown',
        observations
      })
    } else if ('error' in result && metric.valueType === 'uptime' && uptimeHistory.length > 0) {
      uptimeMetrics.push({ key, label: localizeMetricLabel(config.locale, key, metric.label), current: uptimeHistory.at(-1)?.status ?? 'unknown', observations: uptimeHistory })
      collectedErrors.push({ key, code: result.error })
    } else if ('value' in result) {
      const collected = collectedCustomMetric(config.locale, key, metric, result.value)
      if (collected) customMetrics.push(collected)
    } else if ('error' in result) collectedErrors.push({ key, code: result.error })
  }
  return {
    customMetrics,
    ...(uptimeMetrics.length > 0 ? { uptimeMetrics } : {}),
    metricErrors: collectedErrors
  }
}

function metricSample(
  cardId: string,
  resource: ContainerResources | undefined,
  collected: Pick<ContainerMetricUsage, 'customMetrics' | 'uptimeMetrics' | 'metricErrors'>,
  metricsPollIntervalMs: number,
  metricsHistoryPeriodMs: number
): ContainerMetricSample | undefined {
  if (!resource && collected.customMetrics.length === 0 && !collected.uptimeMetrics?.length && collected.metricErrors.length === 0) return undefined
  return {
    cardId,
    resource,
    customMetrics: collected.customMetrics,
    ...(collected.uptimeMetrics ? { uptimeMetrics: collected.uptimeMetrics } : {}),
    metricErrors: collected.metricErrors,
    metricsPollIntervalMs,
    metricsHistoryPeriodMs
  }
}

export async function getContainerMetricUsage(config: AppConfig, headers: Headers, cardId: string, collect = true): Promise<ContainerMetricUsage | undefined> {
  if (!config.showMetrics || !hasAllowedAccess(getUser(config, headers), config.metricsAccess)) return undefined
  return cardId.startsWith('yaml-') ? getYamlMetricUsage(config, headers, cardId, collect) : getDockerMetricUsage(config, headers, cardId, collect)
}

async function getYamlMetricUsage(config: AppConfig, headers: Headers, cardId: string, collect: boolean): Promise<ContainerMetricUsage | undefined> {
  const name = cardId.slice('yaml-'.length)
  const { yamlServices, containers, error } = await loadServicesAndContainers(config)
  if (error) return undefined
  const service = yamlServices[name]
  if (!service || service.hidden || !service.url || !isValidUrl(service.url) || service.showStatus === false || !canAccess(config, headers, service.access ?? [])) return undefined
  if (containers.some(({ hostId, container }) => lookupYamlService(yamlServices, hostId, container).key === name)) return undefined

  const details = metricDetails(resolveYamlMetrics(service, service.url), config, false)
  const { selectedMetrics, metricErrors, historyPeriodMs, metricsAccess, metricsPollIntervalMs } = details
  if (selectedMetrics.length === 0 && metricErrors.length === 0) return undefined
  if (!collect)
    return {
      historyPeriodMs,
      customMetrics: [],
      metricErrors,
      ...(metricsAccess ? { metricsAccess } : {}),
      metricsPollIntervalMs
    }

  const collected = await collectSelectedCustomMetrics(config, cardId, historyPeriodMs, selectedMetrics, metricErrors)
  if (collected.customMetrics.length === 0 && !collected.uptimeMetrics?.length && collected.metricErrors.length === 0) return undefined
  return {
    ...collected,
    historyPeriodMs,
    ...(metricsAccess ? { metricsAccess } : {})
  }
}

async function getDockerMetricUsage(config: AppConfig, headers: Headers, cardId: string, collect: boolean): Promise<ContainerMetricUsage | undefined> {
  const host = configuredDockerHosts(config).find((candidate) => cardId.startsWith(`${candidate.id}:`))
  if (!host) return undefined
  const containerId = cardId.slice(host.id.length + 1)
  if (!containerId) return undefined

  const yamlConfig = loadYamlConfig(config.configFile)
  if (yamlConfig.error) return undefined

  try {
    const containers = await getCachedContainers(host.dockerHost, DOCKER_STATUS_CACHE_TTL_MS)
    const container = containers.find((candidate) => candidate.Id === containerId)
    if (!container || container.State !== 'running') return undefined

    const resolved = resolveContainer(yamlConfig.config.services, host.id, container)
    if (!isVisibleContainer(config, headers, resolved) || resolved.labels.showStatus === false) return undefined
    const details = metricDetails(resolved, config)
    const { resourceStats, selectedMetrics, metricErrors, historyPeriodMs, metricsAccess, metricsPollIntervalMs } = details
    if (resourceStats.length === 0 && selectedMetrics.length === 0 && metricErrors.length === 0) return undefined
    if (!collect)
      return {
        historyPeriodMs,
        customMetrics: [],
        metricErrors,
        ...(metricsAccess ? { metricsAccess } : {}),
        metricsPollIntervalMs
      }

    const [resource, collected] = await Promise.all([
      resourceStats.length > 0 ? getContainerResources(host.dockerHost, container.Id, resourceStats) : undefined,
      collectSelectedCustomMetrics(config, cardId, historyPeriodMs, selectedMetrics, metricErrors)
    ])
    if (!resource && collected.customMetrics.length === 0 && !collected.uptimeMetrics?.length && collected.metricErrors.length === 0) return undefined
    return {
      resource,
      ...collected,
      historyPeriodMs,
      ...(metricsAccess ? { metricsAccess } : {})
    }
  } catch {
    return undefined
  }
}

export async function getContainerResourceUsage(config: AppConfig, headers: Headers, cardId: string): Promise<ContainerResources | undefined> {
  return (await getContainerMetricUsage(config, headers, cardId))?.resource
}

export async function collectContainerResourceUsage(config: AppConfig, isDue: (cardId: string, pollIntervalMs: number) => boolean = () => true): Promise<ContainerMetricSample[]> {
  if (!config.showMetrics) return []

  const yamlConfig = loadYamlConfig(config.configFile)
  if (yamlConfig.error) return []
  const samples: ContainerMetricSample[] = []
  const matchedYamlKeys = new Set<string>()

  await Promise.all(
    configuredDockerHosts(config).map(async (host) => {
      try {
        const containers = await getCachedContainers(host.dockerHost, DOCKER_STATUS_CACHE_TTL_MS)
        const results = await Promise.all(
          containers.map(async (container) => {
            const resolved = resolveContainer(yamlConfig.config.services, host.id, container)
            if (resolved.yamlKey) matchedYamlKeys.add(resolved.yamlKey)
            if (container.State !== 'running') return undefined
            if (resolved.labels.hidden || !resolved.url || resolved.labels.showStatus === false) return undefined
            const { resourceStats, selectedMetrics, historyPeriodMs } = metricDetails(resolved, config)
            if (resourceStats.length === 0 && selectedMetrics.length === 0) return undefined
            const cardId = `${host.id}:${container.Id}`
            const metricsPollIntervalMs = resolved.labels.metricsPollIntervalMs ?? config.metricsPollIntervalMs
            if (!isDue(cardId, metricsPollIntervalMs)) return undefined
            const [resource, collected] = await Promise.all([
              resourceStats.length > 0 ? getContainerResources(host.dockerHost, container.Id, resourceStats) : undefined,
              collectSelectedCustomMetrics(config, cardId, historyPeriodMs, selectedMetrics, [])
            ])
            return metricSample(cardId, resource, collected, metricsPollIntervalMs, historyPeriodMs)
          })
        )
        samples.push(...results.filter((sample): sample is ContainerMetricSample => sample !== undefined))
      } catch {
        // Resource metrics are optional, so an unavailable host does not affect the dashboard.
      }
    })
  )

  const standaloneSamples = await Promise.all(
    Object.entries(yamlConfig.config.services).map(async ([name, service]): Promise<ContainerMetricSample | undefined> => {
      if (matchedYamlKeys.has(name) || service.hidden || !service.url || !isValidUrl(service.url) || service.showStatus === false) return undefined
      const resolved = resolveYamlMetrics(service, service.url)
      const { selectedMetrics, historyPeriodMs } = metricDetails(resolved, config, false)
      if (selectedMetrics.length === 0) return undefined
      const cardId = `yaml-${name}`
      const metricsPollIntervalMs = service.metrics?.collection?.intervalMs ?? config.metricsPollIntervalMs
      if (!isDue(cardId, metricsPollIntervalMs)) return undefined
      const collected = await collectSelectedCustomMetrics(config, cardId, historyPeriodMs, selectedMetrics, [])
      return metricSample(cardId, undefined, collected, metricsPollIntervalMs, historyPeriodMs)
    })
  )
  samples.push(...standaloneSamples.filter((sample): sample is ContainerMetricSample => sample !== undefined))

  return samples
}

export function discoveredMetricSchedules(): readonly { cardId: string; metricsPollIntervalMs: number }[] {
  return [...discoveredMetricTargets.values()].map(({ cardId, metricsPollIntervalMs }) => ({ cardId, metricsPollIntervalMs }))
}

export async function collectDiscoveredMetricUsage(cardIds: ReadonlySet<string>): Promise<ContainerMetricSample[]> {
  const targets = [...cardIds].flatMap((cardId) => {
    const target = discoveredMetricTargets.get(cardId)
    return target ? [target] : []
  })
  const samples: ContainerMetricSample[] = []
  let next = 0
  const worker = async () => {
    while (next < targets.length) {
      const target = targets[next++]
      const sample = await target.collect()
      if (sample) samples.push(sample)
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_DUE_CARD_COLLECTIONS, targets.length) }, worker))
  return samples
}

function containerMetricTarget(config: AppConfig, cardId: string, dockerHost: string, container: DockerContainer, resolved: ResolvedContainer): MetricCollectionTarget | undefined {
  if (container.State !== 'running' || resolved.labels.hidden || !resolved.url || resolved.labels.showStatus === false) return undefined
  const { resourceStats, selectedMetrics, historyPeriodMs, metricErrors, metricsPollIntervalMs } = metricDetails(resolved, config)
  if (resourceStats.length === 0 && selectedMetrics.length === 0 && metricErrors.length === 0) return undefined
  return {
    cardId,
    metricsPollIntervalMs,
    collect: async () => {
      const [resource, collected] = await Promise.all([
        resourceStats.length > 0 ? getContainerResources(dockerHost, container.Id, resourceStats) : undefined,
        collectSelectedCustomMetrics(config, cardId, historyPeriodMs, selectedMetrics, metricErrors)
      ])
      return metricSample(cardId, resource, collected, metricsPollIntervalMs, historyPeriodMs)
    }
  }
}

function yamlMetricTarget(config: AppConfig, name: string, service: ServiceOverrides): MetricCollectionTarget | undefined {
  if (service.hidden || !service.url || !isValidUrl(service.url) || service.showStatus === false) return undefined
  const resolved = resolveYamlMetrics(service, service.url)
  const { selectedMetrics, historyPeriodMs, metricErrors, metricsPollIntervalMs } = metricDetails(resolved, config, false)
  if (selectedMetrics.length === 0 && metricErrors.length === 0) return undefined
  const cardId = `yaml-${name}`
  return {
    cardId,
    metricsPollIntervalMs,
    collect: async () => {
      const collected = await collectSelectedCustomMetrics(config, cardId, historyPeriodMs, selectedMetrics, metricErrors)
      return metricSample(cardId, undefined, collected, metricsPollIntervalMs, historyPeriodMs)
    }
  }
}

async function buildAllCards(config: AppConfig): Promise<{ cards: Card[]; error?: DashmarkError }> {
  const { yamlServices, containers, error } = await loadServicesAndContainers(config)
  if (error) return { cards: [], error }

  const cards: Card[] = []
  const metricTargets = new Map<string, MetricCollectionTarget>()
  const matchedKeys = new Set(
    containers.flatMap(({ hostId, container }) => {
      const key = lookupYamlService(yamlServices, hostId, container).key
      return key === undefined ? [] : [key]
    })
  )
  const hostIds = [...new Set(containers.map(({ hostId }) => hostId))]
  const dockerHostName = (hostId: string) => (hostId === 'default' ? 'host' : hostId)
  const yamlHostNames = [...new Set(Object.entries(yamlServices).flatMap(([name, service]) => (!matchedKeys.has(name) && service.host ? [service.host] : [])))]
  const showHost = hostIds.length > 1 || yamlHostNames.length > 0
  const hostColors = new Map([...new Set([...hostIds.map(dockerHostName), ...yamlHostNames])].map((host, index) => [host, index]))

  for (const { hostId, container } of containers) {
    const resolved = resolveContainer(yamlServices, hostId, container)
    const host = showHost ? dockerHostName(hostId) : undefined
    const card = await cardFromContainer(config, resolved, hostId, host, hostColors.get(host ?? '') ?? 0)
    if (card) cards.push(card)
    const target = containerMetricTarget(
      config,
      `${hostId}:${container.Id}`,
      configuredDockerHosts(config).find((candidate) => candidate.id === hostId)?.dockerHost ?? config.dockerHost,
      container,
      resolved
    )
    if (target) metricTargets.set(target.cardId, target)

    if (resolved.yamlKey) matchedKeys.add(resolved.yamlKey)
  }

  for (const [name, yamlService] of Object.entries(yamlServices)) {
    if (matchedKeys.has(name)) continue
    const card = await cardFromYaml(config, name, yamlService, hostColors.get(yamlService.host ?? '') ?? 0)
    if (card) cards.push(card)
    const target = yamlMetricTarget(config, name, yamlService)
    if (target) metricTargets.set(target.cardId, target)
  }

  discoveredMetricTargets.clear()
  for (const [cardId, target] of metricTargets) discoveredMetricTargets.set(cardId, target)
  return { cards: sortCards(cards) }
}

// Discovery is intentionally unauthenticated. Consumers must filter its cards using
// filterCardsByAccess before returning a snapshot to a request or socket.
export async function getDiscoveredCards(config: AppConfig): Promise<{ cards: Card[]; error?: DashmarkError }> {
  return buildAllCards(config)
}

export async function getCards(
  config: AppConfig,
  headers: Headers
): Promise<{
  cards: Card[]
  usesAccessControl: boolean
  error?: DashmarkError
}> {
  const { cards: allCards, error } = await getDiscoveredCards(config)
  if (error) return { cards: [], usesAccessControl: false, error }

  const usesAccessControl = allCards.some((card) => card.access.length > 0)
  const accessError = missingAccessIdentity(config, headers, allCards)
  if (accessError) return { cards: [], usesAccessControl, error: accessError }
  return {
    cards: filterCardsByAccess(allCards, config, headers),
    usesAccessControl
  }
}
