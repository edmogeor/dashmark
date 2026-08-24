import type { APIRoute } from 'astro'

export const prerender = false

export const ALL: APIRoute = ({ request }) => {
  return Response.redirect(new URL(import.meta.env.BASE_URL, request.url), 302)
}
