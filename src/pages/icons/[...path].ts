import type { APIRoute } from 'astro'
import fs from 'node:fs'
import path from 'node:path'
import { getConfig } from '@/lib/config'
import { isOutsideDirectory } from '@/lib/paths'
import { ICON_CACHE_MAX_AGE, ICON_MIME_TYPES } from '@/lib/constants'

function notFound(): Response {
  return new Response('Not found', { status: 404 })
}

function forbidden(): Response {
  return new Response('Forbidden', { status: 403 })
}

export function serveIcon(iconsDir: string, relativePath: string | undefined): Response {
  if (!relativePath) return notFound()

  const resolvedIconsDir = path.resolve(iconsDir)
  const filePath = path.resolve(resolvedIconsDir, relativePath)
  if (isOutsideDirectory(resolvedIconsDir, filePath)) return forbidden()

  const ext = path.extname(filePath).toLowerCase()
  const mimeType = ICON_MIME_TYPES[ext]
  if (!mimeType || !fs.existsSync(filePath)) return notFound()

  let resolvedPath: string
  try {
    const canonicalIconsDir = fs.realpathSync(resolvedIconsDir)
    resolvedPath = fs.realpathSync(filePath)
    if (isOutsideDirectory(canonicalIconsDir, resolvedPath)) return forbidden()
  } catch {
    return notFound()
  }

  let content: Buffer
  try {
    if (!fs.statSync(resolvedPath).isFile()) return notFound()
    content = fs.readFileSync(resolvedPath)
  } catch {
    return notFound()
  }

  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': `public, max-age=${ICON_CACHE_MAX_AGE}`,
      'X-Content-Type-Options': 'nosniff'
    }
  })
}

export const GET: APIRoute = ({ params }) => {
  const config = getConfig()
  const relativePath = Array.isArray(params.path) ? params.path.join('/') : params.path
  return serveIcon(config.iconsDir, relativePath)
}
