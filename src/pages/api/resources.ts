import type { APIRoute } from 'astro'
import { getConfig } from '@/lib/config'
import { addResourceUsageVaryHeader, getContainerResourceUsage } from '@/lib/docker'
import type { ResourceUsageResponse } from '@/lib/status'

export async function getResourceUsageResponse(request: Request): Promise<Response> {
  const config = getConfig()
  const cardId = new URL(request.url).searchParams.get('id')
  const resource = cardId ? await getContainerResourceUsage(config, request.headers, cardId) : undefined
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store'
  })
  addResourceUsageVaryHeader(headers, config)

  const body: ResourceUsageResponse = { resource: resource ?? null }
  return new Response(JSON.stringify(body), { status: 200, headers })
}

export const GET: APIRoute = ({ request }) => getResourceUsageResponse(request)
