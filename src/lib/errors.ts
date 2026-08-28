export type ErrorCode = 'DOCKER_UNREACHABLE' | 'CONFIG_INVALID' | 'MISSING_GROUPS_HEADER'

export type DashmarkError = {
  code: ErrorCode
  message: string
  retryable: boolean
  detail?: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isErrorCode(value: unknown): value is ErrorCode {
  return value === 'DOCKER_UNREACHABLE' || value === 'CONFIG_INVALID' || value === 'MISSING_GROUPS_HEADER'
}

export function isDashmarkError(value: unknown): value is DashmarkError {
  return isRecord(value) && isErrorCode(value.code) && typeof value.message === 'string' && typeof value.retryable === 'boolean' && (value.detail === undefined || typeof value.detail === 'string')
}

export function dashmarkError(code: ErrorCode, message: string, retryable = false, detail?: string): DashmarkError {
  return { code, message, retryable, detail }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
