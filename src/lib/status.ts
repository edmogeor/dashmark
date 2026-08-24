import { isDashmarkError, isRecord, type DashmarkError } from './errors'

export type ContainerStatus = {
  state?: string
  health?: string
}

export type ContainerResources = {
  cpuPercent?: number
  memoryUsage?: number
  memoryLimit?: number
  receivedBytesPerSecond?: number
  sentBytesPerSecond?: number
}

export type StatusResponse =
  | { statuses: Record<string, ContainerStatus> }
  | { error: DashmarkError }

export type ResourceUsageResponse = { resource: ContainerResources | null }

function isContainerStatus(value: unknown): value is ContainerStatus {
  return isRecord(value)
    && (value.state === undefined || typeof value.state === 'string')
    && (value.health === undefined || typeof value.health === 'string')
    && !('cpuPercent' in value)
    && !('memoryUsage' in value)
    && !('memoryLimit' in value)
    && !('receivedBytesPerSecond' in value)
    && !('sentBytesPerSecond' in value)
}

function isContainerResources(value: unknown): value is ContainerResources {
  return isRecord(value)
    && (value.cpuPercent === undefined || typeof value.cpuPercent === 'number')
    && (value.memoryUsage === undefined || typeof value.memoryUsage === 'number')
    && (value.memoryLimit === undefined || typeof value.memoryLimit === 'number')
    && (value.receivedBytesPerSecond === undefined || typeof value.receivedBytesPerSecond === 'number')
    && (value.sentBytesPerSecond === undefined || typeof value.sentBytesPerSecond === 'number')
}

export function isResourceUsageResponse(value: unknown): value is ResourceUsageResponse {
  return isRecord(value) && 'resource' in value
    && (value.resource === null || isContainerResources(value.resource))
}

export function isStatusResponse(value: unknown): value is StatusResponse {
  if (!isRecord(value)) return false
  if ('error' in value) return isDashmarkError(value.error)
  return 'statuses' in value
    && isRecord(value.statuses)
    && Object.values(value.statuses).every(isContainerStatus)
}
