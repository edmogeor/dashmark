import { logger } from './logger'
import { logMessages } from './log-messages'

export type AppConfig = {
  dockerHost: string
  configFile: string
  iconsDir: string
  enableAccessGroups: boolean
  accessGroupsHeader: string
  port: number
  showSearch: boolean
  showStatus: boolean
  enableAutomaticIcons: boolean
  showBranding: boolean
  showHeader: boolean
  showGroupTags: boolean
  showThemeToggle: boolean
  customHeader?: string
  greetingMorning?: string
  greetingAfternoon?: string
  greetingEvening?: string
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  return value.toLowerCase() === 'true'
}

const HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

function isValidHeaderToken(value: string): boolean {
  return HEADER_TOKEN.test(value)
}

function parseAccessGroupsHeader(value: string | undefined): string {
  const header = value || 'auto'
  if (isValidHeaderToken(header)) return header
  logger.error('config', logMessages.config.invalidAccessGroupsHeader, { header })
  return 'auto'
}

function parsePort(value: string | undefined, defaultValue: number): number {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : defaultValue
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
    enableAccessGroups,
    accessGroupsHeader,
    port: parsePort(process.env.PORT, 4321),
    showSearch: parseBool(process.env.SHOW_SEARCH, true),
    showStatus: parseBool(process.env.SHOW_STATUS, true),
    enableAutomaticIcons: parseBool(process.env.ENABLE_AUTOMATIC_ICONS, true),
    showBranding: parseBool(process.env.SHOW_BRANDING, true),
    showHeader: parseBool(process.env.SHOW_HEADER, true),
    showGroupTags: parseBool(process.env.SHOW_GROUP_TAGS, true),
    showThemeToggle: parseBool(process.env.SHOW_THEME_TOGGLE, true),
    customHeader,
    greetingMorning: optionalString(process.env.GREETING_MORNING),
    greetingAfternoon: optionalString(process.env.GREETING_AFTERNOON),
    greetingEvening: optionalString(process.env.GREETING_EVENING)
  }
}
