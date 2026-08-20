import { timingSafeEqual } from 'node:crypto'
import type { AppConfig } from './config'
import {
  AUTO_ACCESS_GROUPS_HEADER,
  AUTO_GROUP_HEADERS,
  AUTO_NAME_HEADERS,
  AUTO_FIRST_NAME_HEADERS,
  AUTO_LAST_NAME_HEADERS,
  AUTO_USERNAME_HEADERS,
  AUTO_EMAIL_HEADERS,
  AUTH_TOKEN_HEADER
} from './constants'

export type AuthUser = {
  name?: string
  username?: string
  email?: string
  firstName?: string
  lastName?: string
  groups: string[]
}

export function groupHeaderNames(config: AppConfig): string[] {
  return config.accessGroupsHeader === AUTO_ACCESS_GROUPS_HEADER
    ? AUTO_GROUP_HEADERS
    : [config.accessGroupsHeader]
}

export function parseUserGroups(headerValue: string | null | undefined): string[] {
  if (!headerValue) return []
  return headerValue
    .split(/[,;|]/)
    .map(g => g.trim())
    .filter(Boolean)
}

function firstHeader(headers: Headers, names: string[]): string | undefined {
  for (const name of names) {
    const value = headers.get(name)?.trim()
    if (value) return value
  }
  return undefined
}

export function getUserName(headers: Headers): string | undefined {
  return firstHeader(headers, AUTO_NAME_HEADERS)
}

export function getUserFirstName(headers: Headers): string | undefined {
  return firstHeader(headers, AUTO_FIRST_NAME_HEADERS)
}

export function getUserLastName(headers: Headers): string | undefined {
  return firstHeader(headers, AUTO_LAST_NAME_HEADERS)
}

export function getUserUsername(headers: Headers): string | undefined {
  return firstHeader(headers, AUTO_USERNAME_HEADERS)
}

export function getUserEmail(headers: Headers): string | undefined {
  return firstHeader(headers, AUTO_EMAIL_HEADERS)
}

function splitName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  const firstName = parts[0]
  const lastName = parts.length > 1 ? parts[parts.length - 1] : undefined
  return { firstName, lastName }
}

export function readUserGroups(config: AppConfig, headers: Headers): { groups: string[]; found: boolean } {
  for (const name of groupHeaderNames(config)) {
    const value = headers.get(name)
    if (value) return { groups: parseUserGroups(value), found: true }
  }
  return { groups: [], found: false }
}

export function isAuthorized(request: Request, authToken: string | undefined): boolean {
  if (!authToken) return true
  const expected = Buffer.from(authToken)
  const provided = Buffer.from(request.headers.get(AUTH_TOKEN_HEADER) ?? '')
  return expected.length === provided.length && timingSafeEqual(expected, provided)
}

export function getUser(config: AppConfig, headers: Headers): AuthUser {
  const name = getUserName(headers)
  const { firstName: splitFirst, lastName: splitLast } = name ? splitName(name) : {}

  return {
    name,
    username: getUserUsername(headers),
    email: getUserEmail(headers),
    firstName: getUserFirstName(headers) ?? splitFirst,
    lastName: getUserLastName(headers) ?? splitLast,
    groups: readUserGroups(config, headers).groups
  }
}
