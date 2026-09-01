export function listenMockServer(server, protocol, name) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const url = `${protocol}://127.0.0.1:${port}`
      console.log(`Mock ${name} API listening on ${url}`)
      resolve({ server, url })
    })
  })
}
