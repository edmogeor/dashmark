import http from 'node:http'

export type MockContainer = {
  Id: string
  Names?: string[]
  Image: string
  ImageID: string
  State: string
  Status: string
  Labels?: Record<string, string>
}

export class MockDockerServer {
  private server: http.Server
  private port: number = 0
  private running: boolean = false
  public containers: MockContainer[] = []
  public apiVersion: string = '1.41'

  constructor() {
    this.server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')

      if (req.url === '/version') {
        res.writeHead(200)
        res.end(JSON.stringify({ ApiVersion: this.apiVersion }))
        return
      }

      if (req.url === '/v1.41/containers/json?all=1') {
        res.writeHead(200)
        res.end(JSON.stringify(this.containers))
        return
      }

      res.writeHead(404)
      res.end(JSON.stringify({ message: 'Not found' }))
    })
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server.address()
        if (address && typeof address === 'object') {
          this.port = address.port
          this.running = true
          resolve(`tcp://127.0.0.1:${this.port}`)
        } else {
          reject(new Error('Failed to get server address'))
        }
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.running) return
    this.running = false
    return new Promise((resolve, reject) => {
      this.server.close(err => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
