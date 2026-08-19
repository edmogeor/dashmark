import http from 'node:http'

export const demoContainers = [
  {
    Id: 'placeholder123',
    Names: ['/qzjxwkvbpnmlrty-service'],
    Image: 'example.invalid/qzjxwkvbpnmlrty-service:latest',
    ImageID: 'sha256:placeholder',
    State: 'running',
    Status: 'Up 5 minutes',
    Labels: {
      'dashmark.title': 'Qzjxwkvbpnmlrty Service',
      'dashmark.description': 'Icon placeholder example',
      'dashmark.url': 'http://localhost:8080'
    }
  },
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
      'dashmark.icon': 'plex',
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
      'dashmark.icon': 'jellyfin',
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
      'dashmark.icon': 'grafana',
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
      'dashmark.icon': 'uptime-kuma',
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
      'dashmark.icon': 'portainer'
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
      'dashmark.icon': 'watchtower'
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
