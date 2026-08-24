import fs from 'node:fs'
import yaml from 'js-yaml'
import type { AppConfig } from './config'
import { parseResourceStats, type ParsedLabels } from './labels'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { dashmarkError, errorMessage, isRecord, type DashmarkError } from './errors'
import { strings } from './strings'

export type ServiceOverrides = Partial<ParsedLabels>

export type YamlConfig = Record<string, ServiceOverrides>

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

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return undefined
  return value
}

function parseService(value: unknown): ServiceOverrides | null {
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
    showStatus: typeof value.show_status === 'boolean' ? value.show_status : undefined,
    resourceStats: typeof value.stats === 'string' || Array.isArray(value.stats)
      ? parseResourceStats(typeof value.stats === 'string' ? value.stats : stringArray(value.stats))
      : undefined,
    access: stringArray(value.access),
    searchAliases: stringArray(value.search_aliases)
  }
}

function parseConfig(value: unknown): YamlConfig {
  if (!isRecord(value)) return {}

  const services: YamlConfig = {}
  for (const [name, service] of Object.entries(value)) {
    const parsedService = parseService(service)
    if (parsedService) services[name] = parsedService
    else logger.warn('config', logMessages.config.invalidYamlService, { service: name })
  }

  return services
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
    const message = errorMessage(error)
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
