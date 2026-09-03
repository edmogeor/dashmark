import fs from 'node:fs'
import * as yaml from 'js-yaml'
import { dashmarkError, errorMessage, isRecord, type DashmarkError } from './errors'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { loadMetricDefinitions } from './config-file-metrics'
import { parseYamlConfig } from './config-file-validation'
import type { YamlConfig, YamlConfigResult } from './config-file-types'
import { strings } from '@/i18n'

type CachedConfig = { mtimeMs: number; size: number; config: YamlConfig; error?: DashmarkError }
const configCache = new Map<string, CachedConfig>()
const emptyConfig = (): YamlConfig => ({ settings: {}, services: {} })

export function loadYamlConfig(configFile: string): YamlConfigResult {
  let stat: fs.Stats
  try {
    stat = fs.statSync(configFile)
  } catch (error) {
    if (!isRecord(error) || error.code === 'ENOENT') return { config: emptyConfig() }
    return {
      config: emptyConfig(),
      error: dashmarkError('CONFIG_INVALID', strings.errors.configInvalid, false, errorMessage(error))
    }
  }

  const cached = configCache.get(configFile)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return { config: cached.config, error: cached.error }

  try {
    const config = parseYamlConfig(yaml.load(fs.readFileSync(configFile, 'utf-8')), loadMetricDefinitions())
    configCache.set(configFile, { mtimeMs: stat.mtimeMs, size: stat.size, config })
    return { config }
  } catch (error) {
    const message = errorMessage(error)
    const result: CachedConfig = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      config: emptyConfig(),
      error: dashmarkError('CONFIG_INVALID', strings.errors.configInvalid, false, message)
    }
    configCache.set(configFile, result)
    logger.error('config', logMessages.config.parseFailed, { file: configFile, error: message })
    return { config: result.config, error: result.error }
  }
}
