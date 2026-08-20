import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import type { AppConfig } from './config'
import type { YamlService } from './config-file'
import { loadYamlConfig } from './config-file'
import { parseLabels, isValidUrl, traefikUrl } from './labels'
import { resolveIcon, type IconResult } from './icons'
import { groupHeaderNames, readUserGroups } from './auth'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { dashmarkError, type DashmarkError } from './errors'
import { strings } from './strings'

export type Card = {
  id: string
  title: string
  description?: string
  url: string
  icon: IconResult
  category?: string
  order?: number
  state?: string
  health?: string
  searchAliases: string[]
  hasContainer: boolean
  accessGroups: string[]
}

type DockerContainer = {
  Id: string
  Names?: string[]
  Image: string
  ImageID: string
  State: string
  Status: string
  Labels?: Record<string, string>
}

type DockerHost = {
  socketPath?: string
  hostname?: string
  port?: number
  secure?: boolean
}

function parseDockerHost(dockerHost: string): DockerHost {
  if (dockerHost.startsWith('unix://')) {
    return { socketPath: dockerHost.slice('unix://'.length) }
  }

  if (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://') || dockerHost.startsWith('https://')) {
    const url = new URL(dockerHost.replace(/^tcp:/, 'http:'))
    const secure = url.protocol === 'https:'
    const defaultPort = secure ? 2376 : 2375
    return {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : defaultPort,
      secure
    }
  }

  return { socketPath: dockerHost }
}

const apiVersionCache = new Map<string, string>()

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024
const STATUS_CACHE_TTL_MS = 30_000

type Timestamped<T> = { data: T; timestamp: number }
const containerListCache = new Map<string, Timestamped<DockerContainer[]>>()
const allCardsCache = new Map<string, Promise<{ cards: Card[]; error?: DashmarkError }>>()

function allCardsCacheKey(config: AppConfig): string {
  return [config.dockerHost, config.configFile, config.iconsDir].join('\0')
}

async function rawDockerRequest<T>(
  dockerHost: string,
  path: string,
  apiVersion?: string
): Promise<T> {
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
        if (responseBytes > MAX_RESPONSE_BYTES) {
          req.destroy(new Error(`Docker API response exceeded ${MAX_RESPONSE_BYTES} bytes`))
          return
        }
        data += chunk
      })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data) as T)
          } catch {
            resolve(data as unknown as T)
          }
        } else {
          reject(new Error(`Docker API ${options.path} returned ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Docker API request timed out after ${REQUEST_TIMEOUT_MS}ms`))
    })
    req.end()
  })
}

async function getDockerApiVersion(dockerHost: string): Promise<string> {
  if (apiVersionCache.has(dockerHost)) {
    return apiVersionCache.get(dockerHost)!
  }

  try {
    const version = (await rawDockerRequest<{ ApiVersion: string }>(dockerHost, '/version'))
      .ApiVersion
    apiVersionCache.set(dockerHost, version)
    return version
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const fallback = '1.41'
    logger.warn('docker', logMessages.docker.apiVersionFallback, {
      dockerHost,
      fallback,
      error: message
    })
    apiVersionCache.set(dockerHost, fallback)
    return fallback
  }
}

async function dockerRequest<T>(dockerHost: string, path: string): Promise<T> {
  const apiVersion = await getDockerApiVersion(dockerHost)
  return rawDockerRequest<T>(dockerHost, path, apiVersion)
}

async function listContainers(dockerHost: string): Promise<DockerContainer[]> {
  return dockerRequest<DockerContainer[]>(dockerHost, '/containers/json?all=1')
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

async function fetchContainers(config: AppConfig): Promise<{ containers: DockerContainer[]; error?: DashmarkError }> {
  try {
    const containers = await getCachedContainers(config.dockerHost, STATUS_CACHE_TTL_MS)
    return { containers }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('docker', logMessages.docker.listContainersFailed, {
      dockerHost: config.dockerHost,
      error: message
    })
    return {
      containers: [],
      error: dashmarkError(
        'DOCKER_UNREACHABLE',
        strings.errors.dockerUnreachable,
        true,
        message
      )
    }
  }
}

export function clearDockerCache() {
  apiVersionCache.clear()
  containerListCache.clear()
  allCardsCache.clear()
}

export function clearDockerApiVersionCache() {
  clearDockerCache()
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

const COMPOSE_SERVICE_LABEL = 'com.docker.compose.service'

function lookupYamlService(
  yamlServices: Record<string, YamlService>,
  container: DockerContainer
): { key?: string; service?: YamlService } {
  const name = containerName(container)
  if (yamlServices[name]) return { key: name, service: yamlServices[name] }

  const composeService = container.Labels?.[COMPOSE_SERVICE_LABEL]
  if (composeService && yamlServices[composeService]) {
    return { key: composeService, service: yamlServices[composeService] }
  }

  return {}
}

function mergeWithYaml(
  labels: ReturnType<typeof parseLabels>,
  yamlService?: YamlService
): ReturnType<typeof parseLabels> {
  if (!yamlService) return labels

  return {
    hidden: yamlService.hidden ?? labels.hidden,
    url: yamlService.url ?? labels.url,
    title: yamlService.title ?? labels.title,
    description: yamlService.description ?? labels.description,
    icon: yamlService.icon ?? labels.icon,
    category: yamlService.category ?? labels.category,
    order: yamlService.order ?? labels.order,
    accessGroups: yamlService.access_groups ?? labels.accessGroups,
    searchAliases: yamlService.search_aliases ?? labels.searchAliases
  }
}

function groupsIntersect(cardGroups: string[], userGroups: string[]): boolean {
  if (cardGroups.length === 0) return true
  const lowerUser = new Set(userGroups.map(g => g.toLowerCase()))
  return cardGroups.some(g => lowerUser.has(g.toLowerCase()))
}

function filterCardsByAccessGroups(cards: Card[], userGroups: string[]): Card[] {
  return cards.filter(card => groupsIntersect(card.accessGroups, userGroups))
}

function resolveCardUrl(primaryUrl: string | undefined, labels: Record<string, string>): string | undefined {
  if (primaryUrl && isValidUrl(primaryUrl)) return primaryUrl
  const derived = traefikUrl(labels)
  return derived && isValidUrl(derived) ? derived : undefined
}

export function addAccessGroupVaryHeader(headers: Headers, config: AppConfig): void {
  if (!config.enableAccessGroups) return
  headers.set('Vary', groupHeaderNames(config).join(', '))
}

function getUserGroups(config: AppConfig, headers: Headers): { groups: string[]; error?: DashmarkError } {
  if (!config.enableAccessGroups) return { groups: [] }

  const { groups, found } = readUserGroups(config, headers)
  if (found) return { groups }

  const expected = groupHeaderNames(config).join(', ')
  logger.error('docker', logMessages.docker.missingAccessGroupsHeader, { expected })
  return {
    groups: [],
    error: dashmarkError(
      'MISSING_GROUPS_HEADER',
      strings.errors.missingGroupsHeader,
      false,
      strings.errors.expectedHeader(expected)
    )
  }
}

async function cardFromContainer(
  config: AppConfig,
  container: DockerContainer,
  yamlService: YamlService | undefined
): Promise<Card | null> {
  const name = containerName(container)
  const labels = mergeWithYaml(parseLabels(container.Labels ?? {}), yamlService)
  const url = resolveCardUrl(labels.url, container.Labels ?? {})

  if (labels.hidden || !url) return null

  const title = labels.title || name
  const icon = await resolveIcon(config, {
    iconLabel: labels.icon,
    imageName: container.Image,
    title,
    containerName: name
  })

  return {
    id: container.Id,
    title,
    description: labels.description,
    url,
    icon,
    category: labels.category,
    order: labels.order,
    state: container.State,
    health: parseHealth(container.Status),
    searchAliases: labels.searchAliases,
    hasContainer: true,
    accessGroups: labels.accessGroups
  }
}

async function cardFromYaml(
  config: AppConfig,
  name: string,
  service: YamlService
): Promise<Card | null> {
  if (service.hidden || !service.url || !isValidUrl(service.url)) {
    return null
  }

  const title = service.title || name
  const icon = await resolveIcon(config, {
    iconLabel: service.icon,
    title,
    containerName: name
  })

  return {
    id: `yaml-${name}`,
    title,
    description: service.description,
    url: service.url,
    icon,
    category: service.category,
    order: service.order,
    searchAliases: service.search_aliases ?? [],
    hasContainer: false,
    accessGroups: service.access_groups ?? []
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

type ContainerStatus = {
  state?: string
  health?: string
}

type LoadedServices = {
  yamlServices: Record<string, YamlService>
  containers: DockerContainer[]
  error?: DashmarkError
}

async function loadServicesAndContainers(config: AppConfig): Promise<LoadedServices> {
  const yamlConfig = loadYamlConfig(config)
  if (yamlConfig.error) return { yamlServices: {}, containers: [], error: yamlConfig.error }

  const yamlServices = yamlConfig.config
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

  const { groups: userGroups, error } = getUserGroups(config, headers)
  if (error) return { statuses: {}, error }

  const { yamlServices, containers, error: loadError } = await loadServicesAndContainers(config)
  if (loadError) return { statuses: {}, error: loadError }

  const statuses: Record<string, ContainerStatus> = {}
  for (const container of containers) {
    const { service } = lookupYamlService(yamlServices, container)
    const labels = mergeWithYaml(parseLabels(container.Labels ?? {}), service)
    if (labels.hidden || !groupsIntersect(labels.accessGroups, userGroups)) continue

    statuses[container.Id] = {
      state: container.State,
      health: parseHealth(container.Status)
    }
  }

  return { statuses }
}

async function buildAllCards(config: AppConfig): Promise<{ cards: Card[]; error?: DashmarkError }> {
  const { yamlServices, containers, error } = await loadServicesAndContainers(config)
  if (error) return { cards: [], error }

  const matchedKeys = new Set<string>()
  const cards: Card[] = []

  for (const container of containers) {
    const { key, service } = lookupYamlService(yamlServices, container)
    const card = await cardFromContainer(config, container, service)
    if (card) cards.push(card)

    if (key) matchedKeys.add(key)
  }

  for (const [name, yamlService] of Object.entries(yamlServices)) {
    if (matchedKeys.has(name)) continue
    const card = await cardFromYaml(config, name, yamlService)
    if (card) cards.push(card)
  }

  return { cards: sortCards(cards) }
}

function getAllCards(config: AppConfig): Promise<{ cards: Card[]; error?: DashmarkError }> {
  const key = allCardsCacheKey(config)
  let promise = allCardsCache.get(key)
  if (!promise) {
    promise = buildAllCards(config).then(result => {
      if (result.error) allCardsCache.delete(key)
      return result
    })
    allCardsCache.set(key, promise)
  }
  return promise
}

export async function getCards(
  config: AppConfig,
  headers: Headers
): Promise<{ cards: Card[]; error?: DashmarkError }> {
  const { groups: userGroups, error: userGroupsError } = getUserGroups(config, headers)
  if (userGroupsError) return { cards: [], error: userGroupsError }

  const { cards: allCards, error } = await getAllCards(config)
  if (error) return { cards: [], error }

  return { cards: filterCardsByAccessGroups(allCards, userGroups) }
}
