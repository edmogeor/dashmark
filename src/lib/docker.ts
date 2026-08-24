import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import type { AppConfig } from './config'
import type { ServiceOverrides } from './config-file'
import { loadYamlConfig } from './config-file'
import { parseLabels, isValidUrl, traefikUrl, hasDashmarkLabels, type ParsedLabels } from './labels'
import { resolveIcon, type IconResult } from './icons'
import { resolveDescription } from './descriptions'
import { groupHeaderNames, readUserGroups } from './auth'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { dashmarkError, errorMessage, isRecord, type DashmarkError } from './errors'
import { strings } from './strings'
import type { ContainerStatus } from './status'
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

async function fetchContainers(config: AppConfig): Promise<{ containers: DockerContainer[]; error?: DashmarkError }> {
  try {
    const containers = await getCachedContainers(config.dockerHost, DOCKER_STATUS_CACHE_TTL_MS)
    return { containers }
  } catch (error) {
    const message = errorMessage(error)
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
  container: DockerContainer
): { key?: string; service?: ServiceOverrides } {
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
  yamlService?: ServiceOverrides
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
    showStatus: yamlService.showStatus ?? labels.showStatus,
    accessGroups: yamlService.accessGroups ?? labels.accessGroups,
    searchAliases: yamlService.searchAliases ?? labels.searchAliases
  }
}

function groupsIntersect(cardGroups: string[], userGroups: string[]): boolean {
  if (cardGroups.length === 0) return true
  const lowerUser = new Set(userGroups.map(g => g.toLowerCase()))
  return cardGroups.some(g => lowerUser.has(g.toLowerCase()))
}

function resolveCardDescription(
  config: AppConfig,
  description: string | undefined,
  options: Parameters<typeof resolveDescription>[1]
): string | undefined {
  if (description?.trim().toLowerCase() === 'none') return undefined
  return description ?? resolveDescription(config, options)
}

function filterCardsByAccessGroups(cards: Card[], userGroups: string[]): Card[] {
  return cards.filter(card => groupsIntersect(card.accessGroups, userGroups))
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
  url?: string
}

function resolveContainer(
  yamlServices: Record<string, ServiceOverrides>,
  container: DockerContainer
): ResolvedContainer {
  const { key: yamlKey, service: yamlService } = lookupYamlService(yamlServices, container)
  const rawLabels = container.Labels ?? {}
  const labels = mergeWithYaml(parseLabels(rawLabels), yamlService)

  return {
    container,
    name: containerName(container),
    yamlKey,
    labels,
    url: resolveCardUrl(labels.url, rawLabels, yamlService !== undefined || hasDashmarkLabels(rawLabels))
  }
}

function isVisibleContainer({ labels, url }: ResolvedContainer, userGroups: string[]): boolean {
  return !labels.hidden && url !== undefined && groupsIntersect(labels.accessGroups, userGroups)
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
  resolved: ResolvedContainer
): Promise<Card | null> {
  const { container, name, labels, url } = resolved

  if (labels.hidden || !url) return null

  const title = labels.title || name
  const [icon, description] = await Promise.all([
    resolveIcon(config, { iconLabel: labels.icon, imageName: container.Image, title, containerName: name }),
    resolveCardDescription(config, labels.description, { imageName: container.Image, title, containerName: name })
  ])

  return {
    id: container.Id,
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
    accessGroups: labels.accessGroups
  }
}

async function cardFromYaml(
  config: AppConfig,
  name: string,
  service: ServiceOverrides
): Promise<Card | null> {
  if (service.hidden || !service.url || !isValidUrl(service.url)) {
    return null
  }

  const title = service.title || name
  const [icon, description] = await Promise.all([
    resolveIcon(config, { iconLabel: service.icon, title, containerName: name }),
    resolveCardDescription(config, service.description, { title, containerName: name })
  ])

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
    accessGroups: service.accessGroups ?? []
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
    const resolved = resolveContainer(yamlServices, container)
    if (!isVisibleContainer(resolved, userGroups)) continue

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
    const resolved = resolveContainer(yamlServices, container)
    const card = await cardFromContainer(config, resolved)
    if (card) cards.push(card)

    if (resolved.yamlKey) matchedKeys.add(resolved.yamlKey)
  }

  for (const [name, yamlService] of Object.entries(yamlServices)) {
    if (matchedKeys.has(name)) continue
    const card = await cardFromYaml(config, name, yamlService)
    if (card) cards.push(card)
  }

  return { cards: sortCards(cards) }
}

export async function getCards(
  config: AppConfig,
  headers: Headers
): Promise<{ cards: Card[]; usesAccessGroups: boolean; error?: DashmarkError }> {
  const { groups: userGroups, error: userGroupsError } = getUserGroups(config, headers)
  if (userGroupsError) return { cards: [], usesAccessGroups: false, error: userGroupsError }

  const { cards: allCards, error } = await buildAllCards(config)
  if (error) return { cards: [], usesAccessGroups: false, error }

  const usesAccessGroups = allCards.some(card => card.accessGroups.length > 0)
  return { cards: filterCardsByAccessGroups(allCards, userGroups), usesAccessGroups }
}
