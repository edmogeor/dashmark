import fs from 'node:fs'
import path from 'node:path'
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

type MetricSecretReference = { env?: string; file?: string; label?: string; value?: string }
type MetricTokenReference = { token: string }
type MetricValueReference = MetricSecretReference | MetricTokenReference

type MetricTokenExtractor =
  | { cheerio: { selector: string; attribute?: string } }
  | { jq: string }

type MetricHttpRequest = {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, MetricValueReference>
  query?: Record<string, MetricValueReference>
  form?: Record<string, MetricValueReference>
  json?: Record<string, MetricValueReference>
  extract?: Record<string, MetricTokenExtractor>
}

type SocketIoArgument = string | number | boolean | MetricSecretReference

type SocketIoMetricSource = {
  auth?: Record<string, MetricValueReference>
  login?: { event: string; args?: SocketIoArgument[] }
  request: { event: string; args?: SocketIoArgument[] }
}

type MetricSourceOverride = {
  url: string
  method?: 'GET' | 'POST'
  transport?: 'socketio'
  headers?: Record<string, MetricValueReference>
  query?: Record<string, MetricValueReference>
  form?: Record<string, MetricValueReference>
  json?: Record<string, MetricValueReference>
  auth?: MetricHttpAuth
  socketio?: SocketIoMetricSource
}

type CookieSessionMetricAuth = {
  type: 'cookie_session'
  steps: MetricHttpRequest[]
}

type BasicMetricAuth = {
  type: 'basic'
  username: MetricSecretReference
  password: MetricSecretReference
}

type MetricHttpAuth = CookieSessionMetricAuth | BasicMetricAuth

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

export type PrometheusMetricExtractor = {
  name: string
  labels?: Record<string, string>
  reduce?: CustomMetricReduction
  valueLabel?: string
}

export type JqMetricExtractor = { expression: string }

export type MetricTransform = {
  multiply?: number
  add?: number
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
  transform?: MetricTransform
} & ({ jq: JqMetricExtractor; prometheus?: never } | { prometheus: PrometheusMetricExtractor; jq?: never })

export type TextMetricOverride = MetricCommon & {
  valueType: 'string'
} & ({ jq: JqMetricExtractor; prometheus?: never } | { prometheus: PrometheusMetricExtractor; jq?: never })

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
  'title', 'description', 'url', 'icon', 'category', 'order', 'hidden', 'show_status', 'metrics', 'metric_providers',
  'metrics_url',
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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isMetricUrl(value: string): boolean {
  return isHttpUrl(value) || /^\{(?:url|metrics_url)\}(?:\/|$)/.test(value)
}

function metricProviders(value: unknown): string[] | undefined {
  const providers = stringList(value)
  return providers && providers.length > 0 && providers.every(provider => /^[a-z][a-z0-9_-]*$/.test(provider))
    ? [...new Set(providers)]
    : undefined
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

function metricCatalog(): Record<string, Record<string, unknown>> {
  const directory = path.resolve(process.env.DASHMARK_METRICS_DIR ?? 'metrics')
  try {
    const files = fs.readdirSync(directory, { withFileTypes: true }).flatMap(provider => {
      if (!provider.isDirectory()) return []
      return fs.readdirSync(path.join(directory, provider.name), { withFileTypes: true }).flatMap(file => {
        if (!file.isFile() || !file.name.endsWith('.yml')) return []
        const filePath = path.join(directory, provider.name, file.name)
        return [{ key: `${provider.name}/${file.name.slice(0, -4)}`, path: filePath, stat: fs.statSync(filePath) }]
      })
    })
    const signature = files.map(file => `${file.path}:${file.stat.mtimeMs}:${file.stat.size}`).join('|')
    if (cachedCatalog?.signature === signature) return cachedCatalog.metrics
    const metrics = files.reduce<Record<string, Record<string, unknown>>>((catalog, file) => {
      const definition = yaml.load(fs.readFileSync(file.path, 'utf8'))
      return isRecord(definition) ? { ...catalog, [file.key]: definition } : catalog
    }, {})
    cachedCatalog = { signature, metrics }
    return metrics
  } catch (error) {
    logger.error('config', 'failed to load metric catalog', { error: error instanceof Error ? error.message : 'unknown error' })
    return {}
  }
}

function parseMetricHeaders(source: Record<string, unknown>): { headers?: Record<string, MetricValueReference>; query?: Record<string, MetricValueReference>; error?: string } {
  const references = (value: unknown, kind: string): { values?: Record<string, MetricValueReference>; error?: string } => {
    if (value === undefined) return {}
    if (!isRecord(value)) return { error: `${kind} must be a mapping` }
    const values: Record<string, MetricValueReference> = {}
    for (const [name, reference] of Object.entries(value)) {
      const value = parseValueReference(reference)
      if (!value || !name) return { error: `${kind} must use valid names and secret or token references` }
      values[name] = value
    }
    return { values }
  }

  const headers = references(source.headers, 'headers')
  if (headers.error || (headers.values && !Object.keys(headers.values).every(header => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header)))) return { error: headers.error ?? 'headers must use valid names and secret or token references' }
  const query = references(source.query, 'query')
  if (query.error) return { error: query.error }
  return { ...(headers.values && Object.keys(headers.values).length > 0 ? { headers: headers.values } : {}), ...(query.values && Object.keys(query.values).length > 0 ? { query: query.values } : {}) }
}

function parseValueReference(value: unknown): MetricValueReference | undefined {
  const secret = parseSecretReference(value)
  if (secret) return secret
  if (!isRecord(value) || typeof value.token !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(value.token) || Object.keys(value).length !== 1) return undefined
  return { token: value.token }
}

const MAX_AUTH_STEPS = 5
const MAX_EXTRACTED_TOKENS = 16

function parseMetricRequest(value: unknown, path: string): { request?: MetricHttpRequest; error?: string } {
  if (!isRecord(value) || Object.keys(value).some(key => !['url', 'method', 'headers', 'query', 'form', 'json', 'extract'].includes(key))) {
    return { error: `${path} contains an unknown configuration key` }
  }
  const url = string(value.url)
  if (!url || !isMetricUrl(url)) return { error: `${path}.url must use HTTP or HTTPS, or begin with {url} or {metrics_url}` }
  const method = value.method === undefined ? 'GET' : string(value.method)
  if (method !== 'GET' && method !== 'POST') return { error: `${path}.method must be GET or POST` }
  if (method === 'GET' && (value.form !== undefined || value.json !== undefined)) return { error: `${path} GET requests cannot define form or json` }
  if (method === 'POST' && Number(value.form !== undefined) + Number(value.json !== undefined) > 1) return { error: `${path} must define at most one form or json body` }
  const { headers, query, error } = parseMetricHeaders(value)
  if (error) return { error: `${path}.${error}` }
  const parseBody = (body: unknown, kind: string): { values?: Record<string, MetricValueReference>; error?: string } => {
    if (body === undefined) return {}
    if (!isRecord(body) || Object.keys(body).length === 0) return { error: `${path}.${kind} must be a non-empty mapping of secret or token references` }
    const values: Record<string, MetricValueReference> = {}
    for (const [name, reference] of Object.entries(body)) {
      const parsed = parseValueReference(reference)
      if (!name || !parsed) return { error: `${path}.${kind} must be a non-empty mapping of secret or token references` }
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
  return { request: { url, ...(value.method === undefined ? {} : { method }), ...(headers ? { headers } : {}), ...(query ? { query } : {}), ...(form.values ? { form: form.values } : {}), ...(json.values ? { json: json.values } : {}), ...(extract ? { extract } : {}) } }
}

function parseMetricHttpAuth(value: unknown): { auth?: MetricHttpAuth; error?: string } {
  if (value === undefined) return {}
  if (!isRecord(value)) return { error: 'source.auth must define a supported authentication type' }
  if (value.type === 'basic') {
    if (Object.keys(value).some(key => !['type', 'username', 'password'].includes(key))) return { error: 'source.auth type basic only supports username and password' }
    const username = parseSecretReference(value.username)
    const password = parseSecretReference(value.password)
    if (!username || !password) return { error: 'source.auth type basic requires username and password secret references' }
    return { auth: { type: 'basic', username, password } }
  }
  if (value.type !== 'cookie_session' || Object.keys(value).some(key => !['type', 'steps', 'login'].includes(key))) return { error: 'source.auth must define type basic with username and password, or type cookie_session with a steps list' }
  const configuredSteps = Array.isArray(value.steps) ? value.steps : value.login === undefined ? undefined : [value.login]
  if (!configuredSteps || configuredSteps.length === 0 || configuredSteps.length > MAX_AUTH_STEPS) return { error: `source.auth.steps must contain between 1 and ${MAX_AUTH_STEPS} requests` }
  const steps: MetricHttpRequest[] = []
  for (const [index, step] of configuredSteps.entries()) {
    const parsed = parseMetricRequest(step, `source.auth.steps.${index}`)
    if (parsed.error || !parsed.request) return { error: parsed.error ?? 'source.auth step is invalid' }
    steps.push(parsed.request)
  }
  return { auth: { type: 'cookie_session', steps } }
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
  if (Object.keys(value).some(key => !['url', 'transport', 'socketio'].includes(key))) return { error: 'Socket.IO sources only support url, transport, and socketio' }
  const socketio = value.socketio
  if (Object.keys(socketio).some(key => !['auth', 'login', 'request'].includes(key))) return { error: 'source.socketio contains an unknown configuration key' }
  const auth = socketio.auth === undefined ? {} : parseMetricHeaders({ headers: socketio.auth })
  if (auth.error) return { error: `source.socketio.auth ${auth.error}` }
  const login = socketio.login === undefined ? {} : parseSocketIoEvent(socketio.login, 'source.socketio.login')
  if (login.error) return { error: login.error }
  const request = parseSocketIoEvent(socketio.request, 'source.socketio.request')
  if (request.error || !request.event) return { error: request.error ?? 'source.socketio.request is required' }
  return {
    socketio: {
      ...(auth.headers ? { auth: auth.headers } : {}),
      ...(login.event ? { login: login.event } : {}),
      request: request.event
    }
  }
}

function parseMetricOverrides(value: unknown, catalog = metricCatalog()): { metrics?: ServiceMetricOverrides; errors?: Record<string, string> } {
  if (!isRecord(value)) return {}
  const metrics: ServiceMetricOverrides = {}
  const errors: Record<string, string> = {}

  for (const [key, configuredMetric] of Object.entries(value)) {
    const invalid = (reason: string) => {
      errors[key] = reason
      logger.warn('config', 'ignoring invalid custom metric', { key, reason })
    }
    if (!/^[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/.test(key) || !isRecord(configuredMetric)) {
      invalid('metric key or definition is invalid')
      continue
    }
    const metric = catalog[key] ? { ...catalog[key], ...configuredMetric } : configuredMetric
    const label = string(metric.label)
    const valueType = metric.value_type === undefined ? 'number' : string(metric.value_type)
    const unit = metric.unit === undefined ? 'number' : parseUnit(metric.unit)
    const chart = metric.chart === undefined ? 'step' : parseChart(metric.chart)
    const chartGroup = metric.chart_group === undefined ? undefined : string(metric.chart_group)
    const transform = metric.transform === undefined ? undefined : parseMetricTransform(metric.transform)
    const source = isRecord(metric.source) ? metric.source : undefined
    const url = string(source?.url)
    const transport = source?.transport === undefined ? undefined : string(source.transport)
    const jq = parseJqExtractor(metric.jq)
    const prometheus = parsePrometheusExtractor(metric.prometheus)
    if (!label) {
      invalid('label must be a non-empty string')
      continue
    }
    if (!source || !url) {
      invalid('source.url is required')
      continue
    }
    if (!isMetricUrl(url)) {
      invalid('source.url must use HTTP or HTTPS, or begin with {url} or {metrics_url}')
      continue
    }
    if (transport !== undefined && transport !== 'socketio') {
      invalid('source.transport must be socketio when specified')
      continue
    }
    if (metric.prometheus !== undefined && !prometheus) {
      invalid('prometheus.name, labels, reduction, or value_label is invalid')
      continue
    }
    if (Number(jq !== undefined) + Number(prometheus !== undefined) !== 1) {
      invalid('define exactly one valid jq or prometheus extractor')
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
    if (metric.transform !== undefined && !transform) {
      invalid('transform must define finite multiply and/or add values')
      continue
    }
    if (metric.chart_group !== undefined && (!chartGroup || !/^[a-z][a-z0-9_-]*$/.test(chartGroup))) {
      invalid('chart_group must be a lowercase identifier')
      continue
    }
    if (valueType === 'string' && (metric.unit !== undefined || metric.chart !== undefined || metric.chart_group !== undefined || metric.transform !== undefined || prometheus?.reduce !== undefined || (prometheus && !prometheus.valueLabel))) {
      invalid('string metrics cannot use units, reductions, or charts')
      continue
    }
    if (valueType === 'number' && (!unit || prometheus?.valueLabel !== undefined || (chartGroup !== undefined && chart === 'none'))) {
      invalid(chartGroup !== undefined && chart === 'none'
        ? 'chart_group requires a visible chart'
        : 'numeric metrics require a valid unit and cannot use value_label')
      continue
    }

    const socketio = transport === 'socketio' ? parseSocketIoSource(source) : {}
    if (socketio.error) {
      invalid(socketio.error)
      continue
    }
    if (transport === 'socketio' && prometheus) {
      invalid('Socket.IO sources require a jq extractor')
      continue
    }
    const sourceRequest = transport === 'socketio' ? {} : parseMetricRequest(
      Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'auth')),
      'source'
    )
    if (sourceRequest.error || (transport !== 'socketio' && !sourceRequest.request)) {
      invalid(sourceRequest.error ?? 'source is invalid')
      continue
    }
    const { auth, error: authError } = transport === 'socketio' ? {} : parseMetricHttpAuth(source.auth)
    if (authError) {
      invalid(authError)
      continue
    }

    const common = {
      label,
      source: transport === 'socketio'
        ? { url, transport: 'socketio' as const, socketio: socketio.socketio! }
        : { ...sourceRequest.request!, ...(auth ? { auth } : {}) }
    }
    if (valueType === 'string') metrics[key] = jq ? { ...common, valueType, jq } : { ...common, valueType, prometheus: prometheus! }
    else {
      const numeric = { ...common, valueType: 'number' as const, unit: unit!, chart, ...(chartGroup === undefined ? {} : { chartGroup }), ...(transform === undefined ? {} : { transform }) }
      metrics[key] = jq ? { ...numeric, jq } : { ...numeric, prometheus: prometheus! }
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

export function loadMetricCatalog(): ServiceMetricOverrides {
  const catalog = metricCatalog()
  const sourced = Object.fromEntries(Object.entries(catalog).filter(([, metric]) => isRecord(metric.source)))
  return parseMetricOverrides(sourced, {}).metrics ?? {}
}

function parseService(value: unknown, path: string): ServiceOverrides {
  if (!isRecord(value)) invalid(path, 'a mapping')
  validateKnownFields(value, SERVICE_FIELDS, path)
  for (const key of ['title', 'description', 'url', 'metrics_url', 'icon', 'category'] as const) validateString(value[key], `${path}.${key}`)
  if (value.metrics_url !== undefined && (!isHttpUrl(value.metrics_url as string))) invalid(`${path}.metrics_url`, 'an HTTP or HTTPS URL')
  for (const key of ['hidden', 'show_status'] as const) validateBoolean(value[key], `${path}.${key}`)
  validateNumber(value.order, `${path}.order`)
  for (const key of ['metrics_poll_interval', 'metrics_history_period'] as const) validatePositiveInteger(value[key], `${path}.${key}`)
  if (value.metric_providers !== undefined && !metricProviders(value.metric_providers)) invalid(`${path}.metric_providers`, 'a lowercase provider identifier or non-empty list of identifiers')
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
    metricsUrl: string(value.metrics_url),
    icon: string(value.icon),
    category: string(value.category),
    order,
    hidden: typeof value.hidden === 'boolean' ? value.hidden : undefined,
    showStatus: typeof value.show_status === 'boolean' ? value.show_status : undefined,
    resourceStats: metricKeys ? parseResourceStats(metricKeys) : undefined,
    metrics: metricKeys,
    metricProviders: metricProviders(value.metric_providers),
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
