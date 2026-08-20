import { logger } from './logger'
import { logMessages } from './log-messages'

export type AppConfig = {
  dockerHost: string
  configFile: string
  iconsDir: string
  accessGroupsEnabled: boolean
  accessGroupsHeader: string
  port: number
  disableSearch: boolean
  disableStatus: boolean
  disableAutomaticIcons: boolean
  disableBranding: boolean
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

export function getConfig(): AppConfig {
  const accessGroupsEnabled = parseBool(process.env.ACCESS_GROUPS_ENABLED, false)
  const accessGroupsHeader = parseAccessGroupsHeader(process.env.ACCESS_GROUPS_HEADER)

  return {
    dockerHost: process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',
    configFile: process.env.CONFIG_FILE || '/app/config.yml',
    iconsDir: process.env.ICONS_DIR || '/app/icons',
    accessGroupsEnabled,
    accessGroupsHeader,
    port: parsePort(process.env.PORT, 4321),
    disableSearch: parseBool(process.env.DISABLE_SEARCH, false),
    disableStatus: parseBool(process.env.DISABLE_STATUS, false),
    disableAutomaticIcons: parseBool(process.env.DISABLE_AUTOMATIC_ICONS, false),
    disableBranding: parseBool(process.env.DISABLE_BRANDING, false)
  }
}
