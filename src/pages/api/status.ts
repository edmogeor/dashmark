import type { APIRoute } from 'astro'
import { getConfig } from '@/lib/config'
import { getContainerStatuses, addAccessVaryHeader } from '@/lib/docker'
import type { StatusResponse } from '@/lib/status'

export async function getStatusResponse(request: Request): Promise<Response> {
  const config = getConfig()
  const { statuses, error } = await getContainerStatuses(config, request.headers)

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store'
  })
  addAccessVaryHeader(headers, config)

  const body: StatusResponse = error ? { error } : { statuses }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers
  })
}

export const GET: APIRoute = ({ request }) => getStatusResponse(request)
