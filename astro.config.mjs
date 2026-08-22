import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import node from '@astrojs/node'
import tailwindcss from '@tailwindcss/vite'

const parsedPort = Number(process.env.PORT)
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
  ? parsedPort
  : 4321

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
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
