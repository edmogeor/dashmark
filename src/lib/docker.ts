import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import type { AppConfig, DockerHostConfig } from './config'
import type { MetricOverride, ServiceMetricOverrides, ServiceOverrides } from './config-file'
import { loadMetricCatalog, loadYamlConfig } from './config-file'
import { parseLabels, isValidUrl, traefikUrl, hasDashmarkLabels, RESOURCE_STATS, type ParsedLabels, type ResourceStat } from './labels'
import { resolveIcon, type IconResult } from './icons'
import { resolveDescription } from './descriptions'
import { getUser, groupHeaderNames, hasAllowedAccess } from './auth'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { dashmarkError, errorMessage, isRecord, type DashmarkError } from './errors'
import { strings } from './strings'
import type { ContainerResources, ContainerStatus } from './status'
import { collectCustomMetric } from './custom-metrics'
import {
  DOCKER_REQUEST_TIMEOUT_MS,
  DOCKER_MAX_RESPONSE_BYTES,
  DOCKER_STATUS_CACHE_TTL_MS,
  DOCKER_TLS_PORT,
  DOCKER_PLAIN_PORT,
  DOCKER_API_FALLBACK_VERSION,
  COMPOSE_SERVICE_LABEL
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
  metricProviders?: string[]
  metricsPollIntervalMs?: number
  metricsHistoryPeriodMs?: number
  metricsAccess?: Record<string, string[]>
  metricErrors?: { key: string; message: string }[]
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
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string')
}

function isDockerContainer(value: unknown): value is DockerContainer {
  return isRecord(value)
    && typeof value.Id === 'string'
    && (value.Names === undefined || isStringArray(value.Names))
    && typeof value.Image === 'string'
    && typeof value.ImageID === 'string'
    && typeof value.State === 'string'
    && typeof value.Status === 'string'
    && (value.Labels === undefined || isStringRecord(value.Labels))
    && (value.HostConfig === undefined || (isRecord(value.HostConfig) && (value.HostConfig.NetworkMode === undefined || typeof value.HostConfig.NetworkMode === 'string')))
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
  const receivedBytes = networks.reduce<number | undefined>((total, network) => {
    const received = isRecord(network) ? number(network.rx_bytes) : undefined
    return total === undefined || received === undefined ? undefined : total + received
  }, networks.length > 0 ? 0 : undefined)
  const sentBytes = networks.reduce<number | undefined>((total, network) => {
    const sent = isRecord(network) ? number(network.tx_bytes) : undefined
    return total === undefined || sent === undefined ? undefined : total + sent
  }, networks.length > 0 ? 0 : undefined)
  return {
    cpuStats: { totalUsage, systemUsage, onlineCpus, cpuCount },
    previousCpuStats: { totalUsage: previousTotalUsage, systemUsage: previousSystemUsage },
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
async function rawDockerRequest(
  dockerHost: string,
  path: string,
  apiVersion?: string
): Promise<unknown> {
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
    const req = request(options, res => {
      let data = ''
      let responseBytes = 0
      res.setEncoding('utf8')
      res.on('data', chunk => {
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
  containerListCache.set(dockerHost, { data: containers, timestamp: Date.now() })
  return containers
}

function networkRates(dockerHost: string, containerId: string, stats: DockerStats): Pick<ContainerResources, 'receivedBytesPerSecond' | 'sentBytesPerSecond' | 'networkRatePending'> {
  const cacheKey = `${dockerHost}:${containerId}`
  const previous = networkUsageCache.get(cacheKey)
  const timestamp = Date.now()
  const elapsedSeconds = previous ? (timestamp - previous.timestamp) / 1_000 : 0
  const hasNetworkCounters = stats.receivedBytes !== undefined && stats.sentBytes !== undefined
  const receivedBytesPerSecond = previous && elapsedSeconds > 0 && stats.receivedBytes !== undefined
    ? Math.max(0, (stats.receivedBytes - previous.receivedBytes) / elapsedSeconds)
    : undefined
  const sentBytesPerSecond = previous && elapsedSeconds > 0 && stats.sentBytes !== undefined
    ? Math.max(0, (stats.sentBytes - previous.sentBytes) / elapsedSeconds)
    : undefined
  if (hasNetworkCounters) {
    networkUsageCache.set(cacheKey, { receivedBytes: stats.receivedBytes!, sentBytes: stats.sentBytes!, timestamp })
  }
  return { receivedBytesPerSecond, sentBytesPerSecond, networkRatePending: hasNetworkCounters && previous === undefined }
}

async function getContainerResources(
  dockerHost: string,
  containerId: string,
  resourceStats: readonly ResourceStat[]
): Promise<ContainerResources | undefined> {
  try {
    const data = await dockerRequest(dockerHost, `/containers/${encodeURIComponent(containerId)}/stats?stream=false`)
    const stats = parseDockerStats(data)
    if (!stats) return undefined

    const cpuDelta = stats.cpuStats.totalUsage - stats.previousCpuStats.totalUsage
    const systemDelta = stats.cpuStats.systemUsage - stats.previousCpuStats.systemUsage
    const cpuCount = stats.cpuStats.onlineCpus || stats.cpuStats.cpuCount
    const cpuPercent = systemDelta > 0 && cpuDelta >= 0
      ? (cpuDelta / systemDelta) * cpuCount * 100
      : undefined
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
  const results = await Promise.allSettled(hosts.map(async host => ({
    hostId: host.id,
    containers: await getCachedContainers(host.dockerHost, DOCKER_STATUS_CACHE_TTL_MS)
  })))
  const containers: DiscoveredContainer[] = []
  let failure: unknown
  let hasSuccessfulHost = false

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      hasSuccessfulHost = true
      containers.push(...result.value.containers.map(container => ({ hostId: result.value.hostId, container })))
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

function lookupYamlService(
  yamlServices: Record<string, ServiceOverrides>,
  hostId: string,
  container: DockerContainer
): { key?: string; service?: ServiceOverrides } {
  const name = containerName(container)
  const composeService = container.Labels?.[COMPOSE_SERVICE_LABEL]
  const hostName = `${hostId}/${name}`
  if (yamlServices[hostName]) return { key: hostName, service: yamlServices[hostName] }

  if (composeService) {
    const hostComposeService = `${hostId}/${composeService}`
    if (yamlServices[hostComposeService]) {
      return { key: hostComposeService, service: yamlServices[hostComposeService] }
    }
  }

  if (yamlServices[name]) return { key: name, service: yamlServices[name] }

  if (composeService && yamlServices[composeService]) {
    return { key: composeService, service: yamlServices[composeService] }
  }

  return {}
}

function mergeWithYaml(
  labels: ReturnType<typeof parseLabels>,
  yamlService?: ServiceOverrides
): ReturnType<typeof parseLabels> {
  if (!yamlService) return labels

  return {
    hidden: yamlService.hidden ?? labels.hidden,
    url: yamlService.url ?? labels.url,
    metricsUrl: yamlService.metricsUrl ?? labels.metricsUrl,
    title: yamlService.title ?? labels.title,
    description: yamlService.description ?? labels.description,
    icon: yamlService.icon ?? labels.icon,
    category: yamlService.category ?? labels.category,
    order: yamlService.order ?? labels.order,
    showStatus: yamlService.showStatus ?? labels.showStatus,
    resourceStats: yamlService.resourceStats ?? labels.resourceStats,
    metrics: yamlService.metrics ?? labels.metrics,
    metricProviders: yamlService.metricProviders ?? labels.metricProviders,
    metricsPollIntervalMs: yamlService.metricsPollIntervalMs ?? labels.metricsPollIntervalMs,
    metricsHistoryPeriodMs: yamlService.metricsHistoryPeriodMs ?? labels.metricsHistoryPeriodMs,
    metricsAccess: yamlService.metricsAccess ?? labels.metricsAccess,
    access: yamlService.access ?? labels.access,
    searchAliases: yamlService.searchAliases ?? labels.searchAliases
  }
}

function canAccess(config: AppConfig, headers: Headers, access: string[]): boolean {
  return !config.enableAccessControl || hasAllowedAccess(getUser(config, headers), access)
}

function resolveCardDescription(
  config: AppConfig,
  description: string | undefined,
  options: Parameters<typeof resolveDescription>[1]
): string | undefined {
  if (description?.trim().toLowerCase() === 'none') return undefined
  return description ?? resolveDescription(config, options)
}

function filterCardsByAccess(cards: Card[], config: AppConfig, headers: Headers): Card[] {
  return cards.filter(card => canAccess(config, headers, card.access)).map(card => {
    const visible = (metric: string) => canViewMetric(config, headers, card.metricsAccess, metric)
    return {
      ...card,
      resourceStats: card.resourceStats?.filter(visible),
      customMetricLabels: card.customMetricLabels?.filter(metric => visible(metric.key)),
      metricErrors: card.metricErrors?.filter(error => visible(error.key))
    }
  })
}

function missingAccessIdentity(config: AppConfig, headers: Headers, cards: { access: string[] }[]): DashmarkError | undefined {
  if (!config.enableAccessControl || !cards.some(card => card.access.length > 0)) return undefined

  const user = getUser(config, headers)
  if (user.groups.length > 0 || user.username || user.email) return undefined
  return dashmarkError('MISSING_GROUPS_HEADER', strings.errors.missingGroupsHeader)
}

function resolveCardUrl(
  primaryUrl: string | undefined,
  labels: Record<string, string>,
  useTraefikFallback: boolean
): string | undefined {
  if (primaryUrl && isValidUrl(primaryUrl)) return primaryUrl
  if (!useTraefikFallback) return undefined
  const derived = traefikUrl(labels)
  return derived && isValidUrl(derived) ? derived : undefined
}

type ResolvedContainer = {
  container: DockerContainer
  name: string
  yamlKey?: string
  labels: ParsedLabels
  customMetrics?: Record<string, MetricOverride>
  customMetricErrors?: Record<string, string>
  url?: string
}

function resolveContainer(
  yamlServices: Record<string, ServiceOverrides>,
  hostId: string,
  container: DockerContainer
): ResolvedContainer {
  const { key: yamlKey, service: yamlService } = lookupYamlService(yamlServices, hostId, container)
  const rawLabels = container.Labels ?? {}
  const labels = mergeWithYaml(parseLabels(rawLabels), yamlService)
  const url = resolveCardUrl(labels.url, rawLabels, yamlService !== undefined || hasDashmarkLabels(rawLabels))
  const catalogMetrics = loadMetricCatalog()
  const selectedCatalogMetrics = Object.fromEntries((labels.metrics ?? []).flatMap(key => {
    const metric = catalogMetrics[key]
    return metric ? [[key, metric]] : []
  }))
  const customMetrics = { ...selectedCatalogMetrics, ...yamlService?.customMetrics }

  return {
    container,
    name: containerName(container),
    yamlKey,
    labels,
    customMetrics: resolveMetricSources(customMetrics, url, labels.metricsUrl, rawLabels, yamlService?.metricParameters),
    customMetricErrors: yamlService?.customMetricErrors,
    url
  }
}

function resolveYamlMetrics(service: ServiceOverrides, url: string): ResolvedMetricCard {
  const catalogMetrics = loadMetricCatalog()
  const selectedCatalogMetrics = Object.fromEntries((service.metrics ?? []).flatMap(key => {
    const metric = catalogMetrics[key]
    return metric ? [[key, metric]] : []
  }))
  const customMetrics = { ...selectedCatalogMetrics, ...service.customMetrics }
  return {
    labels: service,
    customMetrics: resolveMetricSources(customMetrics, url, service.metricsUrl, {}, service.metricParameters),
    customMetricErrors: service.customMetricErrors
  }
}

function resolveMetricSources(
  metrics: ServiceMetricOverrides,
  cardUrl: string | undefined,
  metricsUrl: string | undefined,
  labels: Record<string, string>,
  metricParameters: ServiceOverrides['metricParameters']
): ServiceMetricOverrides | undefined {
  const resolveUrl = (url: string, parameters: MetricOverride['parameters'], values: Record<string, string | number | boolean> | undefined): string | undefined => {
    const baseUrl = url.startsWith('{metrics_url}') ? metricsUrl ?? cardUrl : url.startsWith('{url}') ? cardUrl : undefined
    const placeholder = url.startsWith('{metrics_url}') ? '{metrics_url}' : '{url}'
    const resolved = baseUrl === undefined && url.startsWith('{')
      ? undefined
      : baseUrl ? `${baseUrl.replace(/\/$/, '')}${url.slice(placeholder.length)}` : url
    return resolved?.replace(/\{([a-z][a-z0-9_]*)\}/g, (match, name: string) => {
      if (!parameters?.[name] || values?.[name] === undefined) return match
      return encodeURIComponent(String(values[name]))
    })
  }
  const resolveReference = (reference: unknown): unknown => {
    if (reference === null || typeof reference !== 'object' || Array.isArray(reference)) return reference
    const keys = Object.keys(reference)
    if (keys.length === 1 && typeof (reference as { token?: unknown }).token === 'string') return reference
    if (keys.every(key => ['env', 'file', 'label', 'value'].includes(key)) && keys.some(key => typeof (reference as Record<string, unknown>)[key] === 'string')) {
      const secret = reference as { label?: string }
      const value = secret.label === undefined ? undefined : labels[secret.label]
      return value === undefined ? reference : { ...reference, value }
    }
    return Object.fromEntries(Object.entries(reference).map(([name, value]) => [name, resolveReference(value)]))
  }
  const resolveReferences = (references: typeof metrics[string]['source']['headers']) => Object.fromEntries(Object.entries(references ?? {}).map(([name, reference]) => [name, resolveReference(reference)])) as NonNullable<typeof references>
  const resolveSocketIo = (socketio: NonNullable<typeof metrics[string]['source']['socketio']>) => {
    const resolveArguments = (args: typeof socketio.request.args) => args?.map(argument => {
      if (typeof argument !== 'object') return argument
      return resolveReference(argument) as typeof argument
    })
    const auth = resolveReferences(socketio.auth)
    return {
      ...socketio,
      ...(Object.keys(auth).length > 0 ? { auth } : {}),
      ...(socketio.login ? { login: { ...socketio.login, ...(socketio.login.args ? { args: resolveArguments(socketio.login.args) } : {}) } } : {}),
      request: { ...socketio.request, ...(socketio.request.args ? { args: resolveArguments(socketio.request.args) } : {}) }
    }
  }
  const resolveRequest = (request: Extract<NonNullable<typeof metrics[string]['source']['auth']>, { type: 'cookie_session' }>['steps'][number], metric: MetricOverride, values: Record<string, string | number | boolean> | undefined) => {
    const url = resolveUrl(request.url, metric.parameters, values)
    if (!url) return undefined
    const headers = resolveReferences(request.headers)
    const query = resolveReferences(request.query)
    const form = resolveReferences(request.form)
    const resolveJsonParameters = (value: unknown): unknown => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
      if (Object.keys(value).length === 1 && typeof (value as { parameter?: unknown }).parameter === 'string') {
        const name = (value as { parameter: string }).parameter
        return metric.parameters?.[name]?.type === 'json_value' && values?.[name] !== undefined ? { __dashmarkParameterValue: values[name] } : value
      }
      return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, resolveJsonParameters(item)]))
    }
    const json = request.json === undefined ? undefined : resolveJsonParameters(resolveReference(request.json)) as typeof request.json
    return {
      ...request,
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(Object.keys(query).length > 0 ? { query } : {}),
      ...(Object.keys(form).length > 0 ? { form } : {}),
      ...(json && Object.keys(json).length > 0 ? { json } : {})
    }
  }
  const resolved = Object.fromEntries(Object.entries(metrics).flatMap(([key, metric]) => {
    const values = metricParameters?.[key]
    if (Object.keys(metric.parameters ?? {}).some(name => values?.[name] === undefined)) return []
    const request = resolveRequest({ ...metric.source, method: metric.source.method ?? 'GET' }, metric, values)
    if (!request) return []
    const auth = metric.source.auth
    const steps = auth?.type === 'cookie_session' ? auth.steps.map(step => resolveRequest(step, metric, values)) : undefined
    if (steps?.some(step => !step)) return []
    const basicAuth = auth?.type === 'basic'
      ? {
          ...auth,
          username: resolveReferences({ username: auth.username }).username! as typeof auth.username,
          password: resolveReferences({ password: auth.password }).password! as typeof auth.password
        }
      : undefined
    const tokenAuth = auth?.type === 'token'
      ? { ...auth, value: resolveReferences({ value: auth.value }).value! as typeof auth.value }
      : undefined
    return [[key, {
      ...metric,
      source: {
        ...request,
        ...(metric.source.transport ? { transport: metric.source.transport } : {}),
        ...(metric.source.socketio ? { socketio: resolveSocketIo(metric.source.socketio) } : {}),
        ...(auth?.type === 'cookie_session' && steps ? { auth: { ...auth, steps: steps as typeof auth.steps } } : {}),
        ...(basicAuth ? { auth: basicAuth } : {}),
        ...(tokenAuth ? { auth: tokenAuth } : {})
      }
    }]]
  }))
  return Object.keys(resolved).length > 0 ? resolved as ServiceMetricOverrides : undefined
}

function isVisibleContainer(config: AppConfig, headers: Headers, { labels, url }: ResolvedContainer): boolean {
  return !labels.hidden && url !== undefined && canAccess(config, headers, labels.access)
}

export function addAccessVaryHeader(headers: Headers, config: AppConfig): void {
  if (!config.enableAccessControl) return
  headers.set('Vary', groupHeaderNames(config).join(', '))
}

export function addResourceUsageVaryHeader(headers: Headers, config: AppConfig): void {
  if (!config.enableAccessControl && config.metricsAccess.length === 0) return
  headers.set('Vary', groupHeaderNames(config).join(', '))
}

export function canViewMetric(config: AppConfig, headers: Headers, access: Record<string, string[]> | undefined, metric: string): boolean {
  if (!config.showMetrics || !hasAllowedAccess(getUser(config, headers), config.metricsAccess)) return false
  return hasAllowedAccess(getUser(config, headers), access?.[metric] ?? [])
}

async function cardFromContainer(
  config: AppConfig,
  resolved: ResolvedContainer,
  hostId: string,
  showHost: boolean,
  hostColor: number
): Promise<Card | null> {
  const { container, name, labels, url } = resolved

  if (labels.hidden || !url) return null

  const title = labels.title || name
  const [icon, description] = await Promise.all([
    resolveIcon(config, { iconLabel: labels.icon, imageName: container.Image, title, containerName: name }),
    resolveCardDescription(config, labels.description, { imageName: container.Image, title, containerName: name })
  ])
  const customMetrics = selectedCustomMetrics(resolved)
  const metricErrors = selectedCustomMetricErrors(resolved)

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
    host: showHost ? hostId : undefined,
    hostColor: showHost ? hostColor : undefined,
    usesHostNetwork: container.HostConfig?.NetworkMode === 'host',
    resourceStats: labels.resourceStats ?? [...RESOURCE_STATS],
    metrics: labels.metrics,
    ...(customMetrics.length > 0 ? { customMetricLabels: customMetrics.map(([key, metric]) => ({ key, label: metric.label })) } : {}),
    metricProviders: labels.metricProviders,
    metricsPollIntervalMs: labels.metricsPollIntervalMs,
    metricsHistoryPeriodMs: labels.metricsHistoryPeriodMs,
    metricsAccess: labels.metricsAccess,
    ...(metricErrors.length > 0 ? { metricErrors } : {})
  }
}

async function cardFromYaml(
  config: AppConfig,
  name: string,
  service: ServiceOverrides,
  hostColor: number
): Promise<Card | null> {
  if (service.hidden || !service.url || !isValidUrl(service.url)) {
    return null
  }

  const title = service.title || name
  const [icon, description] = await Promise.all([
    resolveIcon(config, { iconLabel: service.icon, title, containerName: name }),
    resolveCardDescription(config, service.description, { title, containerName: name })
  ])
  const resolved = resolveYamlMetrics(service, service.url)
  const customMetrics = selectedCustomMetrics(resolved)
  const metricErrors = selectedCustomMetricErrors(resolved)

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
    metrics: service.metrics,
    ...(customMetrics.length > 0 ? { customMetricLabels: customMetrics.map(([key, metric]) => ({ key, label: metric.label })) } : {}),
    metricProviders: service.metricProviders,
    metricsPollIntervalMs: service.metricsPollIntervalMs,
    metricsHistoryPeriodMs: service.metricsHistoryPeriodMs,
    metricsAccess: service.metricsAccess,
    ...(metricErrors.length > 0 ? { metricErrors } : {})
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
  const yamlConfig = loadYamlConfig(config)
  if (yamlConfig.error) return { yamlServices: {}, containers: [], error: yamlConfig.error }

  const yamlServices = yamlConfig.config.services
  const { containers, error } = await fetchContainers(config)
  if (error) return { yamlServices, containers, error }

  return { yamlServices, containers }
}

export async function getContainerStatuses(
  config: AppConfig,
  headers: Headers
): Promise<{ statuses: Record<string, ContainerStatus>; error?: DashmarkError }> {
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
  const accessCards = resolvedContainers
    .filter(({ resolved }) => !resolved.labels.hidden && resolved.url !== undefined)
    .map(({ resolved }) => ({ access: resolved.labels.access }))
  const accessError = missingAccessIdentity(config, headers, accessCards)
  if (accessError) return { statuses: {}, error: accessError }

  const statusEntries = resolvedContainers.map(({ hostId, container, resolved }) => {
    if (!isVisibleContainer(config, headers, resolved)) return undefined

    return [`${hostId}:${container.Id}`, {
      state: container.State,
      health: parseHealth(container.Status)
    }] as const
  })

  const statuses: Record<string, ContainerStatus> = {}
  for (const entry of statusEntries) {
    if (entry) statuses[entry[0]] = entry[1]
  }

  return { statuses }
}

export type CollectedCustomMetric =
  | { key: string; label: string; unit: Extract<MetricOverride, { valueType: 'number' }>['unit']; chart: Extract<MetricOverride, { valueType: 'number' }>['chart']; chartGroup?: string; value: number }
  | { key: string; label: string; value: string }
  | { key: string; label: string; color: Extract<MetricOverride, { valueType: 'state' }>['color']; value: string }

export type ContainerMetricUsage = {
  resource?: ContainerResources
  historyPeriodMs: number
  customMetrics: CollectedCustomMetric[]
  metricErrors: { key: string; message: string }[]
  metricsAccess?: Record<string, string[]>
}

type SelectedCustomMetric = [key: string, metric: MetricOverride]
type ResolvedMetricCard = {
  labels: Pick<ParsedLabels, 'resourceStats' | 'metrics' | 'metricProviders' | 'metricsHistoryPeriodMs' | 'metricsAccess'>
  customMetrics?: ServiceMetricOverrides
  customMetricErrors?: Record<string, string>
}
type ResolvedMetricDetails = {
  resourceStats: readonly ResourceStat[]
  selectedMetrics: SelectedCustomMetric[]
  metricErrors: ContainerMetricUsage['metricErrors']
  historyPeriodMs: number
  metricsAccess?: Record<string, string[]>
}
type ContainerMetricSample = {
  cardId: string
  resource: ContainerResources | undefined
  customMetrics: CollectedCustomMetric[]
  metricErrors: ContainerMetricUsage['metricErrors']
  metricsPollIntervalMs: number
  metricsHistoryPeriodMs: number
}

function missingMetricProvider(key: string, providers: string[] | undefined): string | undefined {
  const [provider] = key.split('/', 2)
  return key.includes('/') && !providers?.includes(provider!) ? provider : undefined
}

function selectedCustomMetrics(resolved: ResolvedMetricCard): SelectedCustomMetric[] {
  if (!resolved.customMetrics || !resolved.labels.metrics) return []
  return resolved.labels.metrics.flatMap(key => {
    if (missingMetricProvider(key, resolved.labels.metricProviders)) return []
    const metric = resolved.customMetrics?.[key]
    return metric ? [[key, metric]] : []
  })
}

function selectedCustomMetricErrors(resolved: ResolvedMetricCard): { key: string; message: string }[] {
  if (!resolved.labels.metrics) return []
  return resolved.labels.metrics.flatMap(key => {
    const provider = missingMetricProvider(key, resolved.labels.metricProviders)
    if (provider) {
      return [{ key, message: `${key} requires metric_providers to include ${provider}` }]
    }
    const message = resolved.customMetricErrors?.[key]
    return message ? [{ key, message }] : []
  })
}

function metricDetails(resolved: ResolvedMetricCard, config: AppConfig, hasContainer = true): ResolvedMetricDetails {
  return {
    resourceStats: hasContainer ? resolved.labels.resourceStats ?? RESOURCE_STATS : [],
    selectedMetrics: selectedCustomMetrics(resolved),
    metricErrors: selectedCustomMetricErrors(resolved),
    historyPeriodMs: resolved.labels.metricsHistoryPeriodMs ?? config.metricsHistoryPeriodMs,
    metricsAccess: resolved.labels.metricsAccess
  }
}

function collectedCustomMetric(key: string, metric: MetricOverride, value: number | string): CollectedCustomMetric | undefined {
  if (metric.valueType === 'string' && typeof value === 'string') return { key, label: metric.label, value }
  if (metric.valueType === 'state' && typeof value === 'string') return { key, label: metric.label, color: metric.color, value }
  if (metric.valueType === 'number' && typeof value === 'number') {
    return { key, label: metric.label, unit: metric.unit, chart: metric.chart, ...(metric.chartGroup === undefined ? {} : { chartGroup: metric.chartGroup }), value }
  }
  return undefined
}

async function collectSelectedCustomMetrics(
  metrics: SelectedCustomMetric[],
  metricErrors: ContainerMetricUsage['metricErrors']
): Promise<Pick<ContainerMetricUsage, 'customMetrics' | 'metricErrors'>> {
  const results = await Promise.all(metrics.map(async ([key, metric]) => ({ key, metric, result: await collectCustomMetric(key, metric) })))
  const customMetrics: ContainerMetricUsage['customMetrics'] = []
  const collectedErrors = [...metricErrors]
  for (const { key, metric, result } of results) {
    if ('value' in result) {
      const collected = collectedCustomMetric(key, metric, result.value)
      if (collected) customMetrics.push(collected)
    }
    else collectedErrors.push({ key, message: result.error })
  }
  return { customMetrics, metricErrors: collectedErrors }
}

export async function getContainerMetricUsage(
  config: AppConfig,
  headers: Headers,
  cardId: string,
  collect = true
): Promise<ContainerMetricUsage | undefined> {
  if (!config.showMetrics || !hasAllowedAccess(getUser(config, headers), config.metricsAccess)) return undefined

  if (cardId.startsWith('yaml-')) {
    const name = cardId.slice('yaml-'.length)
    const { yamlServices, containers, error } = await loadServicesAndContainers(config)
    if (error) return undefined
    const service = yamlServices[name]
    if (!service || service.hidden || !service.url || !isValidUrl(service.url) || service.showStatus === false || !canAccess(config, headers, service.access ?? [])) return undefined
    if (containers.some(({ hostId, container }) => lookupYamlService(yamlServices, hostId, container).key === name)) return undefined

    const details = metricDetails(resolveYamlMetrics(service, service.url), config, false)
    const { selectedMetrics, metricErrors, historyPeriodMs, metricsAccess } = details
    if (selectedMetrics.length === 0 && metricErrors.length === 0) return undefined
    if (!collect) return { historyPeriodMs, customMetrics: [], metricErrors, metricsAccess }

    const collected = await collectSelectedCustomMetrics(selectedMetrics, metricErrors)
    if (collected.customMetrics.length === 0 && collected.metricErrors.length === 0) return undefined
    return { ...collected, historyPeriodMs, metricsAccess }
  }

  const host = configuredDockerHosts(config).find(candidate => cardId.startsWith(`${candidate.id}:`))
  if (!host) return undefined
  const containerId = cardId.slice(host.id.length + 1)
  if (!containerId) return undefined

  const yamlConfig = loadYamlConfig(config)
  if (yamlConfig.error) return undefined

  try {
    const containers = await getCachedContainers(host.dockerHost, DOCKER_STATUS_CACHE_TTL_MS)
    const container = containers.find(candidate => candidate.Id === containerId)
    if (!container || container.State !== 'running') return undefined

    const resolved = resolveContainer(yamlConfig.config.services, host.id, container)
    if (!isVisibleContainer(config, headers, resolved) || resolved.labels.showStatus === false) return undefined
    const details = metricDetails(resolved, config)
    const { resourceStats, selectedMetrics, metricErrors, historyPeriodMs, metricsAccess } = details
    if (resourceStats.length === 0 && selectedMetrics.length === 0 && metricErrors.length === 0) return undefined
    if (!collect) return { historyPeriodMs, customMetrics: [], metricErrors, metricsAccess }

    const [resource, collected] = await Promise.all([
      resourceStats.length > 0 ? getContainerResources(host.dockerHost, container.Id, resourceStats) : undefined,
      collectSelectedCustomMetrics(selectedMetrics, metricErrors)
    ])
    if (!resource && collected.customMetrics.length === 0 && collected.metricErrors.length === 0) return undefined
    return { resource, ...collected, historyPeriodMs, metricsAccess }
  } catch {
    return undefined
  }
}

export async function getContainerResourceUsage(
  config: AppConfig,
  headers: Headers,
  cardId: string
): Promise<ContainerResources | undefined> {
  return (await getContainerMetricUsage(config, headers, cardId))?.resource
}

export async function collectContainerResourceUsage(
  config: AppConfig,
  isDue: (cardId: string, pollIntervalMs: number) => boolean = () => true
): Promise<ContainerMetricSample[]> {
  if (!config.showMetrics) return []

  const yamlConfig = loadYamlConfig(config)
  if (yamlConfig.error) return []
  const samples: ContainerMetricSample[] = []
  const matchedYamlKeys = new Set<string>()

  await Promise.all(configuredDockerHosts(config).map(async host => {
    try {
      const containers = await getCachedContainers(host.dockerHost, DOCKER_STATUS_CACHE_TTL_MS)
      const results = await Promise.all(containers.map(async container => {
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
          collectSelectedCustomMetrics(selectedMetrics, [])
        ])
        if (!resource && collected.customMetrics.length === 0 && collected.metricErrors.length === 0) return undefined
        return {
          cardId,
          resource,
          customMetrics: collected.customMetrics,
          metricErrors: collected.metricErrors,
          metricsPollIntervalMs,
          metricsHistoryPeriodMs: historyPeriodMs
        }
      }))
      samples.push(...results.filter((sample): sample is ContainerMetricSample => sample !== undefined))
    } catch {
      // Resource metrics are optional, so an unavailable host does not affect the dashboard.
    }
  }))

  const standaloneSamples = await Promise.all(Object.entries(yamlConfig.config.services).map(async ([name, service]): Promise<ContainerMetricSample | undefined> => {
    if (matchedYamlKeys.has(name) || service.hidden || !service.url || !isValidUrl(service.url) || service.showStatus === false) return undefined
    const resolved = resolveYamlMetrics(service, service.url)
    const { selectedMetrics, historyPeriodMs } = metricDetails(resolved, config, false)
    if (selectedMetrics.length === 0) return undefined
    const cardId = `yaml-${name}`
    const metricsPollIntervalMs = service.metricsPollIntervalMs ?? config.metricsPollIntervalMs
    if (!isDue(cardId, metricsPollIntervalMs)) return undefined
    const collected = await collectSelectedCustomMetrics(selectedMetrics, [])
    if (collected.customMetrics.length === 0 && collected.metricErrors.length === 0) return undefined
    return {
      cardId,
      resource: undefined,
      customMetrics: collected.customMetrics,
      metricErrors: collected.metricErrors,
      metricsPollIntervalMs,
      metricsHistoryPeriodMs: historyPeriodMs
    }
  }))
  samples.push(...standaloneSamples.filter((sample): sample is ContainerMetricSample => sample !== undefined))

  return samples
}

async function buildAllCards(config: AppConfig): Promise<{ cards: Card[]; error?: DashmarkError }> {
  const { yamlServices, containers, error } = await loadServicesAndContainers(config)
  if (error) return { cards: [], error }

  const cards: Card[] = []
  const matchedKeys = new Set<string>()
  const hostIds = [...new Set(containers.map(({ hostId }) => hostId))]
  const yamlHostNames = [...new Set(Object.values(yamlServices).flatMap(service => service.host ? [service.host] : []))]
  const showHost = hostIds.length > 1
  const hostColors = new Map([...new Set([...hostIds, ...yamlHostNames])].map((hostId, index) => [hostId, index]))

  for (const { hostId, container } of containers) {
    const resolved = resolveContainer(yamlServices, hostId, container)
    const card = await cardFromContainer(config, resolved, hostId, showHost, hostColors.get(hostId) ?? 0)
    if (card) cards.push(card)

    if (resolved.yamlKey) matchedKeys.add(resolved.yamlKey)
  }

  for (const [name, yamlService] of Object.entries(yamlServices)) {
    if (matchedKeys.has(name)) continue
    const card = await cardFromYaml(config, name, yamlService, hostColors.get(yamlService.host ?? '') ?? 0)
    if (card) cards.push(card)
  }

  return { cards: sortCards(cards) }
}

export async function getCards(
  config: AppConfig,
  headers: Headers
): Promise<{ cards: Card[]; usesAccessControl: boolean; error?: DashmarkError }> {
  const { cards: allCards, error } = await buildAllCards(config)
  if (error) return { cards: [], usesAccessControl: false, error }

  const usesAccessControl = allCards.some(card => card.access.length > 0)
  const accessError = missingAccessIdentity(config, headers, allCards)
  if (accessError) return { cards: [], usesAccessControl, error: accessError }
  return { cards: filterCardsByAccess(allCards, config, headers), usesAccessControl }
}
