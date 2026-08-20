export type ErrorCode =
  | 'DOCKER_UNREACHABLE'
  | 'CONFIG_INVALID'
  | 'MISSING_GROUPS_HEADER'

export type DashmarkError = {
  code: ErrorCode
  message: string
  retryable: boolean
  detail?: string
}

export function dashmarkError(
  code: ErrorCode,
  message: string,
  retryable = false,
  detail?: string
): DashmarkError {
  return { code, message, retryable, detail }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
