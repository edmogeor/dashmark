import { readFileSync } from 'node:fs'
import type { MetricOverride } from './config-file-types'
import { isRecord } from './errors'
import { logger } from './logger'
import { isSecretReference, type SecretReference } from './metric-references'

type TokenReference = { token: string; prefix?: string }
type ValueReference = SecretReference | TokenReference
export type RequestValue = ValueReference | string | number | boolean
export type JsonValue = RequestValue | null | JsonValue[] | { [key: string]: JsonValue }
type ValueReferences = Record<string, RequestValue>

function isTokenReference(value: unknown): value is TokenReference {
  return (
    isRecord(value) && Object.keys(value).every((key) => key === 'token' || key === 'prefix') && typeof value.token === 'string' && (value.prefix === undefined || typeof value.prefix === 'string')
  )
}

function credentialName(reference: { env?: string; file?: string; label?: string }): string {
  return reference.env ?? reference.file ?? reference.label ?? 'unknown credential'
}

export function resolveReferences(metric: MetricOverride, references: ValueReferences, kind: string, tokens: Record<string, string> = {}): { values?: Record<string, string>; error?: string } {
  const values: Record<string, string> = {}
  for (const [name, reference] of Object.entries(references)) {
    try {
      const isToken = isTokenReference(reference)
      const isReference = isToken || isSecretReference(reference)
      const value = isToken
        ? tokens[reference.token] && `${reference.prefix ?? ''}${tokens[reference.token]}`
        : isSecretReference(reference)
          ? (reference.value ?? (reference.env === undefined ? (reference.file === undefined ? undefined : readFileSync(reference.file, 'utf8').trim()) : process.env[reference.env]))
          : String(reference)
      if (!value)
        throw new Error(
          isToken ? 'authentication token is unavailable' : isReference && isSecretReference(reference) && reference.env === undefined ? 'secret file is empty' : 'environment variable is unset'
        )
      values[name] = value
    } catch (error) {
      logger.error('metrics', 'failed to resolve custom metric secret', { metric: metric.label, [kind]: name, error: error instanceof Error ? error.message : 'unknown error' })
      return {
        error: isTokenReference(reference)
          ? `Authentication token ${reference.token} is unavailable`
          : `Credential ${isSecretReference(reference) ? credentialName(reference) : 'unknown credential'} is unavailable`
      }
    }
  }
  return { values }
}

export function resolveHeaders(metric: MetricOverride, references = metric.source.headers ?? {}, tokens?: Record<string, string>): { headers?: Headers; error?: string } {
  const headers = new Headers()
  const { values, error } = resolveReferences(metric, references, 'header', tokens)
  if (error || !values) return { error }
  for (const [name, value] of Object.entries(values)) headers.set(name, value)
  return { headers }
}

export function applyBasicAuth(metric: MetricOverride, headers: Headers): string | undefined {
  const auth = metric.source.auth
  if (!auth || auth.type !== 'basic') return undefined
  const { values, error } = resolveReferences(metric, { username: auth.username, password: auth.password }, 'basic authentication')
  if (error || !values) return error ?? 'Could not resolve basic authentication credentials'
  headers.set('Authorization', `Basic ${Buffer.from(`${values.username!}:${values.password!}`).toString('base64')}`)
  return undefined
}

export function applyTokenAuth(metric: MetricOverride, headers: Headers, url: URL): string | undefined {
  const auth = metric.source.auth
  if (!auth || auth.type !== 'token') return undefined
  const { values, error } = resolveReferences(metric, { value: auth.value }, 'token authentication')
  if (error || !values) return error ?? 'Could not resolve token authentication credentials'
  const value = `${auth.prefix ?? ''}${values.value!}`
  if (typeof auth.header === 'string') headers.set(auth.header, value)
  else url.searchParams.set(auth.query, value)
  return undefined
}

export function resolveQuery(metric: MetricOverride, url: URL, references = metric.source.query ?? {}, tokens?: Record<string, string>): string | undefined {
  const { values, error } = resolveReferences(metric, references, 'query', tokens)
  if (error || !values) return error
  for (const [name, value] of Object.entries(values)) url.searchParams.set(name, value)
  return undefined
}

function resolveJson(metric: MetricOverride, value: JsonValue, tokens: Record<string, string>): { value?: JsonValue; error?: string } {
  if (value === null || typeof value !== 'object') return { value }
  if (Array.isArray(value)) {
    const values: JsonValue[] = []
    for (const item of value) {
      const resolved = resolveJson(metric, item, tokens)
      if (resolved.error || resolved.value === undefined) return { error: resolved.error ?? 'Could not resolve a JSON value' }
      values.push(resolved.value)
    }
    return { value: values }
  }
  if (Object.keys(value).length === 1 && '__dashmarkParameterValue' in value) {
    const parameter = value.__dashmarkParameterValue
    if (typeof parameter === 'string' || typeof parameter === 'number' || typeof parameter === 'boolean') return { value: parameter }
  }
  if (isTokenReference(value) || isSecretReference(value)) {
    const resolved = resolveReferences(metric, { value }, 'body', tokens)
    return resolved.error || !resolved.values ? { error: resolved.error ?? 'Could not resolve a JSON value' } : { value: resolved.values.value! }
  }
  const entries: Record<string, JsonValue> = {}
  for (const [name, item] of Object.entries(value)) {
    const resolved = resolveJson(metric, item, tokens)
    if (resolved.error || resolved.value === undefined) return { error: resolved.error ?? 'Could not resolve a JSON value' }
    entries[name] = resolved.value
  }
  return { value: entries }
}

export function resolveBody(
  metric: MetricOverride,
  form: Record<string, RequestValue> | undefined,
  json: Record<string, JsonValue> | undefined,
  tokens: Record<string, string>
): { value?: { form?: Record<string, string>; json?: Record<string, JsonValue> }; error?: string } {
  if (form) {
    const resolved = resolveReferences(metric, form, 'body', tokens)
    return resolved.error || !resolved.values ? { error: resolved.error ?? 'Could not resolve a metric value' } : { value: { form: resolved.values } }
  }
  if (!json) return { value: {} }
  const resolved = resolveJson(metric, json, tokens)
  return resolved.error || !resolved.value || Array.isArray(resolved.value) || typeof resolved.value !== 'object'
    ? { error: resolved.error ?? 'Could not resolve a metric value' }
    : { value: { json: resolved.value } }
}

export function resolveSocketIoArguments(metric: MetricOverride, args: (string | number | boolean | SecretReference)[] | undefined): { values?: (string | number | boolean)[]; error?: string } {
  if (!args) return { values: [] }
  const values: (string | number | boolean)[] = []
  for (const argument of args) {
    if (typeof argument !== 'object') {
      values.push(argument)
      continue
    }
    const resolved = resolveReferences(metric, { argument }, 'Socket.IO argument')
    if (resolved.error || !resolved.values) return { error: resolved.error ?? 'Could not resolve a Socket.IO argument' }
    values.push(resolved.values.argument!)
  }
  return { values }
}
