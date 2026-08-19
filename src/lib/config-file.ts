import fs from 'node:fs'
import yaml from 'js-yaml'
import type { AppConfig } from './config'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { dashmarkError, type DashmarkError } from './errors'
import { strings } from './strings'

export type YamlService = {
  title?: string
  description?: string
  url?: string
  icon?: string
  category?: string
  order?: number
  hidden?: boolean
  access_groups?: string[]
  search_aliases?: string[]
}

export type YamlConfig = {
  services?: Record<string, YamlService>
  settings?: {
    theme?: string
  }
}

export type YamlConfigResult = {
  config: YamlConfig
  error?: DashmarkError
}

type CachedConfig = {
  mtimeMs: number
  size: number
  config: YamlConfig
  error?: DashmarkError
}

const configCache = new Map<string, CachedConfig>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return undefined
  return value
}

function parseService(value: unknown): YamlService | null {
  if (!isRecord(value)) return null

  const order = typeof value.order === 'number' && Number.isFinite(value.order)
    ? value.order
    : undefined

  return {
    title: string(value.title),
    description: string(value.description),
    url: string(value.url),
    icon: string(value.icon),
    category: string(value.category),
    order,
    hidden: typeof value.hidden === 'boolean' ? value.hidden : undefined,
    access_groups: stringArray(value.access_groups),
    search_aliases: stringArray(value.search_aliases)
  }
}

function parseConfig(value: unknown): YamlConfig {
  if (!isRecord(value)) return {}

  const services: Record<string, YamlService> = {}
  if (isRecord(value.services)) {
    for (const [name, service] of Object.entries(value.services)) {
      const parsedService = parseService(service)
      if (parsedService) services[name] = parsedService
      else logger.warn('config', logMessages.config.invalidYamlService, { service: name })
    }
  }

  return { services }
}

export function loadYamlConfig(config: AppConfig): YamlConfigResult {
  let stat
  try {
    stat = fs.statSync(config.configFile)
  } catch {
    return { config: {} }
  }

  const cached = configCache.get(config.configFile)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return { config: cached.config, error: cached.error }
  }

  try {
    const content = fs.readFileSync(config.configFile, 'utf-8')
    const parsed = parseConfig(yaml.load(content))
    configCache.set(config.configFile, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      config: parsed
    })
    return { config: parsed }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const dashmarkErr = dashmarkError('CONFIG_INVALID', strings.errors.configInvalid, false, message)
    const result: CachedConfig = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      config: {},
      error: dashmarkErr
    }
    configCache.set(config.configFile, result)
    logger.error('config', logMessages.config.parseFailed, {
      file: config.configFile,
      error: message
    })
    return { config: result.config, error: dashmarkErr }
  }
}
