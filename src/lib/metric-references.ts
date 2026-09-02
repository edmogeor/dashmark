import { isRecord } from './errors'

export type SecretReference = { env?: string; file?: string; label?: string; value?: string }

export function isSecretReference(value: unknown): value is SecretReference {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => ['env', 'file', 'label', 'value'].includes(key)) &&
    (typeof value.env === 'string' || typeof value.file === 'string' || typeof value.label === 'string' || typeof value.value === 'string')
  )
}
