import { logger } from './logger'
import { logMessages } from './log-messages'
import { AUTO_ACCESS_GROUPS_HEADER, ACCESS_GROUPS_HEADER_TOKEN, DEFAULT_PORT, MAX_PORT, STATUS_POLL_INTERVAL_MS } from './constants'

export type AppConfig = {
  dockerHost: string
  configFile: string
  iconsDir: string
  customStylesheet?: string
  enableAccessGroups: boolean
  accessGroupsHeader: string
  userNameHeader?: string
  userUsernameHeader?: string
  userEmailHeader?: string
  userFirstNameHeader?: string
  userLastNameHeader?: string
  port: number
  showSearch: boolean
  showStatus: boolean
  statusBadgeGroups: string[]
  statusPollIntervalMs: number
  categoryOrder: string[]
  enableAutomaticDescriptions: boolean
  enableAutomaticIcons: boolean
  showBranding: boolean
  showHeader: boolean
  showGroupTags: boolean
  showThemeToggle: boolean
  openInNewTab: boolean
  customHeader?: string
  greetingMorning?: string
  greetingAfternoon?: string
  greetingEvening?: string
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
  logger.error('config', logMessages.config.invalidAccessGroupsHeader, { header })
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

function parseInterval(value: string | undefined): number {
  const seconds = Number(value)
  return Number.isInteger(seconds) && seconds > 0 ? seconds * 1_000 : STATUS_POLL_INTERVAL_MS
}

function parseCategoryOrder(value: string | undefined): string[] {
  const categories = new Map<string, string>()
  for (const name of value?.split(',') ?? []) {
    const category = name.trim()
    if (category && !categories.has(category.toLowerCase())) {
      categories.set(category.toLowerCase(), category)
    }
  }
  return [...categories.values()]
}

function parseStatusBadgeGroups(value: string | undefined): string[] {
  const groups = new Map<string, string>()
  for (const name of value?.split(',') ?? []) {
    const group = name.trim()
    if (group && !groups.has(group.toLowerCase())) {
      groups.set(group.toLowerCase(), group)
    }
  }
  return [...groups.values()]
}

function optionalString(value: string | undefined): string | undefined {
  return value?.trim() || undefined
}

export function getConfig(): AppConfig {
  const enableAccessGroups = parseBool(process.env.ENABLE_ACCESS_GROUPS, false)
  const accessGroupsHeader = parseAccessGroupsHeader(process.env.ACCESS_GROUPS_HEADER)
  const customHeader = optionalString(process.env.CUSTOM_HEADER)

  return {
    dockerHost: process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',
    configFile: process.env.CONFIG_FILE || '/app/config.yml',
    iconsDir: process.env.ICONS_DIR || '/app/icons',
    customStylesheet: optionalString(process.env.CUSTOM_STYLESHEET),
    enableAccessGroups,
    accessGroupsHeader,
    userNameHeader: parseUserHeader(process.env.USER_NAME_HEADER),
    userUsernameHeader: parseUserHeader(process.env.USER_USERNAME_HEADER),
    userEmailHeader: parseUserHeader(process.env.USER_EMAIL_HEADER),
    userFirstNameHeader: parseUserHeader(process.env.USER_FIRST_NAME_HEADER),
    userLastNameHeader: parseUserHeader(process.env.USER_LAST_NAME_HEADER),
    port: parsePort(process.env.PORT, DEFAULT_PORT),
    showSearch: parseBool(process.env.SHOW_SEARCH, true),
    showStatus: parseBool(process.env.SHOW_STATUS, true),
    statusBadgeGroups: parseStatusBadgeGroups(process.env.STATUS_BADGE_GROUPS),
    statusPollIntervalMs: parseInterval(process.env.STATUS_POLL_INTERVAL),
    categoryOrder: parseCategoryOrder(process.env.CATEGORY_ORDER),
    enableAutomaticDescriptions: parseBool(process.env.ENABLE_AUTOMATIC_DESCRIPTIONS, true),
    enableAutomaticIcons: parseBool(process.env.ENABLE_AUTOMATIC_ICONS, true),
    showBranding: parseBool(process.env.SHOW_BRANDING, true),
    showHeader: parseBool(process.env.SHOW_HEADER, true),
    showGroupTags: parseBool(process.env.SHOW_GROUP_TAGS, true),
    showThemeToggle: parseBool(process.env.SHOW_THEME_TOGGLE, true),
    openInNewTab: parseBool(process.env.NEW_TAB, false),
    customHeader,
    greetingMorning: optionalString(process.env.GREETING_MORNING),
    greetingAfternoon: optionalString(process.env.GREETING_AFTERNOON),
    greetingEvening: optionalString(process.env.GREETING_EVENING)
  }
}
