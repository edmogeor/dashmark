import type { APIRoute } from 'astro'
import { getConfig } from '@/lib/config'
import { sharedCacheControl } from '@/lib/cache'
import { getContainerStatuses, addAccessVaryHeader } from '@/lib/docker'

export async function getStatusResponse(request: Request): Promise<Response> {
  const config = getConfig()
  const { statuses, error } = await getContainerStatuses(config, request.headers)

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': sharedCacheControl(config.statusPollIntervalMs)
  })
  addAccessVaryHeader(headers, config)

  return new Response(JSON.stringify(error ? { error } : { statuses }), {
    status: 200,
    headers
  })
}

export const GET: APIRoute = ({ request }) => getStatusResponse(request)
