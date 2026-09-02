import type { MetricOverride } from '@/lib/config-file-types'
import { loadDefinition, parameterValues, sourceFor } from './fixture-loader'

function resolveParameterValues(value: unknown, values: Record<string, string>): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  if (Object.keys(value).length === 1 && typeof (value as { parameter?: unknown }).parameter === 'string') return values[(value as { parameter: string }).parameter]
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, resolveParameterValues(item, values)]))
}

export function resolveUrl(url: string, baseUrl: string, values: Record<string, string>): string {
  return url
    .replace('{url}', baseUrl)
    .replace('{metric_source}', baseUrl)
    .replace(/\{([a-z][a-z0-9_]*)\}/g, (_, name: string) => (values[name] === undefined ? `{${name}}` : encodeURIComponent(values[name])))
}

function requestValues(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return values && Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value !== null && typeof value === 'object' && 'token' in value ? value : { value: 'test-secret' }]))
}

function jsonSecretReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSecretReferences)
  if (value === null || typeof value !== 'object') return value
  if ('env' in value || 'file' in value || 'label' in value) return { value: 'test-secret' }
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, jsonSecretReferences(item)]))
}

export function resolvedJsonRequestValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resolvedJsonRequestValues)
  if (value === null || typeof value !== 'object') return value
  if ('env' in value || 'file' in value || 'label' in value) return 'test-secret'
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, resolvedJsonRequestValues(item)]))
}

export function loadMetric(definitionUrl: URL, baseUrl: string): MetricOverride {
  const [definition, provider] = loadDefinition(definitionUrl)
  const source = sourceFor(definition, provider)
  const parameters = parameterValues(definition)
  const headers = requestValues(source.headers)
  const query = requestValues(source.query)
  const form = requestValues(source.form)
  const basic =
    source.authentication?.kind === 'basic'
      ? { type: 'basic' as const, ...(source.authentication.optional ? { optional: true } : {}), username: { value: 'test-username' }, password: { value: 'test-password' } }
      : undefined
  const token =
    source.authentication?.kind === 'token'
      ? {
          type: 'token' as const,
          ...(source.authentication.optional ? { optional: true } : {}),
          ...('header' in source.authentication ? { header: source.authentication.header } : { query: source.authentication.query }),
          ...(source.authentication.prefix ? { prefix: source.authentication.prefix } : {}),
          value: { value: 'test-token' }
        }
      : undefined
  const loginSteps = source.authentication?.kind === 'cookie_session' ? source.authentication.requests : []

  return {
    label: definition.display.label,
    valueType: definition.value.kind ?? 'number',
    unit: definition.value.unit ?? 'number',
    chart: provider.charts?.[definition.display.chart ?? ''] ?? definition.display.chart ?? 'step',
    ...(definition.display.chart && provider.charts?.[definition.display.chart] ? { chartGroup: definition.display.chart } : {}),
    ...(definition.value.transform ? { transform: definition.value.transform } : {}),
    source: {
      url: resolveUrl(source.url, baseUrl, parameters),
      ...(source.method ? { method: source.method } : {}),
      ...(headers ? { headers } : {}),
      ...(query ? { query } : {}),
      ...(form ? { form } : {}),
      ...(source.json ? { json: resolveParameterValues(source.json, parameters) } : {}),
      ...(basic ? { auth: basic } : {}),
      ...(token ? { auth: token } : {}),
      ...(loginSteps.length > 0
        ? {
            auth: {
              type: 'cookie_session',
              ...(source.authentication?.optional ? { optional: true } : {}),
              steps: loginSteps.map((step) => ({
                url: resolveUrl(step.url, baseUrl, parameters),
                ...(step.method ? { method: step.method } : {}),
                ...(step.form ? { form: Object.fromEntries(Object.keys(step.form).map((name) => [name, { value: `test-${name}` }])) } : {}),
                ...(step.json ? { json: jsonSecretReferences(step.json) as Record<string, unknown> } : {}),
                ...(step.extract ? { extract: step.extract } : {})
              }))
            }
          }
        : {})
    },
    ...(definition.extract.for_each
      ? {
          forEach: {
            items: { expression: definition.extract.for_each.items },
            requestUrl: resolveUrl(definition.extract.for_each.request.url, baseUrl, parameters),
            value: { expression: definition.extract.for_each.value },
            reduce: definition.extract.for_each.reduce
          }
        }
      : definition.extract.text
        ? { text: true }
        : { jq: { expression: definition.extract.jq! } }),
    ...(definition.extract.pagination ? { pagination: { items: { expression: definition.extract.pagination.items }, next: { expression: definition.extract.pagination.next } } } : {}),
    ...(definition.value.default_color ? { color: definition.value.default_color } : {}),
    ...(definition.value.colors ? { stateColors: definition.value.colors } : {}),
    ...(definition.value.labels ? { stateLabels: definition.value.labels } : {})
  } as MetricOverride
}
