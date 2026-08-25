import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import yaml from 'js-yaml'
import { z } from 'zod'

const metricsDirectory = path.resolve('metrics')
const catalogPath = path.join(metricsDirectory, 'CATALOG.md')
const units = new Set([
  'number', 'count', 'percent', 'ratio', 'bytes', 'bytes_per_second',
  'bits', 'bits_per_second', 'seconds', 'milliseconds', 'microseconds',
  'duration', 'hertz', 'watts', 'volts', 'amperes', 'celsius', 'fahrenheit', 'boolean'
])
const reductions = new Set(['count', 'sum', 'average', 'minimum', 'maximum'])
const charts = new Set(['step', 'line', 'area', 'none'])
const metricName = /^[a-z][a-z0-9_-]*$/
const prometheusName = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/
const metricShape = z.object({
  label: z.string().trim().min(1),
  value_type: z.enum(['number', 'string']).optional()
}).passthrough()

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return files(file)
    return entry.name.endsWith('.yml') ? [file] : []
  })
}

function record(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value
}

function allowed(value, keys, context) {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new Error(`${context} does not allow '${key}'`)
  }
}

function validatePath(file) {
  const relative = path.relative(metricsDirectory, file).split(path.sep)
  if (relative.length !== 2 || !metricName.test(relative[0]) || !metricName.test(path.basename(relative[1], '.yml'))) {
    throw new Error('must use metrics/<provider>/<metric-name>.yml')
  }
}

function validateUnit(unit) {
  const validUnit = typeof unit === 'string'
    ? units.has(unit)
    : unit !== null && typeof unit === 'object' && !Array.isArray(unit)
      && Object.keys(unit).length === 1 && typeof unit.suffix === 'string' && Boolean(unit.suffix)
  if (!validUnit) throw new Error('unit must be a supported unit or { suffix: string }')
}

function validatePrometheus(extractor, valueType) {
  allowed(extractor, new Set(['name', 'labels', 'reduce', 'value_label']), 'prometheus')
  if (typeof extractor.name !== 'string' || !prometheusName.test(extractor.name)) throw new Error('prometheus.name is invalid')
  if (extractor.labels !== undefined && (extractor.labels === null || typeof extractor.labels !== 'object' || Array.isArray(extractor.labels) || !Object.values(extractor.labels).every(value => typeof value === 'string'))) throw new Error('prometheus.labels must map strings to strings')
  if (extractor.reduce !== undefined && (typeof extractor.reduce !== 'string' || !reductions.has(extractor.reduce))) throw new Error('prometheus.reduce is invalid')
  if (valueType === 'string' && (typeof extractor.value_label !== 'string' || !extractor.value_label || extractor.reduce !== undefined)) throw new Error('string Prometheus metrics require value_label and cannot use reduce')
  if (valueType === 'number' && extractor.value_label !== undefined) throw new Error('numeric Prometheus metrics cannot use value_label')
}

function validateTransform(transform) {
  const value = record(transform, 'transform must be a mapping')
  allowed(value, new Set(['multiply', 'add']), 'transform')
  if (Object.keys(value).length === 0 || !Object.values(value).every(number => typeof number === 'number' && Number.isFinite(number))) {
    throw new Error('transform must define finite multiply and/or add values')
  }
}

function validateSource(source) {
  const value = record(source, 'source must be a mapping')
  allowed(value, new Set(['url', 'headers', 'query', 'auth']), 'source')
  if (typeof value.url !== 'string' || !/^\{url\}(?:\/|$)/.test(value.url)) throw new Error('source.url must begin with {url}')
  validateSecretMappings(value, 'source')
  if (value.auth !== undefined) validateCookieSessionAuth(value.auth)
}

function validateSecretReference(name, reference, context, kind) {
  const secret = record(reference, `${context}.${kind}.${name} must be a mapping`)
  allowed(secret, new Set(['env', 'file', 'label']), `${context}.${kind}.${name}`)
  const env = typeof secret.env === 'string' && Boolean(secret.env)
  const file = typeof secret.file === 'string' && Boolean(secret.file)
  const label = typeof secret.label === 'string' && Boolean(secret.label)
  if (!name || (env && file) || (!env && !file && !label)) {
    throw new Error(`${context}.${kind} must use valid names and env, file, or label references`)
  }
}

function validateSecretMappings(value, context) {
  for (const kind of ['headers', 'query']) {
    if (value[kind] === undefined) continue
    const references = record(value[kind], `${context}.${kind} must be a mapping`)
    for (const [name, reference] of Object.entries(references)) {
      validateSecretReference(name, reference, context, kind)
    }
  }
}

function validateCookieSessionAuth(auth) {
  const value = record(auth, 'source.auth must be a mapping')
  allowed(value, new Set(['type', 'login']), 'source.auth')
  if (value.type !== 'cookie_session') throw new Error('source.auth.type must be cookie_session')
  const login = record(value.login, 'source.auth.login must be a mapping')
  allowed(login, new Set(['url', 'method', 'form', 'json', 'headers', 'query']), 'source.auth.login')
  if (typeof login.url !== 'string' || !/^\{url\}(?:\/|$)/.test(login.url)) throw new Error('source.auth.login.url must begin with {url}')
  if (login.method !== 'POST') throw new Error('source.auth.login.method must be POST')
  if (Number(login.form !== undefined) + Number(login.json !== undefined) !== 1) throw new Error('source.auth.login must define exactly one form or json body mapping')
  for (const kind of ['form', 'json']) {
    if (login[kind] === undefined) continue
    const body = record(login[kind], `source.auth.login.${kind} must be a mapping`)
    if (Object.keys(body).length === 0) throw new Error(`source.auth.login.${kind} must not be empty`)
    for (const [name, reference] of Object.entries(body)) {
      validateSecretReference(name, reference, 'source.auth.login', kind)
    }
  }
  validateSecretMappings(login, 'source.auth.login')
}

function validate(file) {
  validatePath(file)
  const key = path.relative(metricsDirectory, file).replace(/\.yml$/, '').split(path.sep).join('/')

  const definition = record(yaml.load(fs.readFileSync(file, 'utf8')), 'must contain a YAML mapping')
  const shape = metricShape.safeParse(definition)
  if (!shape.success) throw new Error('label must be a non-empty string and value_type must be number or string')
  allowed(definition, new Set(['label', 'source', 'unit', 'chart', 'chart_group', 'transform', 'value_type', 'jq', 'prometheus']), 'metric definition')
  if (typeof definition.label !== 'string' || !definition.label.trim()) throw new Error('label must be a non-empty string')
  const valueType = definition.value_type ?? 'number'
  if (valueType !== 'number' && valueType !== 'string') throw new Error('value_type must be number or string')
  const hasJq = definition.jq !== undefined
  const hasPrometheus = definition.prometheus !== undefined
  if (Number(hasJq) + Number(hasPrometheus) !== 1) throw new Error('must define exactly one jq or prometheus extractor')

  if (valueType === 'number') {
    validateUnit(definition.unit ?? 'number')
    if (definition.chart !== undefined && (typeof definition.chart !== 'string' || !charts.has(definition.chart))) {
      throw new Error('chart must be step, line, area, or none')
    }
    if (definition.chart_group !== undefined && (typeof definition.chart_group !== 'string' || !metricName.test(definition.chart_group))) {
      throw new Error('chart_group must be a lowercase identifier')
    }
    if (definition.chart_group !== undefined && definition.chart === 'none') throw new Error('chart_group requires a visible chart')
    if (definition.transform !== undefined) validateTransform(definition.transform)
  } else if (definition.unit !== undefined || definition.chart !== undefined || definition.chart_group !== undefined || definition.transform !== undefined) {
    throw new Error('string metrics cannot define a unit or chart group')
  }

  if (hasJq && (typeof definition.jq !== 'string' || !definition.jq.trim())) throw new Error('jq must be a non-empty expression')
  if (hasPrometheus) {
    const extractor = record(definition.prometheus, 'prometheus must be a mapping')
    validatePrometheus(extractor, valueType)
  }
  if (definition.source !== undefined) validateSource(definition.source)

  return { key, graphGroup: definition.chart_group ?? '-' }
}

function validateCatalog(metrics) {
  if (!fs.existsSync(catalogPath)) throw new Error('metrics/CATALOG.md is required')
  const lines = fs.readFileSync(catalogPath, 'utf8').split(/\r?\n/)
  const header = '| Provider | Metric key | Graph group | Author |'
  const index = lines.indexOf(header)
  if (index === -1 || lines[index + 1] !== '| --- | --- | --- | --- |') {
    throw new Error('metrics/CATALOG.md must contain the catalog table headers')
  }

  const catalog = new Map()
  for (const line of lines.slice(index + 2)) {
    if (!line.startsWith('|')) break
    const [provider, metricKey, graphGroup, author] = line.split('|').slice(1, -1).map(value => value.trim())
    const key = /^`([a-z][a-z0-9_-]*\/[a-z][a-z0-9_-]*)`$/.exec(metricKey ?? '')?.[1]
    const group = /^`([a-z][a-z0-9_-]*)`$/.exec(graphGroup ?? '')?.[1] ?? (graphGroup === '-' ? '-' : undefined)
    if (!provider || !author || !key || !group || catalog.has(key)) throw new Error(`invalid catalog row: ${line}`)
    catalog.set(key, group)
  }

  for (const metric of metrics) {
    if (catalog.get(metric.key) !== metric.graphGroup) throw new Error(`metrics/CATALOG.md must list ${metric.key} with graph group ${metric.graphGroup}`)
    catalog.delete(metric.key)
  }
  for (const key of catalog.keys()) throw new Error(`metrics/CATALOG.md lists missing metric ${key}`)
}

const errors = []
const metrics = []
for (const file of files(metricsDirectory)) {
  try {
    metrics.push(validate(file))
  } catch (error) {
    errors.push(`${path.relative(process.cwd(), file)}: ${error instanceof Error ? error.message : 'invalid definition'}`)
  }
}
try {
  validateCatalog(metrics)
} catch (error) {
  errors.push(error instanceof Error ? error.message : 'metrics/CATALOG.md is invalid')
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
