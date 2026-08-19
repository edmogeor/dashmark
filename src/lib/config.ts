export type AppConfig = {
  dockerHost: string
  labelPrefix: string
  configFile: string
  iconsDir: string
  iconsCdn: string
  accessGroupsEnabled: boolean
  accessGroupsHeader: string
  port: number
  disableSearch: boolean
  disableStatus: boolean
  disableAutomaticIcons: boolean
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  return value.toLowerCase() === 'true'
}

function parsePort(value: string | undefined, defaultValue: number): number {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : defaultValue
}

export function getConfig(): AppConfig {
  const accessGroupsEnabled = parseBool(process.env.ACCESS_GROUPS_ENABLED, false)
  const accessGroupsHeaderRaw = process.env.ACCESS_GROUPS_HEADER || 'auto'

  return {
    dockerHost: process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',
    labelPrefix: process.env.DASHMARK_LABEL_PREFIX || 'dashmark',
    configFile: process.env.CONFIG_FILE || '/app/config.yml',
    iconsDir: process.env.ICONS_DIR || '/app/icons',
    iconsCdn: process.env.ICONS_CDN || 'https://cdn.jsdelivr.net/gh/selfhst/icons@main',
    accessGroupsEnabled,
    accessGroupsHeader: accessGroupsHeaderRaw,
    port: parsePort(process.env.PORT, 4321),
    disableSearch: parseBool(process.env.DISABLE_SEARCH, false),
    disableStatus: parseBool(process.env.DISABLE_STATUS, false),
    disableAutomaticIcons: parseBool(process.env.DISABLE_AUTOMATIC_ICONS, false)
  }
}
