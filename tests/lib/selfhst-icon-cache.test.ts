import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SelfhstIconCache } from '@/lib/selfhst-icon-cache'

const PLEX_ICON = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/plex.svg'

describe('SelfhstIconCache', () => {
  const directories: string[] = []

  afterEach(async () => {
    vi.unstubAllGlobals()
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  async function createCache(): Promise<SelfhstIconCache> {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dashmark-icons-'))
    directories.push(directory)
    return new SelfhstIconCache(directory)
  }

  it('clears its internal directory on startup', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dashmark-icons-'))
    directories.push(directory)
    await writeFile(path.join(directory, 'stale.svg'), '<svg/>')

    new SelfhstIconCache(directory)

    expect(await readdir(directory)).toEqual([])
  })

  it('fetches an icon on its first local request and reuses it afterward', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
    vi.stubGlobal('fetch', fetch)
    const cache = await createCache()

    const source = cache.source(PLEX_ICON)

    expect(source).toMatch(/^\/api\/selfhst-icons\/[a-f0-9]{64}\.svg$/)
    expect(fetch).not.toHaveBeenCalled()
    expect((await cache.get(source!.split('/').at(-1)!))?.content.toString()).toBe('<svg/>')
    await cache.get(source!.split('/').at(-1)!)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('removes cached icons with no discovered service reference', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })))
    const cache = await createCache()
    const source = cache.source(PLEX_ICON)
    await cache.get(source!.split('/').at(-1)!)

    cache.prune([])

    expect(await cache.get(source!.split('/').at(-1)!)).toBeNull()
  })
})
