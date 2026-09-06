import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from './config'
import { SELFHST_PREFIX } from './constants'
import { isRecord } from './errors'
import { fuzzyMatchReference } from './selfhst'
import { getServiceCandidates, normalizeServiceCandidate } from './service-candidates'

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

export function resolveDescription(config: AppConfig, options: { iconLabel?: string; imageName?: string; title: string; containerName: string }): string | undefined {
  if (!config.enableAutomaticDescriptions) return undefined

  const descriptions = loadDescriptions()
  const iconReference = options.iconLabel?.toLowerCase().startsWith(SELFHST_PREFIX) ? normalizeServiceCandidate(options.iconLabel.slice(SELFHST_PREFIX.length)) : undefined
  const candidates = iconReference
    ? [iconReference, ...getServiceCandidates(options.imageName, options.containerName, options.title)]
    : getServiceCandidates(options.imageName, options.containerName, options.title)
  return fuzzyMatchReference(candidates, descriptions)?.description
}
