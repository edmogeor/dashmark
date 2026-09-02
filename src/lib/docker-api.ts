import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import { DOCKER_API_FALLBACK_VERSION, DOCKER_MAX_RESPONSE_BYTES, DOCKER_PLAIN_PORT, DOCKER_REQUEST_TIMEOUT_MS, DOCKER_TLS_PORT } from './constants'
import { errorMessage, isRecord } from './errors'
import { logger } from './logger'
import { logMessages } from './log-messages'

export type DockerContainer = {
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

export type DockerHost = {
  socketPath?: string
  hostname?: string
  port?: number
  secure?: boolean
}

export type DockerStats = {
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

export function isDockerContainer(value: unknown): value is DockerContainer {
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

function networkBytes(networks: unknown[], field: 'rx_bytes' | 'tx_bytes'): number | undefined {
  return networks.reduce<number | undefined>(
    (total, network) => {
      const bytes = isRecord(network) ? number(network[field]) : undefined
      return total === undefined || bytes === undefined ? undefined : total + bytes
    },
    networks.length > 0 ? 0 : undefined
  )
}

export function parseDockerStats(value: unknown): DockerStats | undefined {
  if (!isRecord(value) || !isRecord(value.cpu_stats) || !isRecord(value.precpu_stats)) return undefined
  const cpuUsage = isRecord(value.cpu_stats.cpu_usage) ? value.cpu_stats.cpu_usage : undefined
  const previousCpuUsage = isRecord(value.precpu_stats.cpu_usage) ? value.precpu_stats.cpu_usage : undefined
  const totalUsage = number(cpuUsage?.total_usage)
  const previousTotalUsage = number(previousCpuUsage?.total_usage)
  const systemUsage = number(value.cpu_stats.system_cpu_usage)
  const previousSystemUsage = number(value.precpu_stats.system_cpu_usage)
  if (totalUsage === undefined || previousTotalUsage === undefined || systemUsage === undefined || previousSystemUsage === undefined) return undefined

  const perCpuUsage = cpuUsage?.percpu_usage
  const cpuCount = Array.isArray(perCpuUsage) ? perCpuUsage.length : 1
  const onlineCpus = number(value.cpu_stats.online_cpus)
  const memoryStats = isRecord(value.memory_stats) ? value.memory_stats : undefined
  const networks = isRecord(value.networks) ? Object.values(value.networks) : []
  const receivedBytes = networkBytes(networks, 'rx_bytes')
  const sentBytes = networkBytes(networks, 'tx_bytes')
  return {
    cpuStats: { totalUsage, systemUsage, onlineCpus, cpuCount },
    previousCpuStats: { totalUsage: previousTotalUsage, systemUsage: previousSystemUsage },
    memoryUsage: number(memoryStats?.usage),
    memoryLimit: number(memoryStats?.limit),
    receivedBytes,
    sentBytes
  }
}

export function parseDockerHost(dockerHost: string): DockerHost {
  if (dockerHost.startsWith('unix://')) return { socketPath: dockerHost.slice('unix://'.length) }
  if (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://') || dockerHost.startsWith('https://')) {
    const url = new URL(dockerHost.replace(/^tcp:/, 'http:'))
    const secure = url.protocol === 'https:'
    return { hostname: url.hostname, port: url.port ? parseInt(url.port, 10) : secure ? DOCKER_TLS_PORT : DOCKER_PLAIN_PORT, secure }
  }
  return { socketPath: dockerHost }
}

const apiVersionCache = new Map<string, string>()

async function rawDockerRequest(dockerHost: string, path: string, apiVersion?: string): Promise<unknown> {
  const host = parseDockerHost(dockerHost)
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = { method: 'GET', path: apiVersion ? `/v${apiVersion}${path}` : path }
    if (host.socketPath) options.socketPath = host.socketPath
    else if (host.hostname && host.port) {
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
        } else reject(new Error(`Docker API ${options.path} returned ${res.statusCode}: ${data}`))
      })
    })
    req.on('error', reject)
    req.setTimeout(DOCKER_REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`Docker API request timed out after ${DOCKER_REQUEST_TIMEOUT_MS}ms`)))
    req.end()
  })
}

export async function getDockerApiVersion(dockerHost: string): Promise<string> {
  const cachedVersion = apiVersionCache.get(dockerHost)
  if (cachedVersion) return cachedVersion
  try {
    const data = await rawDockerRequest(dockerHost, '/version')
    if (!isRecord(data) || typeof data.ApiVersion !== 'string') throw new Error('Docker API version response had an invalid format')
    apiVersionCache.set(dockerHost, data.ApiVersion)
    return data.ApiVersion
  } catch (error) {
    const fallback = DOCKER_API_FALLBACK_VERSION
    logger.warn('docker', logMessages.docker.apiVersionFallback, { dockerHost, fallback, error: errorMessage(error) })
    apiVersionCache.set(dockerHost, fallback)
    return fallback
  }
}

export async function dockerRequest(dockerHost: string, path: string): Promise<unknown> {
  return rawDockerRequest(dockerHost, path, await getDockerApiVersion(dockerHost))
}

export function clearDockerApiCache(): void {
  apiVersionCache.clear()
}
