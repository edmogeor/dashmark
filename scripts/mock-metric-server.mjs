import http from 'node:http'
import { listenMockServer } from './mock-server.mjs'

const MINUTE_MS = 60_000

function uptimeResults(requestNumber) {
  const now = Date.now()
  return Array.from({ length: 30 }, (_, index) => {
    const timestamp = now - (29 - index) * MINUTE_MS
    const down = (index + requestNumber) % 11 === 0
    return {
      timestamp: new Date(timestamp).toISOString(),
      success: !down,
      duration: (80 + ((index * 17 + requestNumber * 13) % 120)) * 1_000_000
    }
  })
}

export function startMockMetricServer() {
  return new Promise((resolve) => {
    let uptimeRequests = 0
    let metricRequests = 0
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      res.setHeader('Content-Type', 'application/json')

      if (/^\/api\/v1\/endpoints\/[^/]+\/statuses$/.test(url.pathname)) {
        uptimeRequests++
        // Every fifth collection fails so the dashboard can demonstrate stale uptime data.
        if (uptimeRequests % 5 === 0) {
          res.statusCode = 503
          res.end(JSON.stringify({ message: 'Mock uptime source temporarily unavailable' }))
          return
        }
        res.end(JSON.stringify({ results: uptimeResults(uptimeRequests) }))
        return
      }

      if (url.pathname === '/jsonrpc' && req.method === 'POST') {
        metricRequests++
        res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { DownloadRate: 1_500_000 + (metricRequests % 8) * 125_000 } }))
        return
      }

      res.statusCode = 404
      res.end(JSON.stringify({ message: 'Not found' }))
    })

    listenMockServer(server, 'http', 'metric').then(resolve)
  })
}
