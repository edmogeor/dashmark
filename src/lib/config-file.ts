import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { AppConfig } from './config'
import { RESOURCE_STATS, type ResourceStat } from './labels'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { dashmarkError, errorMessage, isRecord, type DashmarkError } from './errors'
import { strings } from './strings'
import type { CustomMetricStateColor } from './status'

export type ServiceMetrics = {
  sources?: Record<string, string>
  collection?: { intervalMs?: number; retentionMs?: number }
  entries?: string[]
  entryAccess?: Record<string, string[]>
  charts?: Record<string, { unit: MetricUnit; chart: CustomMetricChart }>
  entryOverrides?: ServiceMetricOverrides
  entryInputs?: Record<string, Record<string, string | number | boolean>>
  entryErrors?: Record<string, string>
}

export type ServiceOverrides = {
  host?: string
  title?: string
  description?: string
  url?: string
  icon?: string
  category?: string
  order?: number
  hidden?: boolean
  showStatus?: boolean
  access?: string[]
  searchAliases?: string[]
  metrics?: ServiceMetrics
}

type MetricSecretReference = { env?: string; file?: string; label?: string; value?: string }
type MetricTokenReference = { token: string; prefix?: string }
type MetricValueReference = MetricSecretReference | MetricTokenReference
type MetricParameterReference = { parameter: string }
type MetricBoundParameterReference = { __dashmarkParameterValue: MetricLiteral }
type MetricLiteral = string | number | boolean
type MetricRequestValue = MetricValueReference | MetricLiteral
type MetricJsonValue = MetricRequestValue | MetricParameterReference | MetricBoundParameterReference | null | MetricJsonValue[] | { [key: string]: MetricJsonValue }

type MetricTokenExtractor =
  | { cheerio: { selector: string; attribute?: string } }
  | { jq: string }

type MetricHttpRequest = {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, MetricRequestValue>
  query?: Record<string, MetricRequestValue>
  form?: Record<string, MetricRequestValue>
  json?: Record<string, MetricJsonValue>
  extract?: Record<string, MetricTokenExtractor>
}

type SocketIoArgument = string | number | boolean | MetricSecretReference

type SocketIoMetricSource = {
  path?: string
  auth?: Record<string, MetricRequestValue>
  login?: { event: string; args?: SocketIoArgument[] }
  request: { event: string; args?: SocketIoArgument[] }
}

type MetricSourceOverride = {
  url: string
  method?: 'GET' | 'POST'
  transport?: 'socketio'
  headers?: Record<string, MetricRequestValue>
  query?: Record<string, MetricRequestValue>
  form?: Record<string, MetricRequestValue>
  json?: Record<string, MetricJsonValue>
  auth?: MetricHttpAuth
  socketio?: SocketIoMetricSource
}

type CookieSessionMetricAuth = {
  type: 'cookie_session'
  optional?: boolean
  steps: MetricHttpRequest[]
}

type BasicMetricAuth = {
  type: 'basic'
  optional?: boolean
  username: MetricSecretReference
  password: MetricSecretReference
}

type TokenMetricAuth = ({
  header: string
  query?: never
} | {
  header?: never
  query: string
}) & {
  type: 'token'
  optional?: boolean
  prefix?: string
  value: MetricSecretReference
}

type MetricHttpAuth = CookieSessionMetricAuth | BasicMetricAuth | TokenMetricAuth

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
const CUSTOM_METRIC_BADGE_COLORS = ['success', 'info', 'warning', 'error', 'disabled'] as const

export type PrometheusMetricExtractor = {
  name: string
  labels?: Record<string, string>
  reduce?: CustomMetricReduction
  valueLabel?: string
}

export type JqMetricExtractor = { expression: string }

type MetricPagination = {
  items: JqMetricExtractor
  next: JqMetricExtractor
}

export type ForEachMetric = {
  items: JqMetricExtractor
  requestUrl: string
  value: JqMetricExtractor
  reduce: CustomMetricReduction
}

export type MetricTransform = {
  multiply?: number
  add?: number
}

type MetricUrlTransform = {
  trim?: true
  lowercase?: true
  replace?: Record<string, string>
}

type MetricParameter = { label: string; type: 'url_component' | 'json_value'; transform?: MetricUrlTransform }

type MetricCommon = {
  label: string
  source: MetricSourceOverride
  parameters?: Record<string, MetricParameter>
  pagination?: MetricPagination
}

export type NumericMetricOverride = MetricCommon & {
  valueType: 'number'
  unit: MetricUnit
  chart: CustomMetricChart
  chartGroup?: string
  rate?: true
  transform?: MetricTransform
} & ({ jq: JqMetricExtractor; prometheus?: never; text?: never; forEach?: never } | { prometheus: PrometheusMetricExtractor; jq?: never; text?: never; forEach?: never } | { text: true; jq?: never; prometheus?: never; forEach?: never } | { forEach: ForEachMetric; jq?: never; prometheus?: never; text?: never })

export type TextMetricOverride = MetricCommon & {
  valueType: 'string'
} & ({ jq: JqMetricExtractor; prometheus?: never; text?: never; forEach?: never } | { prometheus: PrometheusMetricExtractor; jq?: never; text?: never; forEach?: never } | { text: true; jq?: never; prometheus?: never; forEach?: never })

export type StateMetricOverride = MetricCommon & {
  valueType: 'state'
  color: CustomMetricStateColor
  stateColors?: Record<string, CustomMetricStateColor>
  stateLabels?: Record<string, string>
} & ({ jq: JqMetricExtractor; prometheus?: never; text?: never; forEach?: never } | { prometheus: PrometheusMetricExtractor; jq?: never; text?: never; forEach?: never } | { text: true; jq?: never; prometheus?: never; forEach?: never })

export type UptimeMetricOverride = MetricCommon & {
  valueType: 'uptime'
  jq: JqMetricExtractor
  prometheus?: never
  text?: never
  forEach?: never
}

export type MetricOverride = NumericMetricOverride | TextMetricOverride | StateMetricOverride | UptimeMetricOverride

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
  sharedMetricSources?: Record<string, Record<string, unknown>>
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
  'title', 'description', 'url', 'icon', 'category', 'host', 'order', 'hidden', 'show_status', 'access', 'search_aliases', 'metrics'
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

function parseSecretReference(value: unknown): MetricSecretReference | undefined {
  if (!isRecord(value)) return undefined
  const env = string(value.env)
  const file = string(value.file)
  const label = string(value.label)
  if (env !== undefined && file === undefined) return { env, ...(label === undefined ? {} : { label }) }
  if (file !== undefined && env === undefined) return { file, ...(label === undefined ? {} : { label }) }
  if (label !== undefined && env === undefined && file === undefined) return { label }
  return undefined
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

function parseMetricStateColor(value: unknown): CustomMetricStateColor | undefined {
  return typeof value === 'string' && CUSTOM_METRIC_BADGE_COLORS.includes(value as CustomMetricStateColor)
    ? value as CustomMetricStateColor
    : undefined
}

function parseMetricStateColors(value: unknown): Record<string, CustomMetricStateColor> | undefined {
  if (!isRecord(value) || Object.keys(value).length === 0) return undefined
  const colors: Record<string, CustomMetricStateColor> = {}
  for (const [name, color] of Object.entries(value)) {
    if (!name) return undefined
    const parsed = parseMetricStateColor(color)
    if (!parsed) return undefined
    colors[name] = parsed
  }
  return colors
}

function parseMetricStateLabels(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value) || Object.keys(value).length === 0) return undefined
  const labels: Record<string, string> = {}
  for (const [name, label] of Object.entries(value)) {
    if (!name || typeof label !== 'string' || !label.trim() || label.length > 32) return undefined
    labels[name] = label
  }
  return labels
}

function parseMetricUrlTransform(value: unknown): MetricUrlTransform | undefined {
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'trim' && key !== 'lowercase' && key !== 'replace')) return undefined
  if (value.trim !== undefined && value.trim !== true) return undefined
  if (value.lowercase !== undefined && value.lowercase !== true) return undefined
  const replacements = isRecord(value.replace) ? value.replace : undefined
  if (value.replace !== undefined && (!replacements || Object.keys(replacements).some(key => !key || typeof replacements[key] !== 'string'))) return undefined
  return Object.keys(value).length > 0 ? value : undefined
}

function parseMetricParameters(value: unknown, transforms?: unknown): Record<string, MetricParameter> | undefined {
  if (!isRecord(value) || Object.keys(value).length === 0) return undefined
  const parameters: Record<string, MetricParameter> = {}
  for (const [name, parameter] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || !isRecord(parameter) || Object.keys(parameter).some(key => key !== 'label' && key !== 'type' && key !== 'transform') || typeof parameter.label !== 'string' || !parameter.label || (parameter.type !== 'url_component' && parameter.type !== 'json_value')) return undefined
    const transform = parameter.transform === undefined
      ? undefined
      : typeof parameter.transform === 'string' && isRecord(transforms)
        ? parseMetricUrlTransform(transforms[parameter.transform])
        : parseMetricUrlTransform(parameter.transform)
    if (parameter.transform !== undefined && (parameter.type !== 'url_component' || !transform)) return undefined
    parameters[name] = { label: parameter.label, type: parameter.type, ...(transform ? { transform } : {}) }
  }
  return parameters
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isMetricUrl(value: string): boolean {
  return isHttpUrl(value) || /^\{(?:url|metric_source)\}(?:\/|$)/.test(value)
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

function parseJqExtractor(value: unknown): JqMetricExtractor | undefined {
  const expression = string(value)
  return expression?.trim() ? { expression } : undefined
}

function parseMetricPagination(value: unknown): MetricPagination | undefined {
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'items' && key !== 'next')) return undefined
  const items = parseJqExtractor(value.items)
  const next = parseJqExtractor(value.next)
  return items && next ? { items, next } : undefined
}

function parseForEachMetric(value: unknown): ForEachMetric | undefined {
  if (!isRecord(value) || Object.keys(value).some(key => !['items', 'request', 'value', 'reduce'].includes(key))) return undefined
  if (!isRecord(value.request) || Object.keys(value.request).some(key => key !== 'url')) return undefined
  const items = parseJqExtractor(value.items)
  const requestUrl = string(value.request.url)
  const itemValue = parseJqExtractor(value.value)
  const reduction = parseReduction(value.reduce)
  if (!items || !requestUrl || !itemValue || !reduction) return undefined
  if (!isMetricUrl(requestUrl) || !requestUrl.includes('{item}')) return undefined
  return { items, requestUrl, value: itemValue, reduce: reduction }
}

function parseMetricTransform(value: unknown): MetricTransform | undefined {
  if (!isRecord(value)) return undefined
  const multiply = value.multiply
  const add = value.add
  if ((multiply !== undefined && (typeof multiply !== 'number' || !Number.isFinite(multiply)))
    || (add !== undefined && (typeof add !== 'number' || !Number.isFinite(add)))
    || (multiply === undefined && add === undefined)) return undefined
  return { ...(multiply === undefined ? {} : { multiply }), ...(add === undefined ? {} : { add }) }
}

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

function metricCatalog(): Record<string, Record<string, unknown>> {
  const directory = path.resolve(process.env.DASHMARK_METRICS_DIR ?? 'metrics')
  try {
    const files = fs.readdirSync(directory, { withFileTypes: true }).flatMap(provider => {
      if (!provider.isDirectory()) return []
      return fs.readdirSync(path.join(directory, provider.name), { withFileTypes: true }).flatMap(file => {
        if (!file.isFile() || !file.name.endsWith('.yml') || file.name === 'provider.yml') return []
        const filePath = path.join(directory, provider.name, file.name)
        return [{ key: `${provider.name}/${file.name.slice(0, -4)}`, path: filePath, stat: fs.statSync(filePath) }]
      })
    })
    const signature = files.map(file => {
      const providerPath = path.join(path.dirname(file.path), 'provider.yml')
      const providerStat = fs.existsSync(providerPath) ? fs.statSync(providerPath) : undefined
      return `${file.path}:${file.stat.mtimeMs}:${file.stat.size}:${providerPath}:${providerStat?.mtimeMs ?? 0}:${providerStat?.size ?? 0}`
    }).join('|')
    if (cachedCatalog?.signature === signature) return cachedCatalog.metrics
    const metrics = files.reduce<Record<string, Record<string, unknown>>>((catalog, file) => {
      const definition = yaml.load(fs.readFileSync(file.path, 'utf8'))
      const providerFile = path.join(path.dirname(file.path), 'provider.yml')
      const provider = fs.existsSync(providerFile) ? yaml.load(fs.readFileSync(providerFile, 'utf8')) : {}
      if (!isRecord(definition) || !isRecord(provider)) return catalog
      const normalized = normalizeMetricDefinition({ ...definition, source: mergedSource(provider.source, definition.source) }, provider.charts, false, undefined, provider.transforms)
      return normalized.definition ? { ...catalog, [file.key]: normalized.definition } : catalog
    }, {})
    cachedCatalog = { signature, metrics }
    return metrics
  } catch (error) {
    logger.error('config', 'failed to load metric catalog', { error: error instanceof Error ? error.message : 'unknown error' })
    return {}
  }
}

function parseMetricHeaders(source: Record<string, unknown>): { headers?: Record<string, MetricRequestValue>; query?: Record<string, MetricRequestValue>; error?: string } {
  const references = (value: unknown, kind: string): { values?: Record<string, MetricRequestValue>; error?: string } => {
    if (value === undefined) return {}
    if (!isRecord(value)) return { error: `${kind} must be a mapping` }
    const values: Record<string, MetricRequestValue> = {}
    for (const [name, reference] of Object.entries(value)) {
      const value = parseRequestValue(reference)
      if (value === undefined || !name) return { error: `${kind} must use valid names and scalar values, secret, or token references` }
      values[name] = value
    }
    return { values }
  }

  const headers = references(source.headers, 'headers')
  if (headers.error || (headers.values && !Object.keys(headers.values).every(header => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header)))) return { error: headers.error ?? 'headers must use valid names and scalar values, secret, or token references' }
  const query = references(source.query, 'query')
  if (query.error) return { error: query.error }
  return { ...(headers.values && Object.keys(headers.values).length > 0 ? { headers: headers.values } : {}), ...(query.values && Object.keys(query.values).length > 0 ? { query: query.values } : {}) }
}

function parseValueReference(value: unknown): MetricValueReference | undefined {
  const secret = parseSecretReference(value)
  if (secret) return secret
  if (!isRecord(value) || typeof value.token !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(value.token) || Object.keys(value).some(key => key !== 'token' && key !== 'prefix') || (value.prefix !== undefined && typeof value.prefix !== 'string')) return undefined
  return { token: value.token, ...(typeof value.prefix === 'string' ? { prefix: value.prefix } : {}) }
}

function parseRequestValue(value: unknown): MetricRequestValue | undefined {
  return parseValueReference(value) ?? (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : undefined)
}

function parseJsonValue(value: unknown): MetricJsonValue | undefined {
  const requestValue = parseRequestValue(value)
  if (requestValue !== undefined || value === null) return requestValue ?? null
  if (isRecord(value) && typeof value.parameter === 'string' && /^[a-z][a-z0-9_]*$/.test(value.parameter) && Object.keys(value).length === 1) return { parameter: value.parameter }
  if (Array.isArray(value)) {
    const values = value.map(parseJsonValue)
    return values.every(item => item !== undefined) ? values as MetricJsonValue[] : undefined
  }
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).map(([name, item]) => [name, parseJsonValue(item)] as const)
  return entries.every(([, item]) => item !== undefined)
    ? Object.fromEntries(entries) as { [key: string]: MetricJsonValue }
    : undefined
}

const MAX_AUTH_STEPS = 5
const MAX_EXTRACTED_TOKENS = 16

function parseMetricRequest(value: unknown, path: string): { request?: MetricHttpRequest; error?: string } {
  if (!isRecord(value) || Object.keys(value).some(key => !['url', 'method', 'headers', 'query', 'form', 'json', 'extract'].includes(key))) {
    return { error: `${path} contains an unknown configuration key` }
  }
  const url = string(value.url)
  if (!url || !isMetricUrl(url)) return { error: `${path}.url must use HTTP or HTTPS, or begin with {url} or {metric_source}` }
  const method = value.method === undefined ? 'GET' : string(value.method)
  if (method !== 'GET' && method !== 'POST') return { error: `${path}.method must be GET or POST` }
  if (method === 'GET' && (value.form !== undefined || value.json !== undefined)) return { error: `${path} GET requests cannot define form or json` }
  if (method === 'POST' && Number(value.form !== undefined) + Number(value.json !== undefined) > 1) return { error: `${path} must define at most one form or json body` }
  const { headers, query, error } = parseMetricHeaders(value)
  if (error) return { error: `${path}.${error}` }
  const parseBody = (body: unknown, kind: 'form' | 'json'): { values?: Record<string, MetricRequestValue> | Record<string, MetricJsonValue>; error?: string } => {
    if (body === undefined) return {}
    if (!isRecord(body) || Object.keys(body).length === 0) return { error: `${path}.${kind} must be a non-empty mapping of secret or token references` }
    const values: Record<string, MetricRequestValue> | Record<string, MetricJsonValue> = {}
    for (const [name, reference] of Object.entries(body)) {
      const parsed = kind === 'json' ? parseJsonValue(reference) : parseRequestValue(reference)
      if (!name || parsed === undefined) return { error: `${path}.${kind} must be a non-empty mapping of scalar values, secret or token references${kind === 'json' ? ', arrays, or objects' : ''}` }
      values[name] = parsed
    }
    return { values }
  }
  const form = parseBody(value.form, 'form')
  const json = parseBody(value.json, 'json')
  if (form.error || json.error) return { error: form.error ?? json.error }
  let extract: Record<string, MetricTokenExtractor> | undefined
  if (value.extract !== undefined) {
    if (!isRecord(value.extract) || Object.keys(value.extract).length === 0 || Object.keys(value.extract).length > MAX_EXTRACTED_TOKENS) return { error: `${path}.extract must define between 1 and ${MAX_EXTRACTED_TOKENS} tokens` }
    extract = {}
    for (const [name, extractor] of Object.entries(value.extract)) {
      if (!/^[a-z][a-z0-9_-]*$/.test(name) || !isRecord(extractor) || Object.keys(extractor).length !== 1) return { error: `${path}.extract must use valid token names and one extractor` }
      if (typeof extractor.jq === 'string' && extractor.jq.trim()) extract[name] = { jq: extractor.jq }
      else if (isRecord(extractor.cheerio) && typeof extractor.cheerio.selector === 'string' && extractor.cheerio.selector.trim() && extractor.cheerio.selector.length <= 256 && (extractor.cheerio.attribute === undefined || typeof extractor.cheerio.attribute === 'string')) {
        extract[name] = { cheerio: { selector: extractor.cheerio.selector, ...(typeof extractor.cheerio.attribute === 'string' ? { attribute: extractor.cheerio.attribute } : {}) } }
      } else return { error: `${path}.extract.${name} must define jq or a bounded cheerio selector` }
    }
  }
  return { request: { url, ...(value.method === undefined ? {} : { method }), ...(headers ? { headers } : {}), ...(query ? { query } : {}), ...(form.values ? { form: form.values as Record<string, MetricRequestValue> } : {}), ...(json.values ? { json: json.values as Record<string, MetricJsonValue> } : {}), ...(extract ? { extract } : {}) } }
}

function parseMetricHttpAuth(value: unknown): { auth?: MetricHttpAuth; error?: string } {
  if (value === undefined) return {}
  if (!isRecord(value)) return { error: 'source.auth must define a supported authentication type' }
  if (value.type === 'basic') {
    if (Object.keys(value).some(key => !['type', 'optional', 'username', 'password'].includes(key)) || (value.optional !== undefined && typeof value.optional !== 'boolean')) return { error: 'source.auth type basic only supports optional, username, and password' }
    const username = parseSecretReference(value.username)
    const password = parseSecretReference(value.password)
    if (!username || !password) return { error: 'source.auth type basic requires username and password secret references' }
    return { auth: { type: 'basic', ...(value.optional === undefined ? {} : { optional: value.optional }), username, password } }
  }
  if (value.type === 'token') {
    const header = typeof value.header === 'string' && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value.header)
    const query = typeof value.query === 'string' && value.query.length > 0
    if (Object.keys(value).some(key => !['type', 'optional', 'header', 'query', 'prefix', 'value'].includes(key)) || Number(header) + Number(query) !== 1 || (value.optional !== undefined && typeof value.optional !== 'boolean') || (value.prefix !== undefined && typeof value.prefix !== 'string')) return { error: 'source.auth type token requires one valid header or query target and an optional string prefix' }
    const token = parseSecretReference(value.value)
    if (!token) return { error: 'source.auth type token requires a secret value reference' }
    if (header) return { auth: { type: 'token', ...(value.optional === undefined ? {} : { optional: value.optional }), header: value.header as string, ...(value.prefix === undefined ? {} : { prefix: value.prefix }), value: token } }
    return { auth: { type: 'token', ...(value.optional === undefined ? {} : { optional: value.optional }), query: value.query as string, ...(value.prefix === undefined ? {} : { prefix: value.prefix }), value: token } }
  }
  if (value.type !== 'cookie_session' || Object.keys(value).some(key => !['type', 'optional', 'steps', 'login'].includes(key)) || (value.optional !== undefined && typeof value.optional !== 'boolean')) return { error: 'source.auth must define type basic, token, or cookie_session' }
  const configuredSteps = Array.isArray(value.steps) ? value.steps : value.login === undefined ? undefined : [value.login]
  if (!configuredSteps || configuredSteps.length === 0 || configuredSteps.length > MAX_AUTH_STEPS) return { error: `source.auth.steps must contain between 1 and ${MAX_AUTH_STEPS} requests` }
  const steps: MetricHttpRequest[] = []
  for (const [index, step] of configuredSteps.entries()) {
    const parsed = parseMetricRequest(step, `source.auth.steps.${index}`)
    if (parsed.error || !parsed.request) return { error: parsed.error ?? 'source.auth step is invalid' }
    steps.push(parsed.request)
  }
  return { auth: { type: 'cookie_session', ...(value.optional === undefined ? {} : { optional: value.optional }), steps } }
}

function parseSocketIoArguments(value: unknown, path: string): { args?: SocketIoArgument[]; error?: string } {
  if (value === undefined) return {}
  if (!Array.isArray(value)) return { error: `${path} must be a list of strings, numbers, booleans, or secret references` }
  const args: SocketIoArgument[] = []
  for (const argument of value) {
    if (typeof argument === 'string' || typeof argument === 'boolean' || (typeof argument === 'number' && Number.isFinite(argument))) {
      args.push(argument)
      continue
    }
    const secret = parseSecretReference(argument)
    if (!secret) return { error: `${path} must be a list of strings, numbers, booleans, or secret references` }
    args.push(secret)
  }
  return args.length > 0 ? { args } : {}
}

function parseSocketIoEvent(value: unknown, path: string, requireArgs = false): { event?: { event: string; args?: SocketIoArgument[] }; error?: string } {
  if (!isRecord(value) || typeof value.event !== 'string' || !value.event || Object.keys(value).some(key => !['event', 'args'].includes(key))) {
    return { error: `${path} must define an event name and optional arguments` }
  }
  if (requireArgs && value.args === undefined) return { error: `${path}.args is required` }
  const { args, error } = parseSocketIoArguments(value.args, `${path}.args`)
  return error ? { error } : { event: { event: value.event, ...(args ? { args } : {}) } }
}

function parseSocketIoSource(value: unknown): { socketio?: SocketIoMetricSource; error?: string } {
  if (!isRecord(value) || !isRecord(value.socketio)) return { error: 'source.socketio must define a request event' }
  if (Object.keys(value).some(key => !['url', 'transport', 'headers', 'auth', 'socketio'].includes(key))) return { error: 'Socket.IO sources only support url, transport, headers, auth, and socketio' }
  const socketio = value.socketio
  if (Object.keys(socketio).some(key => !['path', 'auth', 'login', 'request'].includes(key))) return { error: 'source.socketio contains an unknown configuration key' }
  if (socketio.path !== undefined && (typeof socketio.path !== 'string' || !socketio.path.startsWith('/'))) return { error: 'source.socketio.path must begin with /' }
  const auth = socketio.auth === undefined ? {} : parseMetricHeaders({ headers: socketio.auth })
  if (auth.error) return { error: `source.socketio.auth ${auth.error}` }
  const login = socketio.login === undefined ? {} : parseSocketIoEvent(socketio.login, 'source.socketio.login')
  if (login.error) return { error: login.error }
  const request = parseSocketIoEvent(socketio.request, 'source.socketio.request')
  if (request.error || !request.event) return { error: request.error ?? 'source.socketio.request is required' }
  return {
    socketio: {
      ...(auth.headers ? { auth: auth.headers } : {}),
      ...(typeof socketio.path === 'string' ? { path: socketio.path } : {}),
      ...(login.event ? { login: login.event } : {}),
      request: request.event
    }
  }
}

function rejectMetric(key: string, reason: string, errors: Record<string, string>) {
  errors[key] = reason
  logger.warn('config', 'ignoring invalid custom metric', { key, reason })
}

function mergeCatalogMetric(catalogEntry: Record<string, unknown> | undefined, configuredMetric: Record<string, unknown>): Record<string, unknown> {
  if (!catalogEntry) return configuredMetric
  const metric = { ...catalogEntry, ...configuredMetric }
  if (configuredMetric.value_type === undefined || configuredMetric.value_type === catalogEntry.value_type) return metric
  if (configuredMetric.value_type !== 'state') {
    delete metric.color
    delete metric.state_colors
  }
  if (configuredMetric.value_type !== 'number') {
    delete metric.unit
    delete metric.chart
    delete metric.chart_group
    delete metric.transform
  }
  return metric
}

function inconsistentChartGroupMetrics(metrics: ServiceMetricOverrides): [key: string, reason: string][] {
  const groups = new Map<string, [string, NumericMetricOverride][]>()
  for (const [key, metric] of Object.entries(metrics)) {
    if (metric.valueType !== 'number' || !metric.chartGroup) continue
    const group = groups.get(metric.chartGroup) ?? []
    group.push([key, metric])
    groups.set(metric.chartGroup, group)
  }
  const rejected: [key: string, reason: string][] = []
  for (const [group, entries] of groups) {
    const [first] = entries
    if (!first) continue
    const signature = `${first[1].chart}:${JSON.stringify(first[1].unit)}`
    if (entries.every(([, metric]) => `${metric.chart}:${JSON.stringify(metric.unit)}` === signature)) continue
    for (const [key] of entries) rejected.push([key, `chart_group ${group} metrics must use the same unit and chart`])
  }
  return rejected
}

function normalizeMetricSource(value: unknown, sharedSources?: Record<string, Record<string, unknown>>): { source?: unknown; error?: string } {
  if (!isRecord(value)) return { source: value }
  const sourceProfile = string(value.use)
  if (sourceProfile) {
    if (Object.keys(value).some(key => !['use', 'path', 'method', 'headers', 'query', 'form', 'json'].includes(key))) return { error: 'a shared source only supports path and request-specific values' }
    const profile = sharedSources?.[sourceProfile]
    const path = string(value.path)
    if (!profile || !path?.startsWith('/')) return { error: 'source.use must name a shared source and source.path must begin with /' }
    return {
      source: {
      ...profile,
      ...Object.fromEntries(Object.entries(value).filter(([key]) => !['use', 'path', 'headers', 'query'].includes(key))),
      url: `${profile.url as string}${path}`,
      ...(isRecord(profile.headers) || isRecord(value.headers) ? { headers: { ...(isRecord(profile.headers) ? profile.headers : {}), ...(isRecord(value.headers) ? value.headers : {}) } } : {}),
      ...(isRecord(profile.query) || isRecord(value.query) ? { query: { ...(isRecord(profile.query) ? profile.query : {}), ...(isRecord(value.query) ? value.query : {}) } } : {})
      }
    }
  }
  if (Object.keys(value).some(key => !['url', 'method', 'headers', 'query', 'form', 'json', 'authentication', 'type', 'socket'].includes(key))) {
    return { error: 'source contains an unknown configuration key' }
  }
  const authentication = value.authentication
  if (authentication !== undefined && !isRecord(authentication)) return { error: 'source.authentication must be a mapping' }
  if (isRecord(authentication) && Object.keys(authentication).some(key => !['kind', 'optional', 'username', 'password', 'header', 'query', 'prefix', 'value', 'requests'].includes(key))) {
    return { error: 'source.authentication contains an unknown configuration key' }
  }
  const kind = isRecord(authentication) ? string(authentication.kind) : undefined
  let auth: unknown
  if (authentication !== undefined) {
    if (kind === 'basic') auth = { type: 'basic', ...(authentication.optional === undefined ? {} : { optional: authentication.optional }), username: authentication.username, password: authentication.password }
    else if (kind === 'token') auth = { type: 'token', ...(authentication.optional === undefined ? {} : { optional: authentication.optional }), ...(authentication.header === undefined ? {} : { header: authentication.header }), ...(authentication.query === undefined ? {} : { query: authentication.query }), ...(authentication.prefix === undefined ? {} : { prefix: authentication.prefix }), value: authentication.value }
    else if (kind === 'cookie_session') auth = { type: 'cookie_session', ...(authentication.optional === undefined ? {} : { optional: authentication.optional }), steps: authentication.requests }
    else return { error: 'source.authentication.kind must be basic, token, or cookie_session' }
  }
  if (value.type !== undefined && value.type !== 'socket_io') return { error: 'source.type must be socket_io when specified' }
  if (value.type === 'socket_io' && !isRecord(value.socket)) return { error: 'source.socket must be a mapping for Socket.IO sources' }
  return {
    source: {
      ...Object.fromEntries(Object.entries(value).filter(([key]) => !['authentication', 'type', 'socket'].includes(key))),
      ...(auth === undefined ? {} : { auth }),
      ...(value.type === 'socket_io' ? { transport: 'socketio', socketio: value.socket } : {})
    }
  }
}

function parseSharedMetricSources(value: unknown): Record<string, Record<string, unknown>> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) invalid('shared_metric_sources', 'a mapping')
  const sources: Record<string, Record<string, unknown>> = {}
  for (const [name, source] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(name) || !isRecord(source)) invalid(`shared_metric_sources.${name}`, 'a named source mapping')
    validateKnownFields(source, new Set(['base_url', 'headers', 'query', 'authentication']), `shared_metric_sources.${name}`)
    const baseUrl = string(source.base_url)
    if (!baseUrl || !isHttpUrl(baseUrl)) invalid(`shared_metric_sources.${name}.base_url`, 'an HTTP or HTTPS URL')
    const { base_url: _baseUrl, ...sourceSettings } = source
    const normalized = normalizeMetricSource({ ...sourceSettings, url: baseUrl })
    if (normalized.error || !isRecord(normalized.source)) invalid(`shared_metric_sources.${name}`, normalized.error ?? 'a valid source')
    const request = parseMetricRequest(Object.fromEntries(Object.entries(normalized.source).filter(([key]) => key !== 'auth')), `shared_metric_sources.${name}`)
    if (request.error) invalid(`shared_metric_sources.${name}`, request.error)
    const auth = parseMetricHttpAuth(normalized.source.auth)
    if (auth.error) invalid(`shared_metric_sources.${name}`, auth.error)
    sources[name] = request.request
      ? { ...request.request, ...(auth.auth ? { auth: auth.auth } : {}) }
      : {}
  }
  return sources
}

function metricDefinitionFields(value: unknown, partial: boolean): { fields?: { display: Record<string, unknown>; metricValue: Record<string, unknown>; extract: Record<string, unknown> }; error?: string } {
  if (!isRecord(value)) return { error: 'metric definition must be a mapping' }
  if (Object.keys(value).some(key => !['display', 'value', 'source', 'extract', 'parameters'].includes(key))) return { error: 'metric definition contains an unknown configuration key' }
  const display = value.display
  const metricValue = value.value
  const extract = value.extract
  if (display !== undefined && !isRecord(display)) return { error: 'display must be a mapping' }
  if (metricValue !== undefined && !isRecord(metricValue)) return { error: 'value must be a mapping' }
  if (extract !== undefined && !isRecord(extract)) return { error: 'extract must be a mapping' }
  if (!partial && (!isRecord(display) || !isRecord(extract))) return { error: 'display and extract are required' }
  if (isRecord(display) && Object.keys(display).some(key => !['label', 'chart'].includes(key))) return { error: 'display contains an unknown configuration key' }
  if (isRecord(metricValue) && Object.keys(metricValue).some(key => !['kind', 'unit', 'rate', 'transform', 'default_color', 'colors', 'labels'].includes(key))) return { error: 'value contains an unknown configuration key' }
  if (isRecord(extract) && Object.keys(extract).some(key => !['jq', 'prometheus', 'text', 'for_each', 'pagination'].includes(key))) return { error: 'extract contains an unknown configuration key' }
  return {
    fields: {
      display: isRecord(display) ? display : {},
      metricValue: isRecord(metricValue) ? metricValue : {},
      extract: isRecord(extract) ? extract : {}
    }
  }
}

function normalizeMetricDefinition(value: unknown, providerCharts?: unknown, partial = false, sharedSources?: Record<string, Record<string, unknown>>, providerTransforms?: unknown): { definition?: Record<string, unknown>; error?: string } {
  const parsed = metricDefinitionFields(value, partial)
  if (parsed.error || !parsed.fields) return { error: parsed.error }
  const { display: displayFields, metricValue: valueFields, extract: extractFields } = parsed.fields
  const parameters = isRecord(value) ? parseMetricParameters(value.parameters, providerTransforms) : undefined
  if (isRecord(value) && value.parameters !== undefined && !parameters) return { error: 'parameters must define named URL-component parameters and optional provider transforms' }
  const source = normalizeMetricSource(isRecord(value) ? value.source : undefined, sharedSources)
  if (source.error) return { error: source.error }

  const chartName = string(displayFields.chart)
  const chartGroup = chartName && isRecord(providerCharts) ? providerCharts[chartName] : undefined
  const chartStyle = parseChart(chartGroup) ?? (isRecord(chartGroup) ? parseChart(chartGroup.chart) : undefined)
  const chartUnit = isRecord(chartGroup) ? chartGroup.unit : undefined
  if (chartName !== undefined && !chartStyle && !parseChart(chartName)) return { error: 'display.chart must be a chart style or configured chart group' }
  const definition: Record<string, unknown> = {
    ...(displayFields.label === undefined ? {} : { label: displayFields.label }),
    ...(valueFields.kind === undefined ? {} : { value_type: valueFields.kind }),
    ...(valueFields.unit === undefined ? chartUnit === undefined ? {} : { unit: chartUnit } : { unit: valueFields.unit }),
    ...(valueFields.rate === undefined ? {} : { rate: valueFields.rate }),
    ...(valueFields.transform === undefined ? {} : { transform: valueFields.transform }),
    ...(valueFields.default_color === undefined ? {} : { color: valueFields.default_color }),
    ...(valueFields.colors === undefined ? {} : { state_colors: valueFields.colors }),
    ...(valueFields.labels === undefined ? {} : { state_labels: valueFields.labels }),
    ...(source.source === undefined ? {} : { source: source.source }),
    ...(extractFields.jq === undefined ? {} : { jq: extractFields.jq }),
    ...(extractFields.prometheus === undefined ? {} : { prometheus: extractFields.prometheus }),
    ...(extractFields.text === undefined ? {} : { text: extractFields.text }),
    ...(extractFields.for_each === undefined ? {} : { for_each: extractFields.for_each }),
    ...(extractFields.pagination === undefined ? {} : { pagination: extractFields.pagination }),
    ...(parameters === undefined ? {} : { parameters }),
    ...(chartStyle ? { chart: chartStyle, chart_group: chartName } : parseChart(chartName) ? { chart: chartName } : {})
  }
  return { definition }
}

function parseCustomMetricFields(metric: Record<string, unknown>) {
  const label = string(metric.label)
  const valueType = metric.value_type === undefined ? 'number' : string(metric.value_type)
  const unit = metric.unit === undefined ? 'number' : parseUnit(metric.unit)
  const rate = metric.rate === true
  const chart = metric.chart === undefined ? 'step' : parseChart(metric.chart)
  const chartGroup = metric.chart_group === undefined ? undefined : string(metric.chart_group)
  const transform = metric.transform === undefined ? undefined : parseMetricTransform(metric.transform)
  const color = metric.color === undefined ? undefined : parseMetricStateColor(metric.color)
  const stateColors = metric.state_colors === undefined ? undefined : parseMetricStateColors(metric.state_colors)
  const stateLabels = metric.state_labels === undefined ? undefined : parseMetricStateLabels(metric.state_labels)
  const parameters = metric.parameters === undefined ? undefined : parseMetricParameters(metric.parameters)
  const text = metric.text === true
  const forEach = metric.for_each === undefined ? undefined : parseForEachMetric(metric.for_each)
  const pagination = metric.pagination === undefined ? undefined : parseMetricPagination(metric.pagination)
  const source = isRecord(metric.source) ? metric.source : undefined
  const url = string(source?.url)
  const transport = source?.transport === undefined ? undefined : string(source.transport)
  const jq = parseJqExtractor(metric.jq)
  const prometheus = parsePrometheusExtractor(metric.prometheus)
  return { label, valueType, unit, rate, chart, chartGroup, transform, color, stateColors, stateLabels, parameters, text, forEach, pagination, source, url, transport, jq, prometheus }
}

function parseCustomMetricRequestSource(source: Record<string, unknown>, url: string, transport: string | undefined, socketio: { socketio?: SocketIoMetricSource }): { source?: MetricSourceOverride; error?: string } {
  const sourceRequest = transport === 'socketio' ? {} : parseMetricRequest(
    Object.fromEntries(Object.entries(source).filter(([name]) => name !== 'auth')),
    'source'
  )
  if (sourceRequest.error || (transport !== 'socketio' && !sourceRequest.request)) return { error: sourceRequest.error ?? 'source is invalid' }
  const socketHeaders = transport === 'socketio' ? parseMetricHeaders(source) : {}
  if (socketHeaders.error) return { error: socketHeaders.error }
  const { auth, error: authError } = parseMetricHttpAuth(source.auth)
  if (authError) return { error: authError }
  if (transport === 'socketio' && auth?.optional) return { error: 'optional authentication is only supported for HTTP metrics' }
  return {
    source: transport === 'socketio'
      ? { url, transport: 'socketio', ...(socketHeaders.headers ? { headers: socketHeaders.headers } : {}), ...(auth ? { auth } : {}), socketio: socketio.socketio! }
      : { ...sourceRequest.request!, ...(auth ? { auth } : {}) }
  }
}

function parseCustomMetric(key: string, configuredMetric: unknown, catalog: Record<string, Record<string, unknown>>): { metric?: MetricOverride; error?: string } {
  if (!/^[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/.test(key) || !isRecord(configuredMetric)) {
    return { error: 'metric key or definition is invalid' }
  }
  const metric = mergeCatalogMetric(catalog[key], configuredMetric)
  const { label, valueType, unit, rate, chart, chartGroup, transform, color, stateColors, stateLabels, parameters, text, forEach, pagination, source, url, transport, jq, prometheus } = parseCustomMetricFields(metric)
  if (!label) return { error: 'label must be a non-empty string' }
  if (!source || !url) return { error: 'source.url is required' }
  if (!isMetricUrl(url)) return { error: 'source.url must use HTTP or HTTPS, or begin with {url} or {metric_source}' }
  if (transport !== undefined && transport !== 'socketio') return { error: 'source.transport must be socketio when specified' }
  if (metric.prometheus !== undefined && !prometheus) return { error: 'prometheus.name, labels, reduction, or value_label is invalid' }
  if (metric.for_each !== undefined && !forEach) return { error: 'for_each requires item and value jq expressions, a child URL containing {item}, and a reduction' }
  if (metric.pagination !== undefined && (!pagination || !jq)) return { error: 'pagination requires a jq extractor with items and next expressions' }
  if (Number(jq !== undefined) + Number(prometheus !== undefined) + Number(text) + Number(forEach !== undefined) !== 1) {
    return { error: 'define exactly one valid jq, prometheus, text, or for_each extractor' }
  }
  if (valueType !== 'number' && valueType !== 'string' && valueType !== 'state' && valueType !== 'uptime') return { error: 'value_type must be number, string, state, or uptime' }
  if (metric.rate !== undefined && metric.rate !== true) return { error: 'rate must be true when specified' }
  if (!chart) return { error: 'chart must be step, line, area, or none' }
  if (metric.transform !== undefined && !transform) return { error: 'transform must define finite multiply and/or add values' }
  if (metric.color !== undefined && !color) return { error: 'color must be success, info, warning, error, or disabled' }
  if (metric.state_colors !== undefined && !stateColors) return { error: 'state_colors must map non-empty values to success, info, warning, error, or disabled' }
  if (metric.state_labels !== undefined && !stateLabels) return { error: 'state_labels must map non-empty values to display labels of at most 32 characters' }
  if (metric.parameters !== undefined && !parameters) return { error: 'parameters must define named URL-component parameters' }
  if (metric.chart_group !== undefined && (!chartGroup || !/^[a-z][a-z0-9_-]*$/.test(chartGroup))) return { error: 'chart_group must be a lowercase identifier' }
  if ((valueType === 'string' || valueType === 'state') && (metric.unit !== undefined || metric.chart !== undefined || metric.chart_group !== undefined || metric.transform !== undefined || prometheus?.reduce !== undefined || (prometheus && !prometheus.valueLabel))) {
    return { error: 'string metrics cannot use units, reductions, or charts' }
  }
  if ((valueType === 'number' || valueType === 'string') && color !== undefined) return { error: 'color requires value_type state' }
  if ((valueType === 'number' || valueType === 'string') && stateColors !== undefined) return { error: 'state_colors requires value_type state' }
  if ((valueType === 'number' || valueType === 'string') && stateLabels !== undefined) return { error: 'state_labels requires value_type state' }
  if (valueType === 'state' && color === undefined) return { error: 'state metrics require a color' }
  if (valueType === 'number' && (!unit || prometheus?.valueLabel !== undefined || (chartGroup !== undefined && chart === 'none'))) {
    return {
      error: chartGroup !== undefined && chart === 'none'
        ? 'chart_group requires a visible chart'
        : 'numeric metrics require a valid unit and cannot use value_label'
    }
  }
  if (rate && valueType !== 'number') return { error: 'rate requires value_type number' }
  if (forEach && (valueType !== 'number' || transport === 'socketio')) return { error: 'for_each requires a numeric HTTP metric' }
  if (pagination && transport === 'socketio') return { error: 'pagination requires an HTTP metric' }

  const socketio = transport === 'socketio' ? parseSocketIoSource(source) : {}
  if (socketio.error) return { error: socketio.error }
  if (transport === 'socketio' && prometheus) return { error: 'Socket.IO sources require a jq extractor' }
  const parsedSource = parseCustomMetricRequestSource(source, url, transport, socketio)
  if (parsedSource.error || !parsedSource.source) return { error: parsedSource.error ?? 'source is invalid' }

  const common = {
    label,
    ...(parameters ? { parameters } : {}),
    ...(pagination ? { pagination } : {}),
    source: parsedSource.source
  }
  if (valueType === 'uptime') {
    if (!jq) return { error: 'uptime metrics require a jq extractor' }
    if (metric.unit !== undefined || metric.chart !== undefined || metric.chart_group !== undefined || metric.rate !== undefined || metric.transform !== undefined || metric.color !== undefined || metric.state_colors !== undefined || metric.state_labels !== undefined || transport !== undefined) {
      return { error: 'uptime metrics cannot use units, charts, transforms, state colors, or Socket.IO' }
    }
    return { metric: { ...common, valueType, jq } }
  }
  if (valueType === 'string') return { metric: text ? { ...common, valueType, text: true } : jq ? { ...common, valueType, jq } : { ...common, valueType, prometheus: prometheus! } }
  if (valueType === 'state') {
    const colors = stateColors ? { stateColors } : {}
    const labels = stateLabels ? { stateLabels } : {}
    return { metric: text ? { ...common, valueType, color: color!, ...colors, ...labels, text: true } : jq ? { ...common, valueType, color: color!, ...colors, ...labels, jq } : { ...common, valueType, color: color!, ...colors, ...labels, prometheus: prometheus! } }
  }
  const numeric = { ...common, valueType: 'number' as const, unit: unit!, chart, ...(chartGroup === undefined ? {} : { chartGroup }), ...(rate ? { rate: true as const } : {}), ...(transform === undefined ? {} : { transform }) }
  return { metric: forEach ? { ...numeric, forEach } : text ? { ...numeric, text: true } : jq ? { ...numeric, jq } : { ...numeric, prometheus: prometheus! } }
}

function parseMetricOverrides(value: unknown, catalog = metricCatalog(), charts?: unknown, partial = false, sharedSources?: Record<string, Record<string, unknown>>): { metrics?: ServiceMetricOverrides; errors?: Record<string, string> } {
  if (!isRecord(value)) return {}
  const metrics: ServiceMetricOverrides = {}
  const errors: Record<string, string> = {}

  for (const [key, configuredMetric] of Object.entries(value)) {
    const normalized = normalizeMetricDefinition(configuredMetric, charts, partial, sharedSources)
    const parsed = normalized.definition
      ? parseCustomMetric(key, normalized.definition, catalog)
      : { error: normalized.error }
    if (parsed.error || !parsed.metric) rejectMetric(key, parsed.error ?? 'custom metric is invalid', errors)
    else metrics[key] = parsed.metric
  }

  for (const [key, reason] of inconsistentChartGroupMetrics(metrics)) {
    rejectMetric(key, reason, errors)
    delete metrics[key]
  }

  return {
    ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
    ...(Object.keys(errors).length > 0 ? { errors } : {})
  }
}

export function loadMetricCatalog(): ServiceMetricOverrides {
  const catalog = metricCatalog()
  return Object.fromEntries(Object.entries(catalog).flatMap(([key, definition]) => {
    const parsed = parseCustomMetric(key, definition, {})
    return parsed.metric ? [[key, parsed.metric]] : []
  }))
}

function parseDuration(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value)
  if (!match || match[1] === '0') return undefined
  const scale = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 'ms' | 's' | 'm' | 'h' | 'd']
  return Number(match[1]) * scale
}

function parseMetricSources(value: unknown, path: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) invalid(`${path}.sources`, 'a mapping of provider names to HTTP or HTTPS URLs')
  const sources: Record<string, string> = {}
  for (const [provider, url] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(provider) || typeof url !== 'string' || !isHttpUrl(url)) invalid(`${path}.sources.${provider}`, 'an HTTP or HTTPS URL')
    sources[provider] = url
  }
  return sources
}

function parseMetricsCollection(value: unknown, path: string): ServiceMetrics['collection'] | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) invalid(`${path}.collection`, 'a mapping')
  validateKnownFields(value, new Set(['interval', 'retention']), `${path}.collection`)
  const intervalMs = value.interval === undefined ? undefined : parseDuration(value.interval)
  const retentionMs = value.retention === undefined ? undefined : parseDuration(value.retention)
  if (value.interval !== undefined && intervalMs === undefined) invalid(`${path}.collection.interval`, 'a positive duration such as 30s')
  if (value.retention !== undefined && retentionMs === undefined) invalid(`${path}.collection.retention`, 'a positive duration such as 14d')
  return { ...(intervalMs === undefined ? {} : { intervalMs }), ...(retentionMs === undefined ? {} : { retentionMs }) }
}

function parseMetricCharts(value: unknown, path: string): ServiceMetrics['charts'] | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) invalid(`${path}.charts`, 'a mapping')
  const charts: NonNullable<ServiceMetrics['charts']> = {}
  for (const [name, chart] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(name) || !isRecord(chart)) invalid(`${path}.charts.${name}`, 'a named chart mapping')
    validateKnownFields(chart, new Set(['label', 'unit', 'style']), `${path}.charts.${name}`)
    const unit = parseUnit(chart.unit)
    const style = parseChart(chart.style)
    if (!unit || !style || style === 'none') invalid(`${path}.charts.${name}`, 'a chart with a valid unit and visible style')
    charts[name] = { unit, chart: style }
  }
  return charts
}

function parseMetricEntries(value: unknown, path: string, catalog: Record<string, Record<string, unknown>>, charts: ServiceMetrics['charts'], sharedSources?: Record<string, Record<string, unknown>>): Pick<ServiceMetrics, 'entries' | 'entryAccess' | 'entryOverrides' | 'entryInputs' | 'entryErrors'> {
  if (value === undefined) return {}
  if (!isRecord(value)) invalid(`${path}.entries`, 'a mapping of metric entries')
  const definitions: Record<string, unknown> = {}
  const overrides: Record<string, unknown> = {}
  const access: Record<string, string[]> = {}
  const inputs: Record<string, Record<string, string | number | boolean>> = {}
  const entries: string[] = []
  for (const [name, definition] of Object.entries(value)) {
    const entryPath = `${path}.entries.${name}`
    if (RESOURCE_STATS.includes(name as ResourceStat)) {
      if (definition !== null && !isRecord(definition)) invalid(entryPath, 'a built-in metric mapping')
      const configured = definition ?? {}
      validateKnownFields(configured, new Set(['visible_to']), entryPath)
      const visibleTo = configured.visible_to === undefined ? undefined : stringList(configured.visible_to)
      if (configured.visible_to !== undefined && !visibleTo) invalid(`${entryPath}.visible_to`, 'a non-empty string or list of strings')
      if (visibleTo) access[name] = visibleTo
      entries.push(name)
      continue
    }
    if (catalog[name]) {
      if (definition !== null && !isRecord(definition)) invalid(entryPath, 'a shipped metric mapping')
      const configured = definition ?? {}
      validateKnownFields(configured, new Set(['inputs', 'overrides', 'visible_to']), entryPath)
      let configuredInputs: Record<string, string | number | boolean> | undefined
      if (configured.inputs !== undefined) {
        if (!isRecord(configured.inputs) || Object.values(configured.inputs).some(item => typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean')) invalid(`${entryPath}.inputs`, 'a mapping of scalar values')
        configuredInputs = configured.inputs as Record<string, string | number | boolean>
      }
      const parameters = parseMetricParameters(catalog[name]?.parameters)
      for (const input of Object.keys(configuredInputs ?? {})) if (!parameters?.[input]) invalid(`${entryPath}.inputs.${input}`, 'a declared metric input')
      if (configuredInputs) inputs[name] = configuredInputs
      if (configured.overrides !== undefined) overrides[name] = configured.overrides
      const visibleTo = configured.visible_to === undefined ? undefined : stringList(configured.visible_to)
      if (configured.visible_to !== undefined && !visibleTo) invalid(`${entryPath}.visible_to`, 'a non-empty string or list of strings')
      if (visibleTo) access[name] = visibleTo
      entries.push(name)
      continue
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(name) || !isRecord(definition)) invalid(entryPath, 'a named metric mapping')
    const { visible_to: visibleTo, ...metric } = definition
    if (visibleTo !== undefined) {
      validateStringList(visibleTo, `${entryPath}.visible_to`)
      access[name] = stringList(visibleTo)!
    }
    definitions[name] = metric
    entries.push(name)
  }
  const parsedOverrides = parseMetricOverrides(overrides, catalog, charts, true)
  for (const [key, reason] of Object.entries(parsedOverrides.errors ?? {})) invalid(`${path}.entries.${key}.overrides`, reason)
  const parsed = parseMetricOverrides(definitions, catalog, charts, false, sharedSources)
  const entryOverrides = { ...parsedOverrides.metrics, ...parsed.metrics }
  return {
    ...(entries.length > 0 ? { entries: entries.filter(key => !parsed.errors?.[key]) } : {}),
    ...(Object.keys(access).length > 0 ? { entryAccess: access } : {}),
    ...(Object.keys(entryOverrides).length > 0 ? { entryOverrides } : {}),
    ...(Object.keys(inputs).length > 0 ? { entryInputs: inputs } : {}),
    ...(parsed.errors && Object.keys(parsed.errors).length > 0 ? { entryErrors: parsed.errors } : {})
  }
}

function parseServiceMetrics(value: unknown, path: string, sharedSources?: Record<string, Record<string, unknown>>): ServiceMetrics | undefined {
  if (value === undefined) return undefined
  if (value === 'none') return { entries: [] }
  if (!isRecord(value)) invalid(path, 'a mapping')
  validateKnownFields(value, new Set(['sources', 'collection', 'charts', 'entries']), path)
  const sources = parseMetricSources(value.sources, path)
  const collection = parseMetricsCollection(value.collection, path)
  const charts = parseMetricCharts(value.charts, path)
  const catalog = metricCatalog()
  const entries = parseMetricEntries(value.entries, path, catalog, charts, sharedSources)
  return {
    ...(sources === undefined ? {} : { sources }),
    ...(collection === undefined ? {} : { collection }),
    ...(charts === undefined ? {} : { charts }),
    ...entries
  }
}

function parseService(value: unknown, path: string, sharedSources?: Record<string, Record<string, unknown>>): ServiceOverrides {
  if (!isRecord(value)) invalid(path, 'a mapping')
  validateKnownFields(value, SERVICE_FIELDS, path)
  for (const key of ['title', 'description', 'url', 'icon', 'category', 'host'] as const) validateString(value[key], `${path}.${key}`)
  for (const key of ['hidden', 'show_status'] as const) validateBoolean(value[key], `${path}.${key}`)
  validateNumber(value.order, `${path}.order`)
  for (const key of ['access', 'search_aliases'] as const) validateStringList(value[key], `${path}.${key}`)

  const order = typeof value.order === 'number' && Number.isFinite(value.order)
    ? value.order
    : undefined

  return {
    title: string(value.title),
    description: string(value.description),
    url: string(value.url),
    icon: string(value.icon),
    category: string(value.category),
    host: string(value.host),
    order,
    hidden: typeof value.hidden === 'boolean' ? value.hidden : undefined,
    showStatus: typeof value.show_status === 'boolean' ? value.show_status : undefined,
    access: stringList(value.access),
    searchAliases: stringList(value.search_aliases),
    metrics: parseServiceMetrics(value.metrics, `${path}.metrics`, sharedSources)
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
  const sharedMetricSources = parseSharedMetricSources(value.shared_metric_sources)

  const services: Record<string, ServiceOverrides> = {}
  for (const [name, service] of Object.entries(value)) {
    if (name === 'settings' || name === 'shared_metric_sources') continue
    services[name] = parseService(service, name, sharedMetricSources)
  }

  return { settings: parseSettings(value.settings), ...(sharedMetricSources ? { sharedMetricSources } : {}), services }
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
