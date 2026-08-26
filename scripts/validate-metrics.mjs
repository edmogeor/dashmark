import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import yaml from 'js-yaml'
import { sourceWithDefaults } from './metric-utils.mjs'

const metricsDirectory = path.resolve('metrics')
const units = new Set([
  'number', 'count', 'percent', 'ratio', 'bytes', 'bytes_per_second',
  'bits', 'bits_per_second', 'seconds', 'milliseconds', 'microseconds',
  'duration', 'hertz', 'watts', 'volts', 'amperes', 'celsius', 'fahrenheit', 'boolean'
])
const reductions = new Set(['count', 'sum', 'average', 'minimum', 'maximum'])
const charts = new Set(['step', 'line', 'area', 'none'])
const badgeColors = new Set(['success', 'info', 'warning', 'error', 'disabled'])
const metricName = /^[a-z][a-z0-9_-]*$/
const prometheusName = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/
const sourceBase = /^\{(?:url|metrics_url)\}(?:\/|$)/

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return files(file)
    return entry.name.endsWith('.yml') && entry.name !== 'provider.yml' ? [file] : []
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
  if (valueType !== 'number' && (typeof extractor.value_label !== 'string' || !extractor.value_label || extractor.reduce !== undefined)) throw new Error('text and state Prometheus metrics require value_label and cannot use reduce')
  if (valueType === 'number' && extractor.value_label !== undefined) throw new Error('numeric Prometheus metrics cannot use value_label')
}

function validateTransform(transform) {
  const value = record(transform, 'transform must be a mapping')
  allowed(value, new Set(['multiply', 'add']), 'transform')
  if (Object.keys(value).length === 0 || !Object.values(value).every(number => typeof number === 'number' && Number.isFinite(number))) {
    throw new Error('transform must define finite multiply and/or add values')
  }
}

function validateStateColor(color) {
  if (typeof color !== 'string' || !badgeColors.has(color)) throw new Error('color must be success, info, warning, error, or disabled')
}

function validateStateColors(colors) {
  const value = record(colors, 'state_colors must be a mapping')
  if (Object.keys(value).length === 0 || !Object.entries(value).every(([name, color]) => Boolean(name) && typeof color === 'string' && badgeColors.has(color))) {
    throw new Error('state_colors must map non-empty values to success, info, warning, error, or disabled')
  }
}

function validateStateLabels(labels) {
  const value = record(labels, 'state_labels must be a mapping')
  if (Object.keys(value).length === 0 || !Object.entries(value).every(([name, label]) => Boolean(name) && typeof label === 'string' && Boolean(label.trim()) && label.length <= 32)) {
    throw new Error('state_labels must map non-empty values to non-empty display labels of at most 32 characters')
  }
}

function validateParameters(parameters) {
  const value = record(parameters, 'parameters must be a mapping')
  if (Object.keys(value).length === 0) throw new Error('parameters must not be empty')
  for (const [name, parameter] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('parameter name is invalid')
    const definition = record(parameter, `parameters.${name} must be a mapping`)
    allowed(definition, new Set(['label', 'type']), `parameters.${name}`)
    if (typeof definition.label !== 'string' || !definition.label || !['url_component', 'json_value'].includes(definition.type)) throw new Error(`parameters.${name} must define a label and type url_component or json_value`)
  }
}

function validateForEach(forEach) {
  const value = record(forEach, 'for_each must be a mapping')
  allowed(value, new Set(['items', 'request', 'value', 'reduce']), 'for_each')
  if (typeof value.items !== 'string' || !value.items.trim()) throw new Error('for_each.items must be a non-empty jq expression')
  if (typeof value.value !== 'string' || !value.value.trim()) throw new Error('for_each.value must be a non-empty jq expression')
  if (typeof value.reduce !== 'string' || !reductions.has(value.reduce)) throw new Error('for_each.reduce is invalid')
  const request = record(value.request, 'for_each.request must be a mapping')
  allowed(request, new Set(['url']), 'for_each.request')
  if (typeof request.url !== 'string' || !sourceBase.test(request.url) || !request.url.includes('{item}')) throw new Error('for_each.request.url must begin with {url} or {metrics_url} and contain {item}')
}

function validateSource(source) {
  const value = record(source, 'source must be a mapping')
  if (value.transport === 'socketio') return validateSocketIoSource(value)
  allowed(value, new Set(['url', 'method', 'form', 'json', 'headers', 'query', 'authentication']), 'source')
  const request = { ...value }
  delete request.authentication
  validateRequest(request, 'source', value.authentication?.kind === 'cookie_session')
  if (value.authentication !== undefined) validateHttpAuth(value.authentication)
}

function validateProvider(definition) {
  const provider = record(definition, 'provider.yml must contain a YAML mapping')
  allowed(provider, new Set(['source', 'charts']), 'provider definition')
  if (provider.source !== undefined) {
    const source = record(provider.source, 'provider source must be a mapping')
    allowed(source, new Set(['headers', 'query', 'authentication']), 'provider source')
    validateSecretMappings(source, 'provider source')
    if (source.authentication !== undefined) validateHttpAuth(source.authentication)
  }
  if (provider.charts !== undefined) {
    const chartDefinitions = record(provider.charts, 'provider charts must be a mapping')
    for (const [group, chart] of Object.entries(chartDefinitions)) {
      if (!metricName.test(group) || typeof chart !== 'string' || !charts.has(chart) || chart === 'none') {
        throw new Error('provider charts must map lowercase group IDs to visible chart styles')
      }
    }
  }
  return provider
}

function validateSocketIoArguments(args, context) {
  if (args === undefined) return
  if (!Array.isArray(args)) throw new Error(`${context}.args must be a list of strings, numbers, booleans, or secret references`)
  for (const argument of args) {
    if (typeof argument === 'string' || typeof argument === 'boolean' || (typeof argument === 'number' && Number.isFinite(argument))) continue
    validateSecretReference('argument', argument, context, 'args')
  }
}

function validateSocketIoEvent(event, context) {
  const value = record(event, `${context} must be a mapping`)
  allowed(value, new Set(['event', 'args']), context)
  if (typeof value.event !== 'string' || !value.event) throw new Error(`${context}.event must be a non-empty string`)
  validateSocketIoArguments(value.args, context)
}

function validateSocketIoSource(source) {
  allowed(source, new Set(['url', 'transport', 'headers', 'authentication', 'socketio']), 'source')
  if (typeof source.url !== 'string' || !sourceBase.test(source.url)) throw new Error('source.url must begin with {url} or {metrics_url}')
  validateSecretMappings(source, 'source', false, ['headers'])
  if (source.authentication !== undefined) validateHttpAuth(source.authentication)
  if (source.authentication?.optional === true) throw new Error('optional authentication is only supported for HTTP metrics')
  const socketio = record(source.socketio, 'source.socketio must be a mapping')
  allowed(socketio, new Set(['path', 'auth', 'login', 'request']), 'source.socketio')
  if (socketio.path !== undefined && (typeof socketio.path !== 'string' || !socketio.path.startsWith('/'))) throw new Error('source.socketio.path must begin with /')
  if (socketio.auth !== undefined) validateSecretMappings({ headers: socketio.auth }, 'source.socketio')
  if (socketio.login !== undefined) validateSocketIoEvent(socketio.login, 'source.socketio.login')
  validateSocketIoEvent(socketio.request, 'source.socketio.request')
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

function validateValueReference(name, reference, context, kind, allowToken) {
  if (typeof reference === 'string' || typeof reference === 'boolean' || (typeof reference === 'number' && Number.isFinite(reference))) return
  if (allowToken && reference !== null && typeof reference === 'object' && !Array.isArray(reference) && typeof reference.token === 'string' && metricName.test(reference.token) && Object.keys(reference).every(key => key === 'token' || key === 'prefix') && (reference.prefix === undefined || typeof reference.prefix === 'string')) return
  validateSecretReference(name, reference, context, kind)
}

function validateJsonValue(value, context) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return
  if (Array.isArray(value)) return value.forEach(item => validateJsonValue(item, context))
  const object = record(value, `${context} must contain JSON values`)
  if (Object.keys(object).some(key => !key)) throw new Error(`${context} must use non-empty property names`)
  if (Object.keys(object).some(key => ['env', 'file', 'label', 'token'].includes(key))) return validateValueReference('value', object, context, 'json', true)
  Object.values(object).forEach(item => validateJsonValue(item, context))
}

function validateSecretMappings(value, context, allowToken = false, kinds = ['headers', 'query']) {
  for (const kind of kinds) {
    if (value[kind] === undefined) continue
    const references = record(value[kind], `${context}.${kind} must be a mapping`)
    for (const [name, reference] of Object.entries(references)) {
      validateValueReference(name, reference, context, kind, allowToken)
    }
  }
}

function validateHttpAuth(authentication) {
  const value = record(authentication, 'source.authentication must be a mapping')
  if (value.kind === 'basic') {
    allowed(value, new Set(['kind', 'optional', 'username', 'password']), 'source.authentication')
    if (value.optional !== undefined && typeof value.optional !== 'boolean') throw new Error('source.authentication.optional must be a boolean')
    validateSecretReference('username', value.username, 'source.authentication', 'basic')
    validateSecretReference('password', value.password, 'source.authentication', 'basic')
    return
  }
  if (value.kind === 'token') {
    allowed(value, new Set(['kind', 'optional', 'header', 'query', 'prefix', 'value']), 'source.authentication')
    if (value.optional !== undefined && typeof value.optional !== 'boolean') throw new Error('source.authentication.optional must be a boolean')
    if (Number(typeof value.header === 'string' && Boolean(value.header)) + Number(typeof value.query === 'string' && Boolean(value.query)) !== 1 || (value.prefix !== undefined && typeof value.prefix !== 'string')) throw new Error('source.authentication token requires one header or query target and an optional string prefix')
    validateSecretReference('value', value.value, 'source.authentication', 'token')
    return
  }
  allowed(value, new Set(['kind', 'optional', 'requests']), 'source.authentication')
  if (value.kind !== 'cookie_session') throw new Error('source.authentication.kind must be basic, token, or cookie_session')
  if (value.optional !== undefined && typeof value.optional !== 'boolean') throw new Error('source.authentication.optional must be a boolean')
  if (!Array.isArray(value.requests) || value.requests.length === 0 || value.requests.length > 5) throw new Error('source.authentication.requests must contain between 1 and 5 requests')
  value.requests.forEach((request, index) => validateRequest(request, `source.authentication.requests.${index}`, true))
}

function validateRequest(request, context, allowToken) {
  const value = record(request, `${context} must be a mapping`)
  allowed(value, new Set(['url', 'method', 'form', 'json', 'headers', 'query', 'extract']), context)
  if (typeof value.url !== 'string' || !sourceBase.test(value.url)) throw new Error(`${context}.url must begin with {url} or {metrics_url}`)
  const method = value.method ?? 'GET'
  if (method !== 'GET' && method !== 'POST') throw new Error(`${context}.method must be GET or POST`)
  if (method === 'GET' && (value.form !== undefined || value.json !== undefined)) throw new Error(`${context} GET requests cannot define form or json`)
  if (Number(value.form !== undefined) + Number(value.json !== undefined) > 1) throw new Error(`${context} must define at most one form or json body`)
  validateSecretMappings(value, context, allowToken, ['headers', 'query', 'form'])
  if (value.json !== undefined) {
    const json = record(value.json, `${context}.json must be a mapping`)
    if (Object.keys(json).length === 0) throw new Error(`${context}.json must not be empty`)
    Object.values(json).forEach(item => validateJsonValue(item, `${context}.json`))
  }
  if (value.extract === undefined) return
  const extract = record(value.extract, `${context}.extract must be a mapping`)
  if (Object.keys(extract).length === 0 || Object.keys(extract).length > 16) throw new Error(`${context}.extract must define between 1 and 16 tokens`)
  for (const [name, extractor] of Object.entries(extract)) {
    if (!metricName.test(name)) throw new Error(`${context}.extract token name is invalid`)
    const value = record(extractor, `${context}.extract.${name} must be a mapping`)
    allowed(value, new Set(['jq', 'cheerio']), `${context}.extract.${name}`)
    const hasJq = typeof value.jq === 'string' && Boolean(value.jq.trim())
    const cheerio = value.cheerio
    const hasCheerio = cheerio !== null && typeof cheerio === 'object' && !Array.isArray(cheerio) && typeof cheerio.selector === 'string' && cheerio.selector.trim().length <= 256 && (cheerio.attribute === undefined || typeof cheerio.attribute === 'string') && Object.keys(cheerio).every(key => key === 'selector' || key === 'attribute')
    if (Number(hasJq) + Number(hasCheerio) !== 1) throw new Error(`${context}.extract.${name} must define jq or a bounded cheerio selector`)
  }
}

function validate(file, provider) {
  validatePath(file)
  const definition = record(yaml.load(fs.readFileSync(file, 'utf8')), 'must contain a YAML mapping')
  allowed(definition, new Set(['display', 'value', 'source', 'extract', 'parameters']), 'metric definition')
  const display = record(definition.display, 'display must be a mapping')
  allowed(display, new Set(['label', 'chart']), 'display')
  if (typeof display.label !== 'string' || !display.label.trim()) throw new Error('display.label must be a non-empty string')
  if (display.chart !== undefined && (typeof display.chart !== 'string' || (!charts.has(display.chart) && provider.charts?.[display.chart] === undefined))) {
    throw new Error('display.chart must be a chart style or provider chart group')
  }
  const value = record(definition.value ?? {}, 'value must be a mapping')
  allowed(value, new Set(['kind', 'unit', 'rate', 'transform', 'default_color', 'colors', 'labels']), 'value')
  const valueType = value.kind ?? 'number'
  if (valueType !== 'number' && valueType !== 'string' && valueType !== 'state') throw new Error('value.kind must be number, string, or state')
  const extract = record(definition.extract, 'extract must be a mapping')
  allowed(extract, new Set(['jq', 'prometheus', 'text', 'for_each']), 'extract')
  const hasJq = extract.jq !== undefined
  const hasPrometheus = extract.prometheus !== undefined
  const hasText = extract.text === true
  const hasForEach = extract.for_each !== undefined
  if (extract.text !== undefined && !hasText) throw new Error('extract.text must be true when specified')
  if (Number(hasJq) + Number(hasPrometheus) + Number(hasText) + Number(hasForEach) !== 1) throw new Error('extract must define exactly one jq, prometheus, text, or for_each extractor')

  if (valueType === 'number') {
    validateUnit(value.unit ?? 'number')
    if (value.rate !== undefined && value.rate !== true) throw new Error('value.rate must be true when specified')
    if (value.transform !== undefined) validateTransform(value.transform)
    if (value.default_color !== undefined || value.colors !== undefined || value.labels !== undefined) throw new Error('value colors require kind state')
  } else if (value.unit !== undefined || value.rate !== undefined || value.transform !== undefined) {
    throw new Error('string and state metrics cannot define a unit, rate, or transform')
  }
  if (valueType === 'string' && (value.default_color !== undefined || value.colors !== undefined || value.labels !== undefined)) throw new Error('value colors require kind state')
  if (valueType === 'state') {
    if (value.default_color === undefined) throw new Error('state metrics require value.default_color')
    validateStateColor(value.default_color)
    if (value.colors !== undefined) validateStateColors(value.colors)
    if (value.labels !== undefined) validateStateLabels(value.labels)
  }

  if (hasJq && (typeof extract.jq !== 'string' || !extract.jq.trim())) throw new Error('extract.jq must be a non-empty expression')
  if (hasPrometheus) {
    const extractor = record(extract.prometheus, 'extract.prometheus must be a mapping')
    validatePrometheus(extractor, valueType)
  }
  if (hasForEach) {
    if (valueType !== 'number' || definition.source?.transport === 'socketio') throw new Error('for_each requires a numeric HTTP metric')
    validateForEach(extract.for_each)
  }
  if (definition.parameters !== undefined) validateParameters(definition.parameters)
  if (definition.source === undefined) throw new Error('source must be defined')
  validateSource(sourceWithDefaults(provider, definition))
}

const errors = []
const providers = new Map()
for (const file of files(metricsDirectory)) {
  try {
    const providerDirectory = path.dirname(file)
    if (!providers.has(providerDirectory)) {
      const providerFile = path.join(providerDirectory, 'provider.yml')
      providers.set(providerDirectory, fs.existsSync(providerFile) ? validateProvider(yaml.load(fs.readFileSync(providerFile, 'utf8'))) : {})
    }
    validate(file, providers.get(providerDirectory))
  } catch (error) {
    errors.push(`${path.relative(process.cwd(), file)}: ${error instanceof Error ? error.message : 'invalid definition'}`)
  }
}
if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
