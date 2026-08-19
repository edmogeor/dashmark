import type { APIRoute } from 'astro'
import { getConfig } from '@/lib/config'
import { getCards, addAccessGroupVaryHeader } from '@/lib/docker'

export const GET: APIRoute = async ({ request }) => {
  const config = getConfig()
  const { cards, error } = await getCards(config, request.headers)

  const ui = {
    showSearch: !config.disableSearch,
    showStatus: !config.disableStatus
  }
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, max-age=60'
  })
  addAccessGroupVaryHeader(headers, config)

  const body = error ? { cards: [], error, ...ui } : { cards, ...ui }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers
  })
}
