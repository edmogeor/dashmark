import type { AppConfig } from './config'

export const AUTO_GROUP_HEADERS = [
  'X-Authentik-Groups',
  'Remote-Groups',
  'X-Forwarded-Groups',
  'X-Auth-Groups'
]

const AUTO_NAME_HEADERS = [
  'X-Authentik-Name',
  'Remote-Name',
  'X-Forwarded-Preferred-Username',
  'X-Auth-Name'
]

const AUTO_FIRST_NAME_HEADERS = [
  'X-Authentik-Given-Name'
]

const AUTO_LAST_NAME_HEADERS = [
  'X-Authentik-Family-Name'
]

const AUTO_USERNAME_HEADERS = [
  'X-Authentik-Username',
  'Remote-User',
  'X-Forwarded-User',
  'X-Auth-Username'
]

const AUTO_EMAIL_HEADERS = [
  'X-Authentik-Email',
  'Remote-Email',
  'X-Forwarded-Email',
  'X-Auth-Email'
]

export type AuthUser = {
  name?: string
  username?: string
  email?: string
  firstName?: string
  lastName?: string
  groups: string[]
}

export function groupHeaderNames(config: AppConfig): string[] {
  return config.accessGroupsHeader === 'auto'
    ? AUTO_GROUP_HEADERS
    : [config.accessGroupsHeader]
}

export function parseUserGroups(headerValue: string | null | undefined): string[] {
  if (!headerValue) return []
  return headerValue
    .split(/[,;]/)
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
