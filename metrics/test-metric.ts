import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeMetricSource } from '@/lib/config-file-metrics'
import { normalizeMetricDefinition, parseMetricCatalog } from '@/lib/config-file-validation'
import type { MetricLiteral, MetricOverride } from '@/lib/config-file-types'
import { isRecord } from '@/lib/errors'
import { isSecretReference } from '@/lib/metric-references'
import { resolveMetricSources } from '@/lib/metric-source-resolution'
import { loadDefinition } from './fixture-loader'

export type TestMetricOptions = {
  inputs?: Record<string, MetricLiteral>
  secrets?: Record<string, string>
}

function bindFixtureSecrets(value: unknown, labels: Record<string, string>, secrets: Record<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) bindFixtureSecrets(item, labels, secrets)
    return
  }
  if (!isRecord(value)) return
  if (isSecretReference(value) && (value.env !== undefined || value.file !== undefined || value.label !== undefined)) {
    const name = [value.env, value.file, value.label].find((name) => name !== undefined && secrets[name] !== undefined)
    const secret = name === undefined ? 'test-secret' : secrets[name]
    delete value.env
    delete value.file
    value.label = `fixture-secret-${Object.keys(labels).length}`
    labels[value.label] = secret
    return
  }
  for (const item of Object.values(value)) bindFixtureSecrets(item, labels, secrets)
}

export function loadMetric(definitionUrl: URL, baseUrl: string, { inputs = {}, secrets = {} }: TestMetricOptions = {}): MetricOverride {
  const [definition, provider] = loadDefinition(definitionUrl)
  const filePath = fileURLToPath(definitionUrl)
  const key = `${basename(dirname(filePath))}/${basename(filePath, '.yml')}`
  const normalized = normalizeMetricDefinition({ ...definition, source: mergeMetricSource(provider.source, definition.source) }, provider.charts, false, undefined, provider.transforms)
  if (!normalized.definition) throw new Error(`${key}: ${normalized.error ?? 'invalid metric definition'}`)
  const parsed = parseMetricCatalog({ [key]: normalized.definition })[key]
  if (!parsed) throw new Error(`${key}: metric rejected by production validation`)
  const metric = structuredClone(parsed)
  for (const name of Object.keys(inputs)) {
    if (!metric.parameters?.[name]) throw new Error(`${key}: unknown fixture input ${name}`)
  }
  const labels: Record<string, string> = {}
  bindFixtureSecrets(metric.source, labels, secrets)
  const parameters = { ...Object.fromEntries(Object.keys(metric.parameters ?? {}).map((name) => [name, `test-${name}`])), ...inputs }
  const resolved = resolveMetricSources({ [key]: metric }, baseUrl, { [key.split('/')[0]]: baseUrl }, labels, { [key]: parameters })?.[key]
  if (!resolved) throw new Error(`${key}: fixture metric source could not be resolved`)
  return resolved
}
