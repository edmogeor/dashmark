import fs from 'node:fs'
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import node from '@astrojs/node'
import tailwindcss from '@tailwindcss/vite'
import yaml from 'js-yaml'

function yamlPort() {
  try {
    const configFile = process.env.CONFIG_FILE || '/data/config.yml'
    return yaml.load(fs.readFileSync(configFile, 'utf-8'))?.settings?.port
  } catch {
    return undefined
  }
}

const parsedPort = Number(yamlPort() ?? process.env.PORT)
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
  ? parsedPort
  : 4321
const demoEnabled = process.env.DASHMARK_DEMO === 'true'
const demoVersion = process.env.DASHMARK_DEMO_VERSION?.replace(/^v/, '') ?? ''

export default defineConfig({
  output: 'server',
  base: process.env.ASTRO_BASE,
  site: process.env.ASTRO_SITE,
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    define: {
      __DASHMARK_DEMO__: JSON.stringify(demoEnabled),
      __DASHMARK_DEMO_VERSION__: JSON.stringify(demoVersion)
    },
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src'
      }
    }
  },
  server: {
    port
  }
})
