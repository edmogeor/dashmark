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

export type MetricSecretReference = {
  env?: string
  file?: string
  label?: string
  value?: string
}
export type MetricTokenReference = { token: string; prefix?: string }
export type MetricValueReference = MetricSecretReference | MetricTokenReference
export type MetricParameterReference = { parameter: string }
export type MetricBoundParameterReference = {
  __dashmarkParameterValue: MetricLiteral
}
export type MetricLiteral = string | number | boolean
export type MetricRequestValue = MetricValueReference | MetricLiteral
export type MetricJsonValue = MetricRequestValue | MetricParameterReference | MetricBoundParameterReference | null | MetricJsonValue[] | { [key: string]: MetricJsonValue }

export type MetricTokenExtractor = { cheerio: { selector: string; attribute?: string } } | { jq: string }

export type MetricHttpRequest = {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, MetricRequestValue>
  query?: Record<string, MetricRequestValue>
  form?: Record<string, MetricRequestValue>
  json?: Record<string, MetricJsonValue>
  extract?: Record<string, MetricTokenExtractor>
}

export type SocketIoArgument = string | number | boolean | MetricSecretReference

export type SocketIoMetricSource = {
  path?: string
  auth?: Record<string, MetricRequestValue>
  login?: { event: string; args?: SocketIoArgument[] }
  request: { event: string; args?: SocketIoArgument[] }
}

export type MetricSourceOverride = {
  url: string
  method?: 'GET' | 'POST'
  transport?: 'socketio'
  headers?: Record<string, MetricRequestValue>
  query?: Record<string, MetricRequestValue>
  initialQuery?: Record<string, MetricRequestValue>
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

type TokenMetricAuth = ({ header: string; query?: never } | { header?: never; query: string }) & {
  type: 'token'
  optional?: boolean
  prefix?: string
  value: MetricSecretReference
}

export type MetricHttpAuth = CookieSessionMetricAuth | BasicMetricAuth | TokenMetricAuth

export const CUSTOM_METRIC_UNITS = [
  'number',
  'count',
  'percent',
  'ratio',
  'bytes',
  'bytes_per_second',
  'bits',
  'bits_per_second',
  'seconds',
  'milliseconds',
  'microseconds',
  'duration',
  'hertz',
  'watts',
  'volts',
  'amperes',
  'celsius',
  'fahrenheit',
  'boolean'
] as const
type CustomMetricUnit = (typeof CUSTOM_METRIC_UNITS)[number]
export type MetricUnit = CustomMetricUnit | { suffix: string }
export const CUSTOM_METRIC_REDUCTIONS = ['count', 'sum', 'average', 'minimum', 'maximum'] as const
export type CustomMetricReduction = (typeof CUSTOM_METRIC_REDUCTIONS)[number]
export const CUSTOM_METRIC_CHARTS = ['step', 'line', 'area', 'none'] as const
export type CustomMetricChart = (typeof CUSTOM_METRIC_CHARTS)[number]
export const CUSTOM_METRIC_BADGE_COLORS = ['success', 'info', 'warning', 'error', 'disabled'] as const

export type PrometheusMetricExtractor = {
  name: string
  labels?: Record<string, string>
  reduce?: CustomMetricReduction
  valueLabel?: string
}

export type JqMetricExtractor = { expression: string }

export type MetricPagination = {
  items: JqMetricExtractor
  next: JqMetricExtractor
}

export type ForEachMetric = {
  items: JqMetricExtractor
  requestUrl: string
  value: JqMetricExtractor
  reduce: CustomMetricReduction
}

export type MetricTransform = { multiply?: number; add?: number }
export type MetricUrlTransform = { trim?: true; lowercase?: true; replace?: Record<string, string> }
export type MetricParameter = { label: string; type: 'url_component' | 'json_value'; transform?: MetricUrlTransform }
type MetricCommon = { label: string; source: MetricSourceOverride; parameters?: Record<string, MetricParameter>; pagination?: MetricPagination }

export type NumericMetricOverride = MetricCommon & {
  valueType: 'number'
  unit: MetricUnit
  chart: CustomMetricChart
  chartGroup?: string
  rate?: true
  transform?: MetricTransform
} & (
    | { jq: JqMetricExtractor; prometheus?: never; text?: never; forEach?: never }
    | { prometheus: PrometheusMetricExtractor; jq?: never; text?: never; forEach?: never }
    | { text: true; jq?: never; prometheus?: never; forEach?: never }
    | { forEach: ForEachMetric; jq?: never; prometheus?: never; text?: never }
  )

export type TextMetricOverride = MetricCommon & { valueType: 'string' } & (
    | { jq: JqMetricExtractor; prometheus?: never; text?: never; forEach?: never }
    | { prometheus: PrometheusMetricExtractor; jq?: never; text?: never; forEach?: never }
    | { text: true; jq?: never; prometheus?: never; forEach?: never }
  )

export type StateMetricOverride = MetricCommon & { valueType: 'state'; color: CustomMetricStateColor; stateColors?: Record<string, CustomMetricStateColor>; stateLabels?: Record<string, string> } & (
    | { jq: JqMetricExtractor; prometheus?: never; text?: never; forEach?: never }
    | { prometheus: PrometheusMetricExtractor; jq?: never; text?: never; forEach?: never }
    | { text: true; jq?: never; prometheus?: never; forEach?: never }
  )

export type UptimeMetricOverride = MetricCommon & { valueType: 'uptime'; jq: JqMetricExtractor; prometheus?: never; text?: never; forEach?: never }
export type MetricOverride = NumericMetricOverride | TextMetricOverride | StateMetricOverride | UptimeMetricOverride
export type ServiceMetricOverrides = Record<string, MetricOverride>

export type DashboardSettings = {
  categoryOrder: string[]
  enableAutomaticDescriptions: boolean
  enableAutomaticIcons: boolean
  showBranding: boolean
  showHeader: boolean
  showGroupTags: boolean
  showThemeToggle: boolean
  openInNewTab: boolean
  customHeader?: string
  greetingMorning?: string
  greetingAfternoon?: string
  greetingEvening?: string
}

export type YamlSettings = Partial<DashboardSettings> & {
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
  authToken?: MetricSecretReference
}

export type YamlConfig = { settings: YamlSettings; sharedMetricSources?: Record<string, Record<string, unknown>>; services: Record<string, ServiceOverrides> }
export type YamlConfigResult = { config: YamlConfig; error?: import('./errors').DashmarkError }
