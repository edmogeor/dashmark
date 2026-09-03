import { existsSync, readFileSync } from 'node:fs'
import * as yaml from 'js-yaml'

export type MetricDefinition = {
  display: { label: string; chart?: string }
  value: {
    kind?: 'number' | 'string' | 'state'
    unit?: string
    transform?: { multiply?: number; add?: number }
    default_color?: 'success' | 'info' | 'warning' | 'error' | 'disabled'
    colors?: Record<string, 'success' | 'info' | 'warning' | 'error' | 'disabled'>
    labels?: Record<string, string>
  }
  extract: {
    jq?: string
    text?: true
    for_each?: { items: string; request: { url: string }; value: string; reduce: 'count' | 'sum' | 'average' | 'minimum' | 'maximum' }
    pagination?: { items: string; next: string }
  }
  parameters?: Record<string, { type: 'url_component' | 'json_value' }>
  source: {
    url: string
    method?: 'GET' | 'POST'
    headers?: Record<string, unknown>
    query?: Record<string, unknown>
    form?: Record<string, unknown>
    json?: Record<string, unknown>
    authentication?:
      | { kind: 'basic'; optional?: boolean; username: unknown; password: unknown }
      | ({ kind: 'token'; optional?: boolean; prefix?: string; value: unknown } & ({ header: string; query?: never } | { header?: never; query: string }))
      | {
          kind: 'cookie_session'
          optional?: boolean
          requests: { url: string; method?: 'GET' | 'POST'; form?: Record<string, unknown>; json?: Record<string, unknown>; extract?: Record<string, unknown> }[]
        }
  }
}

export type ProviderDefinition = {
  source?: Pick<MetricDefinition['source'], 'headers' | 'authentication'> & { query?: Record<string, unknown> }
  charts?: Record<string, 'step' | 'line' | 'area'>
}

export function loadDefinition(definitionUrl: URL): [MetricDefinition, ProviderDefinition] {
  const definition = yaml.load(readFileSync(definitionUrl, 'utf8')) as MetricDefinition
  const providerUrl = new URL('./provider.yml', definitionUrl)
  const provider = existsSync(providerUrl) ? (yaml.load(readFileSync(providerUrl, 'utf8')) as ProviderDefinition) : {}
  return [definition, provider]
}

export function sourceFor(definition: MetricDefinition, provider: ProviderDefinition): MetricDefinition['source'] {
  const defaults = provider.source ?? {}
  return {
    ...defaults,
    ...definition.source,
    ...(defaults.headers || definition.source.headers ? { headers: { ...defaults.headers, ...definition.source.headers } } : {}),
    ...(defaults.query || definition.source.query ? { query: { ...defaults.query, ...definition.source.query } } : {})
  }
}

export function parameterValues(definition: MetricDefinition): Record<string, string> {
  return Object.fromEntries(Object.keys(definition.parameters ?? {}).map((name) => [name, `test-${name}`]))
}
