import fs from 'node:fs'
import path from 'node:path'
import * as yaml from 'js-yaml'
import { isRecord } from './errors'
import { logger } from './logger'
import { normalizeMetricDefinition, parseMetricCatalog } from './config-file-validation'
import type { ServiceMetricOverrides } from './config-file-types'

let cachedCatalog: { signature: string; metrics: Record<string, Record<string, unknown>> } | undefined

function mergedSource(defaults: unknown, source: unknown): unknown {
  if (!isRecord(defaults)) return source
  if (!isRecord(source)) return defaults
  return {
    ...defaults,
    ...source,
    ...(isRecord(defaults.headers) || isRecord(source.headers) ? { headers: { ...(isRecord(defaults.headers) ? defaults.headers : {}), ...(isRecord(source.headers) ? source.headers : {}) } } : {}),
    ...(isRecord(defaults.query) || isRecord(source.query) ? { query: { ...(isRecord(defaults.query) ? defaults.query : {}), ...(isRecord(source.query) ? source.query : {}) } } : {})
  }
}

export function loadMetricDefinitions(): Record<string, Record<string, unknown>> {
  const directory = path.resolve(process.env.DASHMARK_METRICS_DIR ?? 'metrics')
  try {
    const files = fs.readdirSync(directory, { withFileTypes: true }).flatMap((provider) => {
      if (!provider.isDirectory()) return []
      return fs.readdirSync(path.join(directory, provider.name), { withFileTypes: true }).flatMap((file) => {
        if (!file.isFile() || !file.name.endsWith('.yml') || file.name === 'provider.yml' || file.name.endsWith('.translations.yml')) return []
        const filePath = path.join(directory, provider.name, file.name)
        return [{ key: `${provider.name}/${file.name.slice(0, -4)}`, path: filePath, stat: fs.statSync(filePath) }]
      })
    })
    const signature = files
      .map((file) => {
        const providerPath = path.join(path.dirname(file.path), 'provider.yml')
        const providerStat = fs.existsSync(providerPath) ? fs.statSync(providerPath) : undefined
        return `${file.path}:${file.stat.mtimeMs}:${file.stat.size}:${providerPath}:${providerStat?.mtimeMs ?? 0}:${providerStat?.size ?? 0}`
      })
      .join('|')
    if (cachedCatalog?.signature === signature) return cachedCatalog.metrics
    const metrics: Record<string, Record<string, unknown>> = {}
    for (const file of files) {
      const definition = yaml.load(fs.readFileSync(file.path, 'utf8'))
      const providerFile = path.join(path.dirname(file.path), 'provider.yml')
      const provider = fs.existsSync(providerFile) ? yaml.load(fs.readFileSync(providerFile, 'utf8')) : {}
      if (!isRecord(definition) || !isRecord(provider)) continue
      const normalized = normalizeMetricDefinition({ ...definition, source: mergedSource(provider.source, definition.source) }, provider.charts, false, undefined, provider.transforms)
      if (normalized.definition) metrics[file.key] = normalized.definition
    }
    cachedCatalog = { signature, metrics }
    return metrics
  } catch (error) {
    logger.error('config', 'failed to load metric catalog', { error: error instanceof Error ? error.message : 'unknown error' })
    return {}
  }
}

export function loadMetricCatalog(): ServiceMetricOverrides {
  return parseMetricCatalog(loadMetricDefinitions())
}
