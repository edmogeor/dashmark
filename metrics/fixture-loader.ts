import { existsSync, readFileSync } from 'node:fs'
import * as yaml from 'js-yaml'
import { isRecord } from '@/lib/errors'

export function loadDefinition(definitionUrl: URL): [Record<string, unknown>, Record<string, unknown>] {
  const definition: unknown = yaml.load(readFileSync(definitionUrl, 'utf8'))
  const providerUrl = new URL('./provider.yml', definitionUrl)
  const provider: unknown = existsSync(providerUrl) ? yaml.load(readFileSync(providerUrl, 'utf8')) : {}
  if (!isRecord(definition) || !isRecord(provider)) throw new Error(`Invalid metric fixture definition: ${definitionUrl.pathname}`)
  return [definition, provider]
}
