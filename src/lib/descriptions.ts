import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from './config'
import { isRecord } from './errors'
import { fuzzyMatchReference } from './selfhst'
import { getServiceCandidates } from './service-candidates'

type ServiceDescription = {
  reference: string
  name: string
  description: string
}

let cachedDescriptions: ServiceDescription[] | undefined

function isServiceDescription(value: unknown): value is ServiceDescription {
  return isRecord(value) && typeof value.reference === 'string' && typeof value.name === 'string' && typeof value.description === 'string'
}

export function clearDescriptionCache(): void {
  cachedDescriptions = undefined
}

function loadDescriptions(): ServiceDescription[] {
  if (cachedDescriptions) return cachedDescriptions

  try {
    const content = fs.readFileSync(path.resolve('src/data/descriptions.json'), 'utf-8')
    const descriptions: unknown = JSON.parse(content)
    cachedDescriptions = Array.isArray(descriptions) ? descriptions.filter(isServiceDescription) : []
  } catch {
    cachedDescriptions = []
  }

  return cachedDescriptions
}

export function resolveDescription(config: AppConfig, options: { imageName?: string; title: string; containerName: string }): string | undefined {
  if (!config.enableAutomaticDescriptions) return undefined

  const descriptions = loadDescriptions()
  return fuzzyMatchReference(getServiceCandidates(options.imageName, options.containerName, options.title), descriptions)?.description
}
