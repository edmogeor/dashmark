import http from 'node:http'

export const demoContainers = [
  {
    Id: 'plex123',
    Names: ['/plex'],
    Image: 'plexinc/pms-docker',
    ImageID: 'sha256:plex',
    State: 'running',
    Status: 'Up 2 hours (healthy)',
    Labels: {
      'dashmark.title': 'Plex',
      'dashmark.url': 'http://localhost:8081',
      'dashmark.category': 'Media',
      'dashmark.metrics': 'cpu,memory,network,gatus/uptime',
      'dashmark.access': 'media,family',
      'dashmark.order': '1'
    }
  },
  {
    Id: 'jellyfin123',
    Names: ['/jellyfin'],
    Image: 'jellyfin/jellyfin',
    ImageID: 'sha256:jellyfin',
    State: 'running',
    Status: 'Up 1 hour (healthy)',
    Labels: {
      'dashmark.title': 'Jellyfin',
      'dashmark.url': 'http://localhost:8082',
      'dashmark.category': 'Media',
      'dashmark.access': 'media',
      'dashmark.order': '2'
    }
  },
  {
    Id: 'grafana123',
    Names: ['/grafana'],
    Image: 'grafana/grafana',
    ImageID: 'sha256:grafana',
    State: 'running',
    Status: 'Up 3 hours (healthy)',
    Labels: {
      'dashmark.title': 'Grafana',
      'dashmark.url': 'http://localhost:8083',
      'dashmark.category': 'Monitoring',
      'dashmark.access': 'admins',
      'dashmark.order': '1'
    }
  },
  {
    Id: 'uptime123',
    Names: ['/uptime'],
    Image: 'louislam/uptime-kuma',
    ImageID: 'sha256:uptime',
    State: 'running',
    Status: 'Up 30 minutes (healthy)',
    Labels: {
      'dashmark.title': 'Uptime Kuma Monitoring and Incident Response Dashboard',
      'dashmark.url': 'http://localhost:8084',
      'dashmark.category': 'Monitoring',
      'dashmark.order': '2'
    }
  },
  {
    Id: 'portainer123',
    Names: ['/portainer'],
    Image: 'portainer/portainer-ce',
    ImageID: 'sha256:portainer',
    State: 'running',
    Status: 'Up 15 minutes (healthy)',
    Labels: {
      'dashmark.title': 'Portainer',
      'dashmark.url': 'http://localhost:8085',
      'dashmark.category': 'Management',
      'dashmark.access': 'admins'
    }
  },
  {
    Id: 'watchtower123',
    Names: ['/watchtower'],
    Image: 'containrrr/watchtower',
    ImageID: 'sha256:watchtower',
    State: 'running',
    Status: 'Up 10 minutes',
    Labels: {
      'dashmark.title': 'Watchtower',
      'dashmark.description': 'Keeps Docker images up to date.',
      'dashmark.url': 'http://localhost:8086',
      'dashmark.category': 'Management',
      'dashmark.show_status': 'false'
    }
  },
  {
    Id: 'nzbget123',
    Names: ['/nzbget'],
    Image: 'linuxserver/nzbget',
    ImageID: 'sha256:nzbget',
    State: 'running',
    Status: 'Up 4 minutes',
    Labels: {
      'dashmark.title': 'NZBGet',
      'dashmark.url': 'http://localhost:8087',
      'dashmark.category': 'Media'
    }
  }
]

export function startMockDocker(containers = demoContainers) {
  return new Promise(resolve => {
    const startedAt = Date.now()
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')

      const send = (statusCode, body) => {
        res.statusCode = statusCode
        res.end(body)
      }

      if (req.url === '/version') {
        send(200, JSON.stringify({ ApiVersion: '1.41' }))
        return
      }

      if (req.url?.startsWith('/v') && new URL(req.url, 'http://localhost').pathname.endsWith('/containers/json')) {
        send(200, JSON.stringify(containers))
        return
      }

      const statsMatch = req.url?.match(/^\/v[^/]+\/containers\/([^/]+)\/stats\?stream=false$/)
      if (statsMatch) {
        const container = containers.find(item => item.Id === decodeURIComponent(statsMatch[1]))
        if (!container) {
          send(404, JSON.stringify({ message: 'Not found' }))
          return
        }

        const elapsedMs = Date.now() - startedAt
        const offset = container.Id.length * 1_000_000
        const phase = offset / 1_000_000
        const counterBase = 1_000_000_000_000
        const cpuUsage = timestamp => counterBase + timestamp * 300_000 + Math.sin(timestamp / 7_000 + phase) * 300_000_000
        const systemUsage = timestamp => counterBase + timestamp * 2_000_000
        const receivedBytes = timestamp => counterBase + timestamp * 1_200 + Math.sin(timestamp / 9_000 + phase) * 2_000_000
        const sentBytes = timestamp => counterBase + timestamp * 300 + Math.sin(timestamp / 12_000 + phase) * 350_000
        const memoryUsage = 512 * 1024 * 1024 + Math.round(Math.sin(elapsedMs / 8_000 + phase) * 96 * 1024 * 1024)
        send(200, JSON.stringify({
          cpu_stats: {
            cpu_usage: { total_usage: cpuUsage(elapsedMs), percpu_usage: [1, 1] },
            system_cpu_usage: systemUsage(elapsedMs),
            online_cpus: 2
          },
          precpu_stats: {
            cpu_usage: { total_usage: cpuUsage(Math.max(0, elapsedMs - 1_000)) },
            system_cpu_usage: systemUsage(Math.max(0, elapsedMs - 1_000))
          },
          memory_stats: { usage: memoryUsage, limit: 2 * 1024 * 1024 * 1024 },
          networks: {
            eth0: { rx_bytes: receivedBytes(elapsedMs), tx_bytes: sentBytes(elapsedMs) }
          }
        }))
        return
      }

      send(404, JSON.stringify({ message: 'Not found' }))
    })

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const url = `tcp://127.0.0.1:${port}`
      console.log(`Mock Docker API listening on ${url}`)
      resolve({ server, url })
    })
  })
}
