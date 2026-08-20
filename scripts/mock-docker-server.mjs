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
      'dashmark.description': 'Media server',
      'dashmark.url': 'http://localhost:8081',
      'dashmark.category': 'Media',
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
      'dashmark.description': 'Open source media server',
      'dashmark.url': 'http://localhost:8082',
      'dashmark.category': 'Media',
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
      'dashmark.description': 'Monitoring dashboards',
      'dashmark.url': 'http://localhost:8083',
      'dashmark.category': 'Monitoring',
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
      'dashmark.title': 'Uptime Kuma',
      'dashmark.description': 'Uptime monitor',
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
      'dashmark.description': 'Docker management UI',
      'dashmark.url': 'http://localhost:8085',
      'dashmark.category': 'Management'
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
      'dashmark.url': 'http://localhost:8086',
      'dashmark.category': 'Management'
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
      'dashmark.description': 'Usenet downloader',
      'dashmark.url': 'http://localhost:8087',
    }
  }
]

export function startMockDocker(containers = demoContainers) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')

      const send = (statusCode, body) => {
        if (statusCode !== 200) res.writeHead(statusCode)
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
