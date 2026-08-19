import type { APIRoute } from 'astro'
import { getConfig } from '@/lib/config'
import { getContainerStatuses, addAccessGroupVaryHeader } from '@/lib/docker'

export const GET: APIRoute = async ({ request }) => {
  const config = getConfig()
  const { statuses, error } = await getContainerStatuses(config, request.headers)

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store'
  })
  addAccessGroupVaryHeader(headers, config)

  const body = error ? { error } : { statuses }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers
  })
}
