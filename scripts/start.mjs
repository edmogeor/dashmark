import fs from 'node:fs'
import yaml from 'js-yaml'

function yamlPort() {
  try {
    const configFile = process.env.CONFIG_FILE || '/data/config.yml'
    const config = yaml.load(fs.readFileSync(configFile, 'utf-8'))
    const port = config?.settings?.port
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? String(port) : undefined
  } catch {
    return undefined
  }
}

process.env.PORT = yamlPort() ?? process.env.PORT ?? '4321'
await import('../dist/server/entry.mjs')
