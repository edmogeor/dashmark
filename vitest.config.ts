import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/metrics.ts'],
    include: ['tests/**/*.test.ts', 'metrics/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  }
})
