import type { APIRoute } from 'astro'
import { getSelfhstIconCache, type SelfhstIconCache } from '@/lib/selfhst-icon-cache'

export async function serveSelfhstIcon(cache: SelfhstIconCache, key: string): Promise<Response> {
  const icon = await cache.get(key)
  if (!icon) return new Response(null, { status: 404 })

  const body = icon.content.buffer.slice(icon.content.byteOffset, icon.content.byteOffset + icon.content.byteLength) as ArrayBuffer
  return new Response(body, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': icon.mimeType,
      'X-Content-Type-Options': 'nosniff'
    }
  })
}

export const GET: APIRoute = ({ params }) => serveSelfhstIcon(getSelfhstIconCache(), params.key ?? '')
