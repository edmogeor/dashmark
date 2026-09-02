import http from 'node:http'
import https from 'node:https'
import type { AppConfig, DockerHostConfig } from './config'
import { loadYamlConfig } from './config-file'
import type { ServiceOverrides } from './config-file-types'
import { isValidUrl, RESOURCE_STATS, type ResourceStat } from './labels'
import { clearDockerApiCache, dockerRequest, getDockerApiVersion, isDockerContainer, parseDockerHost, type DockerContainer } from './docker-api'
import { lookupYamlService, resolveContainer, resolveYamlMetrics, type ResolvedContainer } from './docker-card-resolution'
import { resolveIcon, type IconResult } from './icons'
import { resolveDescription } from './descriptions'
import { getUser, hasAllowedAccess } from './auth'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { dashmarkError, errorMessage, isRecord, type DashmarkError } from './errors'
import { strings } from '@/i18n'
import type { ContainerResources, ContainerStatus } from './status'
import { DOCKER_STATUS_CACHE_TTL_MS, DOCKER_EVENT_RECONNECT_DELAY_MS } from './constants'
import { metricCardFields } from './metric-collection/details'
import { clearMetricCollectionCache, dockerMetricTarget, type MetricCollectionTarget, usageForTarget, yamlMetricTarget } from './metric-collection/target-plan'
export type { ContainerMetricSample, ContainerMetricUsage } from './metric-collection/types'
import type { ContainerMetricSample, ContainerMetricUsage } from './metric-collection/types'

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

type DiscoveredContainer = {
  hostId: string
  container: DockerContainer
}

type Timestamped<T> = { data: T; timestamp: number }
const containerListCache = new Map<string, Timestamped<DockerContainer[]>>()

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
  clearDockerApiCache()
  containerListCache.clear()
  clearMetricCollectionCache()
  discoveredMetricTargets.clear()
}

function parseHealth(status: string): string | undefined {
  if (status.includes('(healthy)')) return 'healthy'
  if (status.includes('(unhealthy)')) return 'unhealthy'
  if (status.includes('(health: starting)')) return 'starting'
  return undefined
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

const discoveredMetricTargets = new Map<string, MetricCollectionTarget>()
const MAX_DUE_CARD_COLLECTIONS = 8

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

  const planned = yamlMetricTarget(config, name, service, resolveYamlMetrics(service, service.url))
  return planned && usageForTarget(planned.target, planned.details, collect)
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
    const planned = dockerMetricTarget(config, cardId, host.dockerHost, container, resolved)
    return planned && usageForTarget(planned.target, planned.details, collect)
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
            const cardId = `${host.id}:${container.Id}`
            const planned = dockerMetricTarget(config, cardId, host.dockerHost, container, resolved)
            return planned && isDue(cardId, planned.target.metricsPollIntervalMs) ? planned.target.collect() : undefined
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
      const planned = yamlMetricTarget(config, name, service, resolveYamlMetrics(service, service.url))
      return planned && isDue(planned.target.cardId, planned.target.metricsPollIntervalMs) ? planned.target.collect() : undefined
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
    const planned = dockerMetricTarget(
      config,
      `${hostId}:${container.Id}`,
      configuredDockerHosts(config).find((candidate) => candidate.id === hostId)?.dockerHost ?? config.dockerHost,
      container,
      resolved
    )
    if (planned) metricTargets.set(planned.target.cardId, planned.target)

    if (resolved.yamlKey) matchedKeys.add(resolved.yamlKey)
  }

  for (const [name, yamlService] of Object.entries(yamlServices)) {
    if (matchedKeys.has(name)) continue
    const card = await cardFromYaml(config, name, yamlService, hostColors.get(yamlService.host ?? '') ?? 0)
    if (card) cards.push(card)
    const planned = yamlService.url ? yamlMetricTarget(config, name, yamlService, resolveYamlMetrics(yamlService, yamlService.url)) : undefined
    if (planned) metricTargets.set(planned.target.cardId, planned.target)
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
