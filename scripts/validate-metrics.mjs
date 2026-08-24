import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import yaml from 'js-yaml'

const metricsDirectory = path.resolve('metrics')
const units = new Set([
  'number', 'count', 'percent', 'ratio', 'bytes', 'bytes_per_second',
  'bits', 'bits_per_second', 'seconds', 'milliseconds', 'microseconds',
  'duration', 'hertz', 'watts', 'volts', 'amperes', 'celsius', 'fahrenheit', 'boolean'
])
const reductions = new Set(['count', 'sum', 'average', 'minimum', 'maximum'])
const charts = new Set(['step', 'line', 'area', 'none'])
const metricName = /^[a-z][a-z0-9_-]*$/
const prometheusName = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/
const jsonPointer = /^(?:\/(?:[^~]|~[01])*)+$/

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

function validateJson(extractor, valueType) {
  allowed(extractor, new Set(['path', 'value_path', 'reduce']), 'json')
  if (typeof extractor.path !== 'string' || !jsonPointer.test(extractor.path)) throw new Error('json.path must be a non-empty JSON Pointer')
  if (extractor.value_path !== undefined && (typeof extractor.value_path !== 'string' || !jsonPointer.test(extractor.value_path))) throw new Error('json.value_path must be a JSON Pointer')
  if (extractor.reduce !== undefined && (typeof extractor.reduce !== 'string' || !reductions.has(extractor.reduce))) throw new Error('json.reduce is invalid')
  if (valueType === 'string' && (extractor.value_path !== undefined || extractor.reduce !== undefined)) throw new Error('string JSON metrics cannot use value_path or reduce')
}

function validatePrometheus(extractor, valueType) {
  allowed(extractor, new Set(['name', 'labels', 'reduce', 'value_label']), 'prometheus')
  if (typeof extractor.name !== 'string' || !prometheusName.test(extractor.name)) throw new Error('prometheus.name is invalid')
  if (extractor.labels !== undefined && (extractor.labels === null || typeof extractor.labels !== 'object' || Array.isArray(extractor.labels) || !Object.values(extractor.labels).every(value => typeof value === 'string'))) throw new Error('prometheus.labels must map strings to strings')
  if (extractor.reduce !== undefined && (typeof extractor.reduce !== 'string' || !reductions.has(extractor.reduce))) throw new Error('prometheus.reduce is invalid')
  if (valueType === 'string' && (typeof extractor.value_label !== 'string' || !extractor.value_label || extractor.reduce !== undefined)) throw new Error('string Prometheus metrics require value_label and cannot use reduce')
  if (valueType === 'number' && extractor.value_label !== undefined) throw new Error('numeric Prometheus metrics cannot use value_label')
}

function validate(file) {
  validatePath(file)

  const definition = record(yaml.load(fs.readFileSync(file, 'utf8')), 'must contain a YAML mapping')
  allowed(definition, new Set(['label', 'unit', 'chart', 'value_type', 'json', 'prometheus']), 'metric definition')
  if (typeof definition.label !== 'string' || !definition.label.trim()) throw new Error('label must be a non-empty string')
  const valueType = definition.value_type ?? 'number'
  if (valueType !== 'number' && valueType !== 'string') throw new Error('value_type must be number or string')
  const hasJson = definition.json !== undefined
  const hasPrometheus = definition.prometheus !== undefined
  if (hasJson === hasPrometheus) throw new Error('must define exactly one json or prometheus extractor')

  if (valueType === 'number') {
    validateUnit(definition.unit ?? 'number')
    if (definition.chart !== undefined && (typeof definition.chart !== 'string' || !charts.has(definition.chart))) {
      throw new Error('chart must be step, line, area, or none')
    }
  } else if (definition.unit !== undefined || definition.chart !== undefined) {
    throw new Error('string metrics cannot define a unit or chart')
  }

  if (hasJson) {
    const extractor = record(definition.json, 'json must be a mapping')
    validateJson(extractor, valueType)
    return
  }

  const extractor = record(definition.prometheus, 'prometheus must be a mapping')
  validatePrometheus(extractor, valueType)
}

const errors = []
for (const file of files(metricsDirectory)) {
  try {
    validate(file)
  } catch (error) {
    errors.push(`${path.relative(process.cwd(), file)}: ${error instanceof Error ? error.message : 'invalid definition'}`)
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
