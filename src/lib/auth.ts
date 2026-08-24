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
  const value = headerValue?.trim()
  if (!value) return []

  if (value.startsWith('[')) {
    try {
      const groups = JSON.parse(value)
      if (Array.isArray(groups) && groups.every(group => typeof group === 'string')) {
        return groups.map(group => group.trim()).filter(Boolean)
      }
    } catch {}
  }

  return value.split(/[,;|]/).map(group => group.trim()).filter(Boolean)
}

export function hasAllowedAccess(user: Pick<AuthUser, 'groups' | 'username' | 'email'>, allowedAccess: string[]): boolean {
  if (allowedAccess.length === 0) return true
  const identities = [...user.groups, user.username, user.email]
    .filter((identity): identity is string => Boolean(identity))
    .map(identity => identity.toLowerCase())
  const allowed = new Set(allowedAccess.map(entry => entry.toLowerCase()))
  return identities.some(identity => allowed.has(identity))
}

function firstHeader(headers: Headers, names: string[], override?: string): string | undefined {
  for (const name of override ? [override] : names) {
    const value = headers.get(name)?.trim()
    if (value) return value
  }
  return undefined
}

export function getUserName(headers: Headers, override?: string): string | undefined {
  return firstHeader(headers, AUTO_NAME_HEADERS, override)
}

export function getUserFirstName(headers: Headers, override?: string): string | undefined {
  return firstHeader(headers, AUTO_FIRST_NAME_HEADERS, override)
}

export function getUserLastName(headers: Headers, override?: string): string | undefined {
  return firstHeader(headers, AUTO_LAST_NAME_HEADERS, override)
}

export function getUserUsername(headers: Headers, override?: string): string | undefined {
  return firstHeader(headers, AUTO_USERNAME_HEADERS, override)
}

export function getUserEmail(headers: Headers, override?: string): string | undefined {
  return firstHeader(headers, AUTO_EMAIL_HEADERS, override)
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
    const value = headers.get(name)?.trim()
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
  const name = getUserName(headers, config.userNameHeader)
  const { firstName: splitFirst, lastName: splitLast } = name ? splitName(name) : {}

  return {
    name,
    username: getUserUsername(headers, config.userUsernameHeader),
    email: getUserEmail(headers, config.userEmailHeader),
    firstName: getUserFirstName(headers, config.userFirstNameHeader) ?? splitFirst,
    lastName: getUserLastName(headers, config.userLastNameHeader) ?? splitLast,
    groups: readUserGroups(config, headers).groups
  }
}
