import fs from 'node:fs'
import path from 'node:path'
import Fuse from 'fuse.js'
import type { AppConfig } from './config'
import { FUZZY_MATCH_THRESHOLD, FUZZY_NAME_WEIGHT, FUZZY_REFERENCE_WEIGHT } from './constants'
import { getServiceCandidates } from './service-candidates'

type ServiceDescription = {
  reference: string
  name: string
  description: string
}

let cachedDescriptions: ServiceDescription[] | undefined
let cachedFuse: Fuse<ServiceDescription> | null = null

export function clearDescriptionCache(): void {
  cachedDescriptions = undefined
  cachedFuse = null
}

function loadDescriptions(): ServiceDescription[] {
  if (cachedDescriptions) return cachedDescriptions

  try {
    const content = fs.readFileSync(path.resolve('src/data/descriptions.json'), 'utf-8')
    const parsed: unknown = JSON.parse(content)
    cachedDescriptions = Array.isArray(parsed) ? parsed.filter((item): item is ServiceDescription => {
      return typeof item === 'object'
        && item !== null
        && typeof item.reference === 'string'
        && typeof item.name === 'string'
        && typeof item.description === 'string'
    }) : []
  } catch {
    cachedDescriptions = []
  }

  return cachedDescriptions
}

function matchDescription(candidates: string[], descriptions: ServiceDescription[]): ServiceDescription | undefined {
  const candidateSet = new Set(candidates)
  const exact = descriptions.find(description => candidateSet.has(description.reference))
  if (exact) return exact

  if (!cachedFuse) {
    cachedFuse = new Fuse(descriptions, {
      keys: [
        { name: 'reference', weight: FUZZY_REFERENCE_WEIGHT },
        { name: 'name', weight: FUZZY_NAME_WEIGHT }
      ],
      threshold: FUZZY_MATCH_THRESHOLD,
      includeScore: true
    })
  }

  let best: { description: ServiceDescription; score: number } | undefined
  for (const candidate of candidates) {
    const result = cachedFuse.search(candidate)[0]
    if (!result) continue
    const score = result.score ?? 1
    if (!best || score < best.score) best = { description: result.item, score }
  }

  return best?.description
}

export function resolveDescription(
  config: AppConfig,
  options: { imageName?: string; title: string; containerName: string }
): string | undefined {
  if (!config.enableAutomaticDescriptions) return undefined

  const descriptions = loadDescriptions()
  return matchDescription(getServiceCandidates(options.imageName, options.containerName, options.title), descriptions)?.description
}
