import type { APIRoute } from 'astro'
import { getMetricsResponse } from './metrics'

// Retained for clients using the pre-metrics endpoint name.
export const GET: APIRoute = ({ request }) => getMetricsResponse(request)
