import fs from 'node:fs'
import path from 'node:path'
import Fuse from 'fuse.js'
import { logger } from './logger'
import { logMessages } from './log-messages'

export type SelfhstIcon = {
  reference: string
  name: string
  url: string
}

const cache = new Map<string, SelfhstIcon[]>()

function loadLocalIcons(cdnBase: string): SelfhstIcon[] | null {
  try {
    const filePath = path.resolve('src/data/icons.json')
    if (!fs.existsSync(filePath)) return null
    const content = fs.readFileSync(filePath, 'utf-8')
    const icons = JSON.parse(content) as SelfhstIcon[]
    const normalized = icons.flatMap(icon => {
      try {
        const segments = new URL(icon.url).pathname.split('/').filter(Boolean)
        const iconPath = segments.slice(-2).join('/')
        return iconPath ? [{ ...icon, url: `${cdnBase}/${iconPath}` }] : []
      } catch {
        return []
      }
    })
    return normalized.length > 0 ? normalized : null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('selfhst', logMessages.selfhst.localIndexFailed, { error: message })
    return null
  }
}

async function fetchRemoteIcons(cdnBase: string): Promise<SelfhstIcon[]> {
  const icons: SelfhstIcon[] = []
  let page = 1

  while (true) {
    const response = await fetch(
      `https://api.github.com/repos/selfhst/icons/contents/svg?per_page=100&page=${page}`
    )
    if (!response.ok) {
      throw new Error(`GitHub API responded with ${response.status}`)
    }

    const data = (await response.json()) as Array<{ name: string }>
    if (!Array.isArray(data) || data.length === 0) break

    for (const item of data) {
      if (item.name.endsWith('.svg')) {
        const reference = item.name.replace(/\.svg$/, '')
        if (/-(dark|light)$/.test(reference)) continue
        icons.push({
          reference,
          name: reference.replace(/[-_]/g, ' '),
          url: `${cdnBase}/svg/${item.name}`
        })
      }
    }

    if (data.length < 100) break
    page++
  }

  return icons
}

export async function fetchSelfhstIcons(cdnBase: string): Promise<SelfhstIcon[]> {
  const cached = cache.get(cdnBase)
  if (cached) return cached

  const local = loadLocalIcons(cdnBase)
  if (local) {
    cache.set(cdnBase, local)
    return local
  }

  try {
    const icons = await fetchRemoteIcons(cdnBase)
    cache.set(cdnBase, icons)
    return icons
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('selfhst', logMessages.selfhst.fetchFailed, {
      cdnBase,
      error: message
    })
    return []
  }
}

const MATCH_THRESHOLD = 0.3

const fuseCache = new WeakMap<SelfhstIcon[], Fuse<SelfhstIcon>>()

function getFuse(icons: SelfhstIcon[]): Fuse<SelfhstIcon> {
  const cached = fuseCache.get(icons)
  if (cached) return cached

  const fuse = new Fuse(icons, {
    keys: [
      { name: 'reference', weight: 0.7 },
      { name: 'name', weight: 0.3 }
    ],
    threshold: MATCH_THRESHOLD,
    includeScore: true
  })
  fuseCache.set(icons, fuse)
  return fuse
}

function findExactMatch(candidates: string[], icons: SelfhstIcon[]): SelfhstIcon | null {
  const candidateSet = new Set(candidates)
  return icons.find(icon => candidateSet.has(icon.reference)) ?? null
}

export function fuzzyMatchIcon(candidates: string[], icons: SelfhstIcon[]): SelfhstIcon | null {
  if (icons.length === 0 || candidates.length === 0) return null

  const exact = findExactMatch(candidates, icons)
  if (exact) return exact

  const fuse = getFuse(icons)

  let bestMatch: { icon: SelfhstIcon; score: number } | null = null

  for (const candidate of candidates) {
    const top = fuse.search(candidate)[0]
    if (!top) continue
    const score = top.score ?? 1
    if (!bestMatch || score < bestMatch.score) {
      bestMatch = { icon: top.item, score }
    }
  }

  return bestMatch?.icon ?? null
}
