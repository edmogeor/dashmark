import type { APIRoute } from 'astro'
import fs from 'node:fs'
import path from 'node:path'
import { getConfig } from '@/lib/config'
import { isOutsideDirectory } from '@/lib/paths'
import { ICON_CACHE_MAX_AGE, ICON_MIME_TYPES } from '@/lib/constants'

export const GET: APIRoute = async ({ params }) => {
  const config = getConfig()
  const relativePath = Array.isArray(params.path) ? params.path.join('/') : params.path

  if (!relativePath) {
    return new Response('Not found', { status: 404 })
  }

  const iconsDir = path.resolve(config.iconsDir)
  const filePath = path.resolve(iconsDir, relativePath)
  if (isOutsideDirectory(iconsDir, filePath)) {
    return new Response('Forbidden', { status: 403 })
  }

  const ext = path.extname(filePath).toLowerCase()
  const mimeType = ICON_MIME_TYPES[ext]
  if (!mimeType || !fs.existsSync(filePath)) {
    return new Response('Not found', { status: 404 })
  }

  let resolvedIconsDir: string
  let resolvedPath: string
  try {
    resolvedIconsDir = fs.realpathSync(iconsDir)
    resolvedPath = fs.realpathSync(filePath)
  } catch {
    return new Response('Not found', { status: 404 })
  }

  if (isOutsideDirectory(resolvedIconsDir, resolvedPath)) {
    return new Response('Forbidden', { status: 403 })
  }

  let content: Buffer
  try {
    if (!fs.statSync(resolvedPath).isFile()) return new Response('Not found', { status: 404 })
    content = fs.readFileSync(resolvedPath)
  } catch {
    return new Response('Not found', { status: 404 })
  }

  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': `public, max-age=${ICON_CACHE_MAX_AGE}`,
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
