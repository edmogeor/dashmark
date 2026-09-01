import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SELFHST_CDN, SELFHST_FETCH_TIMEOUT_MS } from './constants'

type CachedIcon = { content: Buffer; mimeType: string }

const CACHE_ROUTE = '/api/selfhst-icons/'
const CACHE_DIRECTORY = '/tmp/dashmark/icons'
const MIME_TYPES = new Map([
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png']
])

function allowedIcon(url: string): { key: string; extension: string; url: string } | null {
  try {
    const source = new URL(url)
    const base = new URL(SELFHST_CDN)
    if (source.origin !== base.origin || !source.pathname.startsWith(`${base.pathname}/`)) return null
    const extension = path.extname(source.pathname).toLowerCase()
    if (!MIME_TYPES.has(extension)) return null
    return { key: `${createHash('sha256').update(source.href).digest('hex')}${extension}`, extension, url: source.href }
  } catch {
    return null
  }
}

function validKey(value: string): boolean {
  return /^[a-f0-9]{64}\.(svg|png)$/.test(value)
}

export class SelfhstIconCache {
  private readonly sources = new Map<string, { url: string; extension: string }>()
  private readonly pending = new Map<string, Promise<CachedIcon | null>>()

  constructor(private readonly directory = CACHE_DIRECTORY) {
    rmSync(directory, { recursive: true, force: true })
    mkdirSync(directory, { recursive: true })
  }

  source(url: string): string | null {
    const icon = allowedIcon(url)
    if (!icon) return null
    this.sources.set(icon.key, icon)
    return `${CACHE_ROUTE}${icon.key}`
  }

  // fallow-ignore-next-line unused-class-member -- called by scripts/start.mjs through the built runtime.
  async get(key: string): Promise<CachedIcon | null> {
    if (!validKey(key)) return null
    const source = this.sources.get(key)
    if (!source) return null
    try {
      return { content: readFileSync(path.join(this.directory, key)), mimeType: MIME_TYPES.get(source.extension)! }
    } catch {
      return this.download(key, source)
    }
  }

  prune(activeSources: readonly string[]): void {
    const active = new Set(activeSources.flatMap((source) => (source.startsWith(CACHE_ROUTE) ? [source.slice(CACHE_ROUTE.length)] : [])))
    for (const file of readdirSync(this.directory)) {
      if (validKey(file) && !active.has(file)) rmSync(path.join(this.directory, file), { force: true })
    }
    for (const key of this.sources.keys()) if (!active.has(key)) this.sources.delete(key)
  }

  private async download(key: string, source: { url: string; extension: string }): Promise<CachedIcon | null> {
    const existing = this.pending.get(key)
    if (existing) return existing

    const request = this.fetchIcon(key, source).finally(() => this.pending.delete(key))
    this.pending.set(key, request)
    return request
  }

  private async fetchIcon(key: string, source: { url: string; extension: string }): Promise<CachedIcon | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SELFHST_FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(source.url, { signal: controller.signal, redirect: 'error' })
      const mimeType = MIME_TYPES.get(source.extension)
      if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== mimeType) return null
      const content = Buffer.from(await response.arrayBuffer())
      if (content.length === 0) return null

      const filePath = path.join(this.directory, key)
      const temporaryPath = `${filePath}.${process.pid}.tmp`
      writeFileSync(temporaryPath, content)
      renameSync(temporaryPath, filePath)
      return { content, mimeType: mimeType! }
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  }
}

declare global {
  var __dashmarkSelfhstIconCache: SelfhstIconCache | undefined
}

export function getSelfhstIconCache(): SelfhstIconCache {
  return (globalThis.__dashmarkSelfhstIconCache ??= new SelfhstIconCache())
}
