import type { APIRoute } from 'astro'
import fs from 'node:fs'
import { getConfig } from '@/lib/config'

export function serveCustomStylesheet(stylesheetPath: string | undefined): Response {
  if (!stylesheetPath) return new Response('Not found', { status: 404 })

  let content: string
  try {
    if (!fs.statSync(stylesheetPath).isFile()) return new Response('Not found', { status: 404 })
    content = fs.readFileSync(stylesheetPath, 'utf-8')
  } catch {
    return new Response('Not found', { status: 404 })
  }

  return new Response(content, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}

export const GET: APIRoute = () => serveCustomStylesheet(getConfig().customStylesheet)
