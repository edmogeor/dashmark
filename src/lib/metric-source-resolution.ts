import type { MetricOverride, ServiceMetricOverrides } from './config-file-types'
import { LABEL_PREFIX } from './constants'
import { isRecord } from './errors'
import { isSecretReference } from './metric-references'

type MetricRequestValue = NonNullable<MetricOverride['source']['headers']>[string]
type MetricJsonValue = NonNullable<MetricOverride['source']['json']>[string]
type SocketIoArgument = NonNullable<NonNullable<MetricOverride['source']['socketio']>['request']['args']>[number]
type CookieSessionAuth = Extract<NonNullable<MetricOverride['source']['auth']>, { type: 'cookie_session' }>
type CookieSessionRequest = CookieSessionAuth['steps'][number]
type BasicAuth = Extract<NonNullable<MetricOverride['source']['auth']>, { type: 'basic' }>
type SecretReference = BasicAuth['username']
type ParameterValues = Record<string, string | number | boolean> | undefined
type MetricResolution = {
  cardUrl: string | undefined
  metricApiUrl: string | undefined
  values: Record<string, string | number | boolean>
  labels: Record<string, string>
}

function isMetricRequestValue(value: unknown): value is MetricRequestValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  return isRecord(value) && (typeof value.token === 'string' || ['env', 'file', 'label', 'value'].some((key) => typeof value[key] === 'string'))
}

function isMetricJsonValue(value: unknown): value is MetricJsonValue {
  if (value === null || isMetricRequestValue(value)) return true
  if (Array.isArray(value)) return value.every(isMetricJsonValue)
  return isRecord(value) && (typeof value.parameter === 'string' || Object.values(value).every(isMetricJsonValue))
}

function isSocketIoArgument(value: unknown): value is SocketIoArgument {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || (isRecord(value) && ['env', 'file', 'label', 'value'].some((key) => typeof value[key] === 'string'))
}

function isParameterReference(value: unknown): value is { parameter: string } {
  return isRecord(value) && typeof value.parameter === 'string'
}

function resolveReference(reference: unknown, labels: Record<string, string>): unknown {
  if (!isRecord(reference)) return reference
  const keys = Object.keys(reference)
  if (keys.length === 1 && typeof reference.token === 'string') return reference
  if (isSecretReference(reference)) {
    const value = typeof reference.label === 'string' ? labels[reference.label] : undefined
    return value === undefined ? reference : { ...reference, value }
  }
  return Object.fromEntries(Object.entries(reference).map(([name, value]) => [name, resolveReference(value, labels)]))
}

function resolveReferences(references: Record<string, MetricRequestValue> | undefined, labels: Record<string, string>): Record<string, MetricRequestValue> {
  const resolved: Record<string, MetricRequestValue> = {}
  for (const [name, reference] of Object.entries(references ?? {})) {
    const value = resolveReference(reference, labels)
    if (isMetricRequestValue(value)) resolved[name] = value
  }
  return resolved
}

function formatParameter(value: string | number | boolean, parameter: NonNullable<MetricOverride['parameters']>[string]): string {
  let text = String(value)
  const transform = parameter.transform
  if (!transform) return text
  if (transform.trim) text = text.trim()
  if (transform.lowercase) text = text.toLowerCase()
  for (const [search, replacement] of Object.entries(transform.replace ?? {})) text = text.replaceAll(search, replacement)
  return text
}

function resolveUrl(url: string, cardUrl: string | undefined, metricApiUrl: string | undefined, parameters: MetricOverride['parameters'], values: ParameterValues): string | undefined {
  const baseUrl = url.startsWith('{metric_source}') ? (metricApiUrl ?? cardUrl) : url.startsWith('{url}') ? cardUrl : undefined
  const placeholder = url.startsWith('{metric_source}') ? '{metric_source}' : '{url}'
  const resolved = baseUrl === undefined && url.startsWith('{') ? undefined : baseUrl ? `${baseUrl.replace(/\/$/, '')}${url.slice(placeholder.length)}` : url
  return resolved?.replace(/\{([a-z][a-z0-9_]*)\}/g, (match, name: string) =>
    !parameters?.[name] || values?.[name] === undefined ? match : encodeURIComponent(formatParameter(values[name], parameters[name]))
  )
}

function resolveJsonValue(value: MetricJsonValue, metric: MetricOverride, values: ParameterValues, labels: Record<string, string>): MetricJsonValue {
  const resolved = resolveReference(value, labels)
  if (!isMetricJsonValue(resolved) || resolved === null || typeof resolved !== 'object') return isMetricJsonValue(resolved) ? resolved : value
  if (Array.isArray(resolved)) return resolved.map((item) => resolveJsonValue(item, metric, values, labels))
  if (Object.keys(resolved).length === 1 && isParameterReference(resolved)) {
    const name = resolved.parameter
    return metric.parameters?.[name]?.type === 'json_value' && values?.[name] !== undefined ? { __dashmarkParameterValue: values[name] } : resolved
  }
  return Object.fromEntries(Object.entries(resolved).map(([name, item]) => [name, resolveJsonValue(item, metric, values, labels)]))
}

function resolveRequest(request: MetricOverride['source'] | CookieSessionRequest, metric: MetricOverride, resolution: MetricResolution) {
  const { cardUrl, metricApiUrl, values, labels } = resolution
  const url = resolveUrl(request.url, cardUrl, metricApiUrl, metric.parameters, values)
  if (!url) return undefined
  const headers = resolveReferences(request.headers, labels)
  const query = resolveReferences(request.query, labels)
  const form = resolveReferences(request.form, labels)
  const json = request.json === undefined ? undefined : Object.fromEntries(Object.entries(request.json).map(([name, value]) => [name, resolveJsonValue(value, metric, values, labels)]))
  return {
    ...request,
    url,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(Object.keys(form).length > 0 ? { form } : {}),
    ...(json && Object.keys(json).length > 0 ? { json } : {})
  }
}

function resolveParameterValues(
  key: string,
  metric: MetricOverride,
  labels: Record<string, string>,
  metricParameters: Record<string, Record<string, string | number | boolean>> | undefined
): Record<string, string | number | boolean> | undefined {
  const metricLabel = key.replaceAll('/', '.')
  const labelValues = Object.fromEntries(
    Object.keys(metric.parameters ?? {}).flatMap((name) => {
      const value = labels[`${LABEL_PREFIX}.metrics_input.${metricLabel}.${name}`]
      return value === undefined ? [] : [[name, value]]
    })
  )
  const values = { ...metricParameters?.[key], ...labelValues }
  return Object.keys(metric.parameters ?? {}).every((name) => values[name] !== undefined) ? values : undefined
}

function resolveForEach(metric: MetricOverride, resolution: MetricResolution): MetricOverride | undefined {
  if (!metric.forEach) return metric
  const requestUrl = resolveUrl(metric.forEach.requestUrl, resolution.cardUrl, resolution.metricApiUrl, metric.parameters, resolution.values)
  return requestUrl ? { ...metric, forEach: { ...metric.forEach, requestUrl } } : undefined
}

function resolveCookieSessionAuth(auth: CookieSessionAuth, metric: MetricOverride, resolution: MetricResolution): CookieSessionAuth | undefined {
  const steps = auth.steps.map((step) => resolveRequest(step, metric, resolution))
  return steps.some((step) => !step) ? undefined : { ...auth, steps: steps.filter((step): step is CookieSessionRequest => step !== undefined) }
}

function resolveAuth(auth: MetricOverride['source']['auth'], metric: MetricOverride, resolution: MetricResolution) {
  if (auth?.type === 'cookie_session') return resolveCookieSessionAuth(auth, metric, resolution)
  if (auth?.type === 'basic') {
    return { ...auth, username: resolveSecretReference(auth.username, resolution.labels), password: resolveSecretReference(auth.password, resolution.labels) }
  }
  if (auth?.type === 'token') return { ...auth, value: resolveSecretReference(auth.value, resolution.labels) }
  return auth
}

function resolveSource(metric: MetricOverride, resolution: MetricResolution): MetricOverride['source'] | undefined {
  const request = resolveRequest({ ...metric.source, method: metric.source.method ?? 'GET' }, metric, resolution)
  if (!request) return undefined

  const auth = resolveAuth(metric.source.auth, metric, resolution)
  if (metric.source.auth?.type === 'cookie_session' && !auth) return undefined

  const initialQuery = resolveReferences(metric.source.initialQuery, resolution.labels)
  return {
    ...request,
    ...(Object.keys(initialQuery).length > 0 ? { initialQuery } : {}),
    ...(metric.source.transport ? { transport: metric.source.transport } : {}),
    ...(metric.source.socketio ? { socketio: resolveSocketIo(metric.source.socketio, resolution.labels) } : {}),
    ...(auth ? { auth } : {})
  }
}

function resolveSocketIo(socketio: NonNullable<MetricOverride['source']['socketio']>, labels: Record<string, string>) {
  const resolveArguments = (args: typeof socketio.request.args) =>
    args?.map((argument) => {
      const resolved = resolveReference(argument, labels)
      return isSocketIoArgument(resolved) ? resolved : argument
    })
  const auth = resolveReferences(socketio.auth, labels)
  return {
    ...socketio,
    ...(Object.keys(auth).length > 0 ? { auth } : {}),
    ...(socketio.login ? { login: { ...socketio.login, ...(socketio.login.args ? { args: resolveArguments(socketio.login.args) } : {}) } } : {}),
    request: { ...socketio.request, ...(socketio.request.args ? { args: resolveArguments(socketio.request.args) } : {}) }
  }
}

function resolveMetric(
  key: string,
  metric: MetricOverride,
  cardUrl: string | undefined,
  metricSources: Record<string, string> | undefined,
  labels: Record<string, string>,
  metricParameters: Record<string, Record<string, string | number | boolean>> | undefined
): MetricOverride | undefined {
  const values = resolveParameterValues(key, metric, labels, metricParameters)
  if (!values) return undefined

  const resolution = { cardUrl, metricApiUrl: metricSources?.[key.split('/')[0]], values, labels }
  const resolvedMetric = resolveForEach(metric, resolution)
  if (!resolvedMetric) return undefined

  const source = resolveSource(resolvedMetric, resolution)
  return source ? { ...resolvedMetric, source } : undefined
}

function resolveSecretReference(reference: SecretReference, labels: Record<string, string>): SecretReference {
  const resolved = resolveReference(reference, labels)
  return isSecretReference(resolved) ? resolved : reference
}

export function resolveMetricSources(
  metrics: ServiceMetricOverrides,
  cardUrl: string | undefined,
  metricSources: Record<string, string> | undefined,
  labels: Record<string, string>,
  metricParameters: Record<string, Record<string, string | number | boolean>> | undefined
): ServiceMetricOverrides | undefined {
  const resolved: ServiceMetricOverrides = {}
  for (const [key, metric] of Object.entries(metrics)) {
    const value = resolveMetric(key, metric, cardUrl, metricSources, labels, metricParameters)
    if (value) resolved[key] = value
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined
}
