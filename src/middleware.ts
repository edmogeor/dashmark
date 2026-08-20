import { defineMiddleware } from 'astro:middleware'

const MOCK_AUTH = process.env.MOCK_AUTH === 'true'
const MOCK_USER_NAME = process.env.MOCK_USER_NAME
const MOCK_USER_USERNAME = process.env.MOCK_USER_USERNAME
const MOCK_USER_EMAIL = process.env.MOCK_USER_EMAIL
const MOCK_USER_GROUPS = process.env.MOCK_USER_GROUPS

export const onRequest = defineMiddleware((context, next) => {
  if (!MOCK_AUTH) return next()

  const headers = new Headers(context.request.headers)
  if (MOCK_USER_NAME) headers.set('X-Authentik-Name', MOCK_USER_NAME)
  if (MOCK_USER_USERNAME) headers.set('X-Authentik-Username', MOCK_USER_USERNAME)
  if (MOCK_USER_EMAIL) headers.set('X-Authentik-Email', MOCK_USER_EMAIL)
  if (MOCK_USER_GROUPS) headers.set('X-Authentik-Groups', MOCK_USER_GROUPS)

  return next(new Request(context.request, { headers }))
})
