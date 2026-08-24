import fs from 'node:fs'
import yaml from 'js-yaml'
import type { AppConfig } from './config'
import { parseResourceStats, type ParsedLabels } from './labels'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { dashmarkError, errorMessage, isRecord, type DashmarkError } from './errors'
import { strings } from './strings'

export type ServiceOverrides = Partial<ParsedLabels> & {
  customMetrics?: ServiceMetricOverrides
  customMetricErrors?: Record<string, string>
}

type MetricSecretReference = { env?: string; file?: string }

type MetricSourceOverride = {
  url: string
  headers?: Record<string, MetricSecretReference>
}

const CUSTOM_METRIC_UNITS = [
  'number', 'count', 'percent', 'ratio', 'bytes', 'bytes_per_second',
  'bits', 'bits_per_second', 'seconds', 'milliseconds', 'microseconds',
  'duration', 'hertz', 'watts', 'volts', 'amperes', 'celsius', 'fahrenheit', 'boolean'
] as const
type CustomMetricUnit = typeof CUSTOM_METRIC_UNITS[number]
type MetricUnit = CustomMetricUnit | { suffix: string }
const CUSTOM_METRIC_REDUCTIONS = ['count', 'sum', 'average', 'minimum', 'maximum'] as const
export type CustomMetricReduction = typeof CUSTOM_METRIC_REDUCTIONS[number]

export type JsonMetricExtractor = {
  path: string
  valuePath?: string
  reduce?: CustomMetricReduction
}

export type PrometheusMetricExtractor = {
  name: string
  labels?: Record<string, string>
  reduce?: CustomMetricReduction
  valueLabel?: string
}

type MetricCommon = {
  label: string
  source: MetricSourceOverride
}

export type NumericMetricOverride = MetricCommon & {
  valueType: 'number'
  unit: MetricUnit
} & ({ json: JsonMetricExtractor; prometheus?: never } | { prometheus: PrometheusMetricExtractor; json?: never })

export type TextMetricOverride = MetricCommon & {
  valueType: 'string'
} & ({ json: JsonMetricExtractor; prometheus?: never } | { prometheus: PrometheusMetricExtractor; json?: never })

export type MetricOverride = NumericMetricOverride | TextMetricOverride

export type ServiceMetricOverrides = Record<string, MetricOverride>

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

function parseInterval(value: unknown): number | undefined {
  const seconds = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(seconds) && seconds > 0 ? seconds * 1_000 : undefined
}

function parseSecretReference(value: unknown): MetricSecretReference | undefined {
  if (!isRecord(value)) return undefined
  const env = string(value.env)
  const file = string(value.file)
  if (env !== undefined && file === undefined) return { env }
  if (file !== undefined && env === undefined) return { file }
  return undefined
}

function isJsonPointer(value: string): boolean {
  return value === '' || /^(?:\/(?:[^~]|~[01])*)*$/.test(value)
}

function parseReduction(value: unknown): CustomMetricReduction | undefined {
  return typeof value === 'string' && CUSTOM_METRIC_REDUCTIONS.includes(value as CustomMetricReduction)
    ? value as CustomMetricReduction
    : undefined
}

function parseUnit(value: unknown): MetricUnit | undefined {
  if (typeof value === 'string' && CUSTOM_METRIC_UNITS.includes(value as CustomMetricUnit)) return value as CustomMetricUnit
  if (isRecord(value) && typeof value.suffix === 'string' && value.suffix) return { suffix: value.suffix }
  return undefined
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function metricProvider(value: unknown): string | undefined {
  const provider = string(value)
  return provider !== undefined && /^[a-z][a-z0-9_-]*$/.test(provider) ? provider : undefined
}

function parseJsonExtractor(value: unknown): JsonMetricExtractor | undefined {
  if (!isRecord(value)) return undefined
  const path = string(value.path)
  const valuePath = string(value.value_path)
  const reduce = value.reduce === undefined ? undefined : parseReduction(value.reduce)
  if (!path || !isJsonPointer(path) || (valuePath !== undefined && !isJsonPointer(valuePath)) || (value.reduce !== undefined && !reduce)) return undefined
  return { path, valuePath, reduce }
}

function parsePrometheusExtractor(value: unknown): PrometheusMetricExtractor | undefined {
  if (!isRecord(value)) return undefined
  const name = string(value.name)
  const labels = isRecord(value.labels) && Object.values(value.labels).every(item => typeof item === 'string')
    ? value.labels as Record<string, string>
    : undefined
  const reduce = value.reduce === undefined ? undefined : parseReduction(value.reduce)
  const valueLabel = string(value.value_label)
  if (!name || !/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name) || (value.labels !== undefined && !labels) || (value.reduce !== undefined && !reduce) || (value.value_label !== undefined && !valueLabel)) return undefined
  return {
    name,
    ...(labels === undefined ? {} : { labels }),
    ...(reduce === undefined ? {} : { reduce }),
    ...(valueLabel === undefined ? {} : { valueLabel })
  }
}

function parseMetricHeaders(source: Record<string, unknown>): { headers?: Record<string, MetricSecretReference>; error?: string } {
  if (source.headers === undefined) return {}
  if (!isRecord(source.headers)) return { error: 'headers must be a mapping' }

  const headers: Record<string, MetricSecretReference> = {}
  for (const [header, reference] of Object.entries(source.headers)) {
    const secret = parseSecretReference(reference)
    if (!secret || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header)) {
      return { error: 'headers must use valid names and env or file references' }
    }
    headers[header] = secret
  }
  return Object.keys(headers).length > 0 ? { headers } : {}
}

function parseMetricOverrides(value: unknown): { metrics?: ServiceMetricOverrides; errors?: Record<string, string> } {
  if (!isRecord(value)) return {}
  const metrics: ServiceMetricOverrides = {}
  const errors: Record<string, string> = {}

  for (const [key, metric] of Object.entries(value)) {
    const invalid = (reason: string) => {
      errors[key] = reason
      logger.warn('config', 'ignoring invalid custom metric', { key, reason })
    }
    if (!/^[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/.test(key) || !isRecord(metric)) {
      invalid('metric key or definition is invalid')
      continue
    }
    const label = string(metric.label)
    const valueType = metric.value_type === undefined ? 'number' : string(metric.value_type)
    const unit = metric.unit === undefined ? 'number' : parseUnit(metric.unit)
    const source = isRecord(metric.source) ? metric.source : undefined
    const url = string(source?.url)
    const json = parseJsonExtractor(metric.json)
    const prometheus = parsePrometheusExtractor(metric.prometheus)
    if (!label) {
      invalid('label must be a non-empty string')
      continue
    }
    if (!source || !url) {
      invalid('source.url is required')
      continue
    }
    if (!isHttpUrl(url)) {
      invalid('source.url must use HTTP or HTTPS')
      continue
    }
    if (metric.json !== undefined && !json) {
      invalid('json.path and json.value_path must be valid JSON Pointers')
      continue
    }
    if (metric.prometheus !== undefined && !prometheus) {
      invalid('prometheus.name, labels, reduction, or value_label is invalid')
      continue
    }
    if ((json !== undefined) === (prometheus !== undefined)) {
      invalid('define exactly one valid json or prometheus extractor')
      continue
    }
    if (valueType !== 'number' && valueType !== 'string') {
      invalid('value_type must be number or string')
      continue
    }
    if (valueType === 'string' && (metric.unit !== undefined || json?.valuePath !== undefined || json?.reduce !== undefined || prometheus?.reduce !== undefined || (prometheus && !prometheus.valueLabel))) {
      invalid('string metrics cannot use units or reductions')
      continue
    }
    if (valueType === 'number' && (!unit || prometheus?.valueLabel !== undefined)) {
      invalid('numeric metrics require a valid unit and cannot use value_label')
      continue
    }

    const { headers, error } = parseMetricHeaders(source)
    if (error) {
      invalid(error)
      continue
    }

    const common = { label, source: headers ? { url, headers } : { url } }
    if (valueType === 'string') metrics[key] = json ? { ...common, valueType, json } : { ...common, valueType, prometheus: prometheus! }
    else metrics[key] = json ? { ...common, valueType, unit: unit!, json } : { ...common, valueType, unit: unit!, prometheus: prometheus! }
  }

  return {
    ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
    ...(Object.keys(errors).length > 0 ? { errors } : {})
  }
}

function parseService(value: unknown): ServiceOverrides | null {
  if (!isRecord(value)) return null

  const order = typeof value.order === 'number' && Number.isFinite(value.order)
    ? value.order
    : undefined

  const metricKeys = Array.isArray(value.metrics) ? stringArray(value.metrics) : undefined

  const parsedMetrics = parseMetricOverrides(value.custom_metrics)
  return {
    title: string(value.title),
    description: string(value.description),
    url: string(value.url),
    icon: string(value.icon),
    category: string(value.category),
    order,
    hidden: typeof value.hidden === 'boolean' ? value.hidden : undefined,
    showStatus: typeof value.show_status === 'boolean' ? value.show_status : undefined,
    resourceStats: metricKeys ? parseResourceStats(metricKeys) : undefined,
    metrics: metricKeys,
    metricProvider: metricProvider(value.metric_provider),
    metricsPollIntervalMs: parseInterval(value.metrics_poll_interval),
    metricsHistoryPeriodMs: parseInterval(value.metrics_history_period),
    access: stringArray(value.access),
    searchAliases: stringArray(value.search_aliases),
    customMetrics: parsedMetrics.metrics,
    customMetricErrors: parsedMetrics.errors
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
