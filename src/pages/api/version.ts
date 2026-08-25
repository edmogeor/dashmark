import type { APIRoute } from 'astro'
import { APP_VERSION, isNewerVersion, LATEST_RELEASE_URL } from '@/lib/version'
import { isRecord } from '@/lib/errors'

type Release = { tagName: string; url: string }
type CachedRelease = { expiresAt: number; release?: Release }

let cached: CachedRelease | undefined

function parseRelease(value: unknown): Release | undefined {
  if (!isRecord(value) || typeof value.tag_name !== 'string' || typeof value.html_url !== 'string') return undefined
  return { tagName: value.tag_name, url: value.html_url }
}

async function latestRelease(): Promise<Release | undefined> {
  if (cached && cached.expiresAt > Date.now()) return cached.release

  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5_000)
    })
    const release = response.ok ? parseRelease(await response.json()) : undefined
    cached = { expiresAt: Date.now() + 60 * 60_000, release }
    return release
  } catch {
    cached = { expiresAt: Date.now() + 5 * 60_000 }
    return undefined
  }
}

async function getVersionResponse(): Promise<Response> {
  const release = await latestRelease()
  const body = release && isNewerVersion(release.tagName)
    ? { version: APP_VERSION, update: release }
    : { version: APP_VERSION }
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }
  })
}

export const GET: APIRoute = () => getVersionResponse()
