import fs from 'node:fs'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { AUTO_ACCESS_GROUPS_HEADER, ACCESS_GROUPS_HEADER_TOKEN, DEFAULT_METRICS_POLL_INTERVAL_MS, DEFAULT_PORT, MAX_PORT, METRICS_HISTORY_PERIOD_MS } from './constants'
import { loadYamlConfig, type DashboardSettings } from './config-file'

export type AppConfig = DashboardSettings & {
  dockerHost: string
  dockerHosts?: DockerHostConfig[]
  configFile: string
  iconsDir: string
  customStylesheet?: string
  enableAccessControl: boolean
  accessGroupsHeader: string
  userNameHeader?: string
  userUsernameHeader?: string
  userEmailHeader?: string
  userFirstNameHeader?: string
  userLastNameHeader?: string
  port: number
  showSearch: boolean
  showStatus: boolean
  statusBadgeAccess: string[]
  showMetrics: boolean
  metricsAccess: string[]
  metricsDatabasePath: string
  metricsPollIntervalMs: number
  metricsHistoryPeriodMs: number
  authToken?: string
}

export type DockerHostConfig = {
  id: string
  dockerHost: string
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  return value.toLowerCase() === 'true'
}

function isValidHeaderToken(value: string): boolean {
  return ACCESS_GROUPS_HEADER_TOKEN.test(value)
}

function parseAccessGroupsHeader(value: string | undefined): string {
  const header = value || AUTO_ACCESS_GROUPS_HEADER
  if (isValidHeaderToken(header)) return header
  logger.error('config', logMessages.config.invalidAccessGroupsHeader, {
    header
  })
  return AUTO_ACCESS_GROUPS_HEADER
}

function parseUserHeader(value: string | undefined): string | undefined {
  const header = optionalString(value)
  if (!header) return undefined
  if (isValidHeaderToken(header)) return header
  logger.error('config', logMessages.config.invalidUserHeader, { header })
  return undefined
}

function parsePort(value: string | undefined, defaultValue: number): number {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= MAX_PORT ? port : defaultValue
}

function parseInterval(value: string | undefined, defaultValue: number): number {
  const seconds = Number(value)
  return Number.isInteger(seconds) && seconds > 0 ? seconds * 1_000 : defaultValue
}

function parseAccess(value: string | undefined): string[] {
  const entries = new Map<string, string>()
  for (const name of value?.split(',') ?? []) {
    const entry = name.trim()
    if (entry && !entries.has(entry.toLowerCase())) {
      entries.set(entry.toLowerCase(), entry)
    }
  }
  return [...entries.values()]
}

function optionalString(value: string | undefined): string | undefined {
  return value?.trim() || undefined
}

function resolveSecret(value: { env?: string; file?: string } | undefined): string | undefined {
  if (!value) return undefined
  if (value.env) return process.env[value.env]
  try {
    return value.file ? fs.readFileSync(value.file, 'utf-8') : undefined
  } catch {
    return undefined
  }
}

function parseDockerHosts(value: string | undefined): DockerHostConfig[] | undefined {
  if (!value?.trim()) return undefined

  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (entries.length === 1 && !entries[0].includes('=')) {
    return [{ id: 'default', dockerHost: entries[0] }]
  }

  const hosts: DockerHostConfig[] = []
  const ids = new Set<string>()
  for (const entry of entries) {
    const [id, dockerHost, ...extra] = entry.split('=')
    if (!id || !dockerHost || extra.length > 0 || !/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) {
      logger.error('config', logMessages.config.invalidDockerHosts, {
        entry: entry.trim()
      })
      continue
    }
    ids.add(id)
    hosts.push({ id, dockerHost: dockerHost.trim() })
  }
  return hosts.length > 0 ? hosts : undefined
}

export function getConfig(): AppConfig {
  const configFile = process.env.CONFIG_FILE || '/data/config.yml'
  const settings = loadYamlConfig({ configFile } as AppConfig).config.settings
  const yamlOrEnv = <T>(name: string, value: T | undefined): string | T | undefined => value ?? process.env[name]
  const stringValue = (name: string, value: string | undefined) => optionalString(yamlOrEnv(name, value) as string | undefined)
  const boolValue = (name: string, value: boolean | undefined, defaultValue: boolean) => {
    const configured = yamlOrEnv(name, value)
    return typeof configured === 'boolean' ? configured : parseBool(configured, defaultValue)
  }
  const intervalValue = (name: string, value: number | undefined, defaultValue: number) => {
    const configured = yamlOrEnv(name, value)
    return parseInterval(configured === undefined ? undefined : String(configured), defaultValue)
  }
  const accessValue = (name: string, value: string[] | undefined) => {
    const configured = yamlOrEnv(name, value)
    return Array.isArray(configured) ? parseAccess(configured.join(',')) : parseAccess(configured)
  }
  const categoryOrder = accessValue('CATEGORY_ORDER', settings.categoryOrder)
  const enableAccessControl = boolValue('ENABLE_ACCESS_CONTROL', settings.enableAccessControl, false)
  const accessGroupsHeader = parseAccessGroupsHeader(stringValue('ACCESS_GROUPS_HEADER', settings.accessGroupsHeader))
  const customHeader = stringValue('CUSTOM_HEADER', settings.customHeader)

  return {
    dockerHost: 'unix:///var/run/docker.sock',
    dockerHosts: parseDockerHosts(settings.dockerHosts?.join(',') ?? process.env.DOCKER_HOSTS),
    configFile,
    iconsDir: stringValue('ICONS_DIR', settings.iconsDir) || '/data/icons',
    customStylesheet: stringValue('CUSTOM_STYLESHEET', settings.customStylesheet),
    enableAccessControl,
    accessGroupsHeader,
    userNameHeader: parseUserHeader(stringValue('USER_NAME_HEADER', settings.userNameHeader)),
    userUsernameHeader: parseUserHeader(stringValue('USER_USERNAME_HEADER', settings.userUsernameHeader)),
    userEmailHeader: parseUserHeader(stringValue('USER_EMAIL_HEADER', settings.userEmailHeader)),
    userFirstNameHeader: parseUserHeader(stringValue('USER_FIRST_NAME_HEADER', settings.userFirstNameHeader)),
    userLastNameHeader: parseUserHeader(stringValue('USER_LAST_NAME_HEADER', settings.userLastNameHeader)),
    port: parsePort(settings.port === undefined ? process.env.PORT : String(settings.port), DEFAULT_PORT),
    showSearch: boolValue('SHOW_SEARCH', settings.showSearch, true),
    showStatus: boolValue('SHOW_STATUS', settings.showStatus, true),
    statusBadgeAccess: accessValue('STATUS_BADGE_ACCESS', settings.statusBadgeAccess),
    showMetrics: boolValue('SHOW_METRICS', settings.showMetrics, true),
    metricsAccess: accessValue('METRICS_ACCESS', settings.metricsAccess),
    metricsDatabasePath: stringValue('METRICS_DATABASE_PATH', settings.metricsDatabasePath) || (process.env.NODE_ENV === 'production' ? '/tmp/dashmark/metrics.db' : '.astro/metrics.db'),
    metricsPollIntervalMs: intervalValue('METRICS_POLL_INTERVAL', settings.metricsPollInterval, DEFAULT_METRICS_POLL_INTERVAL_MS),
    metricsHistoryPeriodMs: intervalValue('METRICS_HISTORY_PERIOD', settings.metricsHistoryPeriod, METRICS_HISTORY_PERIOD_MS),
    categoryOrder,
    enableAutomaticDescriptions: boolValue('ENABLE_AUTOMATIC_DESCRIPTIONS', settings.enableAutomaticDescriptions, true),
    enableAutomaticIcons: boolValue('ENABLE_AUTOMATIC_ICONS', settings.enableAutomaticIcons, true),
    showBranding: boolValue('SHOW_BRANDING', settings.showBranding, true),
    showHeader: boolValue('SHOW_HEADER', settings.showHeader, true),
    showGroupTags: boolValue('SHOW_GROUP_TAGS', settings.showGroupTags, true),
    showThemeToggle: boolValue('SHOW_THEME_TOGGLE', settings.showThemeToggle, true),
    openInNewTab: boolValue('NEW_TAB', settings.openInNewTab, false),
    customHeader,
    greetingMorning: stringValue('GREETING_MORNING', settings.greetingMorning),
    greetingAfternoon: stringValue('GREETING_AFTERNOON', settings.greetingAfternoon),
    greetingEvening: stringValue('GREETING_EVENING', settings.greetingEvening),
    authToken: resolveSecret(settings.authToken) ?? process.env.AUTH_TOKEN
  }
}
