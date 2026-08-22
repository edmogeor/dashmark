import { isDashmarkError, isRecord, type DashmarkError } from './errors'

export type ContainerStatus = {
  state?: string
  health?: string
}

export type StatusResponse =
  | { statuses: Record<string, ContainerStatus> }
  | { error: DashmarkError }

function isContainerStatus(value: unknown): value is ContainerStatus {
  return isRecord(value)
    && (value.state === undefined || typeof value.state === 'string')
    && (value.health === undefined || typeof value.health === 'string')
}

export function isStatusResponse(value: unknown): value is StatusResponse {
  if (!isRecord(value)) return false
  if ('error' in value) return isDashmarkError(value.error)
  return 'statuses' in value
    && isRecord(value.statuses)
    && Object.values(value.statuses).every(isContainerStatus)
}
