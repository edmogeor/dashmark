import fs from 'node:fs'
import path from 'node:path'
import Fuse from 'fuse.js'
import { logger } from './logger'
import { logMessages } from './log-messages'
import { errorMessage, isRecord } from './errors'
import {
  SELFHST_CDN,
  SELFHST_GITHUB_API_URL,
  SELFHST_PAGE_SIZE,
  SELFHST_MAX_PAGES,
  SELFHST_FETCH_TIMEOUT_MS,
  FUZZY_MATCH_THRESHOLD,
  FUZZY_MIN_LENGTH_RATIO,
  FUZZY_REFERENCE_WEIGHT,
  FUZZY_NAME_WEIGHT
} from './constants'

export type SelfhstIcon = {
  reference: string
  name: string
  url: string
}

type ReferenceMatch = {
  reference: string
  name: string
}

const cache = new Map<string, SelfhstIcon[]>()

function isSelfhstIcon(value: unknown): value is SelfhstIcon {
  return isRecord(value)
    && typeof value.reference === 'string'
    && typeof value.name === 'string'
    && typeof value.url === 'string'
}

function isGitHubIconFile(value: unknown): value is { name: string } {
  return isRecord(value)
    && typeof value.name === 'string'
}

function loadLocalIcons(): SelfhstIcon[] | null {
  try {
    const filePath = path.resolve('src/data/icons.json')
    if (!fs.existsSync(filePath)) return null
    const content = fs.readFileSync(filePath, 'utf-8')
    const icons: unknown = JSON.parse(content)
    if (!Array.isArray(icons) || !icons.every(isSelfhstIcon)) {
      throw new Error('Local icon index had an invalid format')
    }
    const normalized = icons.flatMap(icon => {
      try {
        const segments = new URL(icon.url).pathname.split('/').filter(Boolean)
        const iconPath = segments.slice(-2).join('/')
        return iconPath ? [{ ...icon, url: `${SELFHST_CDN}/${iconPath}` }] : []
      } catch {
        return []
      }
    })
    return normalized.length > 0 ? normalized : null
  } catch (error) {
    const message = errorMessage(error)
    logger.warn('selfhst', logMessages.selfhst.localIndexFailed, { error: message })
    return null
  }
}

async function fetchIconPage(page: number): Promise<{ name: string }[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SELFHST_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${SELFHST_GITHUB_API_URL}?per_page=${SELFHST_PAGE_SIZE}&page=${page}`,
      { signal: controller.signal }
    )
    if (!response.ok) throw new Error(`GitHub API responded with ${response.status}`)

    const data: unknown = await response.json()
    if (!Array.isArray(data) || !data.every(isGitHubIconFile)) {
      throw new Error('GitHub API icon response had an invalid format')
    }
    return data
  } finally {
    clearTimeout(timeout)
  }
}

function addSvgIcons(files: { name: string }[], icons: SelfhstIcon[]): void {
  for (const { name } of files) {
    if (!name.endsWith('.svg')) continue

    const reference = name.replace(/\.svg$/, '')
    if (/-(dark|light)$/.test(reference)) continue

    icons.push({
      reference,
      name: reference.replace(/[-_]/g, ' '),
      url: `${SELFHST_CDN}/svg/${name}`
    })
  }
}

async function fetchRemoteIcons(): Promise<SelfhstIcon[]> {
  const icons: SelfhstIcon[] = []

  for (let page = 1; page <= SELFHST_MAX_PAGES; page++) {
    const files = await fetchIconPage(page)
    addSvgIcons(files, icons)
    if (files.length < SELFHST_PAGE_SIZE) return icons
  }

  throw new Error(`GitHub API icon listing exceeded ${SELFHST_MAX_PAGES} pages`)
}

export async function fetchSelfhstIcons(): Promise<SelfhstIcon[]> {
  const cached = cache.get(SELFHST_CDN)
  if (cached) return cached

  const local = loadLocalIcons()
  if (local) {
    cache.set(SELFHST_CDN, local)
    return local
  }

  try {
    const icons = await fetchRemoteIcons()
    cache.set(SELFHST_CDN, icons)
    return icons
  } catch (error) {
    const message = errorMessage(error)
    logger.error('selfhst', logMessages.selfhst.fetchFailed, {
      cdnBase: SELFHST_CDN,
      error: message
    })
    return []
  }
}

const fuseCache = new WeakMap<object, unknown>()

function getFuse<T extends ReferenceMatch>(items: T[]): Fuse<T> {
  const cached = fuseCache.get(items) as Fuse<T> | undefined
  if (cached) return cached

  const fuse = new Fuse(items, {
    keys: [
      { name: 'reference', weight: FUZZY_REFERENCE_WEIGHT },
      { name: 'name', weight: FUZZY_NAME_WEIGHT }
    ],
    threshold: FUZZY_MATCH_THRESHOLD,
    includeScore: true
  })
  fuseCache.set(items, fuse)
  return fuse
}

function findExactMatch<T extends ReferenceMatch>(candidates: string[], items: T[]): T | null {
  const candidateSet = new Set(candidates)
  return items.find(item => candidateSet.has(item.reference)) ?? null
}

function hasSimilarLength(candidate: string, reference: string): boolean {
  return Math.min(candidate.length, reference.length) / Math.max(candidate.length, reference.length) >= FUZZY_MIN_LENGTH_RATIO
}

export function fuzzyMatchReference<T extends ReferenceMatch>(candidates: string[], items: T[]): T | null {
  if (items.length === 0 || candidates.length === 0) return null

  const exact = findExactMatch(candidates, items)
  if (exact) return exact

  const fuse = getFuse(items)

  let bestMatch: { item: T; score: number } | null = null

  for (const candidate of candidates) {
    const top = fuse.search(candidate)[0]
    if (!top || !hasSimilarLength(candidate, top.item.reference)) continue
    const score = top.score ?? 1
    if (!bestMatch || score < bestMatch.score) {
      bestMatch = { item: top.item, score }
    }
  }

  return bestMatch?.item ?? null
}

export function fuzzyMatchIcon(candidates: string[], icons: SelfhstIcon[]): SelfhstIcon | null {
  return fuzzyMatchReference(candidates, icons)
}
