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
const CUSTOM_METRIC_CHARTS = ['step', 'line', 'area', 'none'] as const
type CustomMetricChart = typeof CUSTOM_METRIC_CHARTS[number]

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
  chart: CustomMetricChart
  chartGroup?: string
} & ({ json: JsonMetricExtractor; prometheus?: never } | { prometheus: PrometheusMetricExtractor; json?: never })

export type TextMetricOverride = MetricCommon & {
  valueType: 'string'
} & ({ json: JsonMetricExtractor; prometheus?: never } | { prometheus: PrometheusMetricExtractor; json?: never })

export type MetricOverride = NumericMetricOverride | TextMetricOverride

export type ServiceMetricOverrides = Record<string, MetricOverride>

export type YamlSettings = {
  port?: number
  dockerHosts?: string[]
  iconsDir?: string
  customStylesheet?: string
  enableAccessControl?: boolean
  accessGroupsHeader?: string
  userNameHeader?: string
  userUsernameHeader?: string
  userEmailHeader?: string
  userFirstNameHeader?: string
  userLastNameHeader?: string
  showSearch?: boolean
  showStatus?: boolean
  statusBadgeAccess?: string[]
  showMetrics?: boolean
  metricsAccess?: string[]
  metricsDatabasePath?: string
  metricsPollInterval?: number
  metricsHistoryPeriod?: number
  statusPollInterval?: number
  categoryOrder?: string[]
  enableAutomaticDescriptions?: boolean
  enableAutomaticIcons?: boolean
  showBranding?: boolean
  showHeader?: boolean
  showGroupTags?: boolean
  showThemeToggle?: boolean
  openInNewTab?: boolean
  customHeader?: string
  greetingMorning?: string
  greetingAfternoon?: string
  greetingEvening?: string
  authToken?: MetricSecretReference
}

export type YamlConfig = {
  settings: YamlSettings
  services: Record<string, ServiceOverrides>
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
const SETTINGS_FIELDS = new Set([
  'port', 'docker_hosts', 'icons_dir', 'custom_stylesheet', 'enable_access_control', 'access_groups_header',
  'user_name_header', 'user_username_header', 'user_email_header', 'user_first_name_header', 'user_last_name_header',
  'show_search', 'show_status', 'status_badge_access', 'show_metrics', 'metrics_access', 'metrics_database_path',
  'metrics_poll_interval', 'metrics_history_period', 'status_poll_interval', 'category_order',
  'enable_automatic_descriptions', 'enable_automatic_icons', 'show_branding', 'show_header', 'show_group_tags',
  'show_theme_toggle', 'new_tab', 'custom_header', 'greeting_morning', 'greeting_afternoon', 'greeting_evening', 'auth_token'
])
const SERVICE_FIELDS = new Set([
  'title', 'description', 'url', 'icon', 'category', 'order', 'hidden', 'show_status', 'metrics', 'metric_provider',
  'metrics_poll_interval', 'metrics_history_period', 'metrics_access', 'access', 'search_aliases', 'custom_metrics'
])

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function stringList(value: unknown): string[] | undefined {
  const entries = typeof value === 'string' ? [value] : Array.isArray(value) ? value : undefined
  if (!entries || !entries.every(item => typeof item === 'string')) return undefined
  return entries.flatMap(entry => entry.split(',').map(item => item.trim()).filter(Boolean))
}

function invalid(path: string, expected: string): never {
  throw new Error(`${path} must be ${expected}`)
}

function validateKnownFields(value: Record<string, unknown>, fields: Set<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new Error(`unknown configuration key: ${path}.${key}`)
  }
}

function validateString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'string') invalid(path, 'a string')
}

function validateBoolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'boolean') invalid(path, 'a boolean')
}

function validateNumber(value: unknown, path: string): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) invalid(path, 'a finite number')
}

function validatePositiveInteger(value: unknown, path: string): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)) invalid(path, 'a positive integer')
}

function validateStringList(value: unknown, path: string): void {
  if (value !== undefined && (stringList(value)?.length ?? 0) === 0) invalid(path, 'a non-empty string or list of strings')
}

function metricAccess(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
  const parsed = entries.map(([key, access]) => [key, stringList(access)] as const)
  if (!parsed.every(([key, access]) => /^[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/.test(key) && access !== undefined)) return undefined
  return Object.fromEntries(parsed) as Record<string, string[]>
}

function validateMetricAccess(value: unknown, path: string): void {
  if (value === undefined) return
  if (!isRecord(value)) invalid(path, 'a mapping of metric names to access lists')
  for (const [key, access] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/.test(key)) invalid(`${path}.${key}`, 'a valid metric name')
    validateStringList(access, `${path}.${key}`)
  }
}

function validateSecretReference(value: unknown, path: string): void {
  if (value === undefined) return
  const reference = parseSecretReference(value)
  if (!reference) invalid(path, 'an env or file secret reference')
  if (reference.env && process.env[reference.env] === undefined) throw new Error(`${path}.env references an unset environment variable: ${reference.env}`)
  if (reference.file) {
    try {
      fs.accessSync(reference.file, fs.constants.R_OK)
    } catch {
      throw new Error(`${path}.file is not readable: ${reference.file}`)
    }
  }
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

function parseChart(value: unknown): CustomMetricChart | undefined {
  return typeof value === 'string' && CUSTOM_METRIC_CHARTS.includes(value as CustomMetricChart)
    ? value as CustomMetricChart
    : undefined
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
    const chart = metric.chart === undefined ? 'step' : parseChart(metric.chart)
    const chartGroup = metric.chart_group === undefined ? undefined : string(metric.chart_group)
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
    if (!chart) {
      invalid('chart must be step, line, area, or none')
      continue
    }
    if (metric.chart_group !== undefined && (!chartGroup || !/^[a-z][a-z0-9_-]*$/.test(chartGroup))) {
      invalid('chart_group must be a lowercase identifier')
      continue
    }
    if (valueType === 'string' && (metric.unit !== undefined || metric.chart !== undefined || metric.chart_group !== undefined || json?.valuePath !== undefined || json?.reduce !== undefined || prometheus?.reduce !== undefined || (prometheus && !prometheus.valueLabel))) {
      invalid('string metrics cannot use units, reductions, or charts')
      continue
    }
    if (valueType === 'number' && (!unit || prometheus?.valueLabel !== undefined || (chartGroup !== undefined && chart === 'none'))) {
      invalid(chartGroup !== undefined && chart === 'none'
        ? 'chart_group requires a visible chart'
        : 'numeric metrics require a valid unit and cannot use value_label')
      continue
    }

    const { headers, error } = parseMetricHeaders(source)
    if (error) {
      invalid(error)
      continue
    }

    const common = { label, source: headers ? { url, headers } : { url } }
    if (valueType === 'string') metrics[key] = json ? { ...common, valueType, json } : { ...common, valueType, prometheus: prometheus! }
    else {
      const numeric = { ...common, valueType: 'number' as const, unit: unit!, chart, ...(chartGroup === undefined ? {} : { chartGroup }) }
      metrics[key] = json ? { ...numeric, json } : { ...numeric, prometheus: prometheus! }
    }
  }

  const metricGroups = new Map<string, [string, NumericMetricOverride][]>()
  for (const [key, metric] of Object.entries(metrics)) {
    if (metric.valueType !== 'number' || !metric.chartGroup) continue
    const group = metricGroups.get(metric.chartGroup) ?? []
    group.push([key, metric])
    metricGroups.set(metric.chartGroup, group)
  }
  for (const [group, entries] of metricGroups) {
    const [first] = entries
    if (!first) continue
    const signature = `${first[1].chart}:${JSON.stringify(first[1].unit)}`
    if (entries.every(([, metric]) => `${metric.chart}:${JSON.stringify(metric.unit)}` === signature)) continue
    for (const [key] of entries) {
      const reason = `chart_group ${group} metrics must use the same unit and chart`
      errors[key] = reason
      logger.warn('config', 'ignoring invalid custom metric', { key, reason })
      delete metrics[key]
    }
  }

  return {
    ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
    ...(Object.keys(errors).length > 0 ? { errors } : {})
  }
}

function parseService(value: unknown, path: string): ServiceOverrides {
  if (!isRecord(value)) invalid(path, 'a mapping')
  validateKnownFields(value, SERVICE_FIELDS, path)
  for (const key of ['title', 'description', 'url', 'icon', 'category', 'metric_provider'] as const) validateString(value[key], `${path}.${key}`)
  for (const key of ['hidden', 'show_status'] as const) validateBoolean(value[key], `${path}.${key}`)
  validateNumber(value.order, `${path}.order`)
  for (const key of ['metrics_poll_interval', 'metrics_history_period'] as const) validatePositiveInteger(value[key], `${path}.${key}`)
  if (value.metric_provider !== undefined && !metricProvider(value.metric_provider)) invalid(`${path}.metric_provider`, 'a lowercase provider identifier')
  for (const key of ['metrics', 'access', 'search_aliases'] as const) validateStringList(value[key], `${path}.${key}`)
  validateMetricAccess(value.metrics_access, `${path}.metrics_access`)

  const order = typeof value.order === 'number' && Number.isFinite(value.order)
    ? value.order
    : undefined

  const metricKeys = stringList(value.metrics)

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
    metricsAccess: metricAccess(value.metrics_access),
    access: stringList(value.access),
    searchAliases: stringList(value.search_aliases),
    customMetrics: parsedMetrics.metrics,
    customMetricErrors: parsedMetrics.errors
  }
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function parseSettings(value: unknown): YamlSettings {
  if (value === undefined) return {}
  if (!isRecord(value)) invalid('settings', 'a mapping')
  validateKnownFields(value, SETTINGS_FIELDS, 'settings')
  for (const key of ['icons_dir', 'custom_stylesheet', 'access_groups_header', 'user_name_header', 'user_username_header', 'user_email_header', 'user_first_name_header', 'user_last_name_header', 'metrics_database_path', 'custom_header', 'greeting_morning', 'greeting_afternoon', 'greeting_evening'] as const) validateString(value[key], `settings.${key}`)
  for (const key of ['enable_access_control', 'show_search', 'show_status', 'show_metrics', 'enable_automatic_descriptions', 'enable_automatic_icons', 'show_branding', 'show_header', 'show_group_tags', 'show_theme_toggle', 'new_tab'] as const) validateBoolean(value[key], `settings.${key}`)
  if (value.port !== undefined && (typeof value.port !== 'number' || !Number.isInteger(value.port) || value.port <= 0 || value.port > 65_535)) invalid('settings.port', 'an integer between 1 and 65535')
  for (const key of ['metrics_poll_interval', 'metrics_history_period', 'status_poll_interval'] as const) validatePositiveInteger(value[key], `settings.${key}`)
  for (const key of ['docker_hosts', 'status_badge_access', 'metrics_access', 'category_order'] as const) validateStringList(value[key], `settings.${key}`)
  validateSecretReference(value.auth_token, 'settings.auth_token')

  return {
    port: typeof value.port === 'number' ? value.port : undefined,
    dockerHosts: stringList(value.docker_hosts),
    iconsDir: string(value.icons_dir),
    customStylesheet: string(value.custom_stylesheet),
    enableAccessControl: boolean(value.enable_access_control),
    accessGroupsHeader: string(value.access_groups_header),
    userNameHeader: string(value.user_name_header),
    userUsernameHeader: string(value.user_username_header),
    userEmailHeader: string(value.user_email_header),
    userFirstNameHeader: string(value.user_first_name_header),
    userLastNameHeader: string(value.user_last_name_header),
    showSearch: boolean(value.show_search),
    showStatus: boolean(value.show_status),
    statusBadgeAccess: stringList(value.status_badge_access),
    showMetrics: boolean(value.show_metrics),
    metricsAccess: stringList(value.metrics_access),
    metricsDatabasePath: string(value.metrics_database_path),
    metricsPollInterval: typeof value.metrics_poll_interval === 'number' ? value.metrics_poll_interval : undefined,
    metricsHistoryPeriod: typeof value.metrics_history_period === 'number' ? value.metrics_history_period : undefined,
    statusPollInterval: typeof value.status_poll_interval === 'number' ? value.status_poll_interval : undefined,
    categoryOrder: stringList(value.category_order),
    enableAutomaticDescriptions: boolean(value.enable_automatic_descriptions),
    enableAutomaticIcons: boolean(value.enable_automatic_icons),
    showBranding: boolean(value.show_branding),
    showHeader: boolean(value.show_header),
    showGroupTags: boolean(value.show_group_tags),
    showThemeToggle: boolean(value.show_theme_toggle),
    openInNewTab: boolean(value.new_tab),
    customHeader: string(value.custom_header),
    greetingMorning: string(value.greeting_morning),
    greetingAfternoon: string(value.greeting_afternoon),
    greetingEvening: string(value.greeting_evening),
    authToken: parseSecretReference(value.auth_token)
  }
}

function parseConfig(value: unknown): YamlConfig {
  if (!isRecord(value)) invalid('root', 'a mapping')

  const services: Record<string, ServiceOverrides> = {}
  for (const [name, service] of Object.entries(value)) {
    if (name === 'settings') continue
    services[name] = parseService(service, name)
  }

  return { settings: parseSettings(value.settings), services }
}

export function loadYamlConfig(config: AppConfig): YamlConfigResult {
  let stat
  try {
    stat = fs.statSync(config.configFile)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      const message = errorMessage(error)
      return { config: { settings: {}, services: {} }, error: dashmarkError('CONFIG_INVALID', strings.errors.configInvalid, false, message) }
    }
    return { config: { settings: {}, services: {} } }
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
      config: { settings: {}, services: {} },
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
