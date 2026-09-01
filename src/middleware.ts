import { defineMiddleware } from 'astro:middleware'
import { isAuthorized } from '@/lib/auth'
import { initializeRuntime } from '@/lib/runtime'

const MOCK_AUTH = process.env.MOCK_AUTH === 'true'
const MOCK_USER_NAME = process.env.MOCK_USER_NAME
const MOCK_USER_USERNAME = process.env.MOCK_USER_USERNAME
const MOCK_USER_EMAIL = process.env.MOCK_USER_EMAIL
const MOCK_USER_GROUPS = process.env.MOCK_USER_GROUPS
const DEMO_ENABLED = process.env.DASHMARK_DEMO === 'true'

const { config, realtime } = initializeRuntime()

declare global {
  var __dashmarkDevServer: import('node:http').Server | undefined
  var __dashmarkDevRealtimeAttached: boolean | undefined
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (globalThis.__dashmarkDevServer && !globalThis.__dashmarkDevRealtimeAttached) {
    realtime.attachDevServer(globalThis.__dashmarkDevServer)
    globalThis.__dashmarkDevRealtimeAttached = true
  }
  if (!DEMO_ENABLED && context.url.pathname.replace(/\/$/, '').endsWith('/demo')) {
    return new Response('Not found', { status: 404 })
  }

  if (!MOCK_AUTH && !isAuthorized(context.request, config.authToken)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let request = context.request
  if (MOCK_AUTH) {
    const headers = new Headers(context.request.headers)
    if (MOCK_USER_NAME) headers.set('X-Authentik-Name', MOCK_USER_NAME)
    if (MOCK_USER_USERNAME) headers.set('X-Authentik-Username', MOCK_USER_USERNAME)
    if (MOCK_USER_EMAIL) headers.set('X-Authentik-Email', MOCK_USER_EMAIL)
    if (MOCK_USER_GROUPS) headers.set('X-Authentik-Groups', MOCK_USER_GROUPS)

    request = new Request(context.request, { headers })
  }

  const response = await next(request)
  if (response.headers.get('Content-Type')?.includes('text/html')) {
    response.headers.set('Cache-Control', 'private, no-store')
  }
  return response
})
