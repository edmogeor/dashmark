import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type PackageLock = {
  packages: Record<string, { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; dev?: boolean }>
}

function readPackageLock(): PackageLock {
  return JSON.parse(fs.readFileSync(path.resolve('package-lock.json'), 'utf8'))
}

describe('runtime dependencies', () => {
  it('keeps the runtime server dependencies outside the bundled app', () => {
    const packageLock = readPackageLock()

    expect(packageLock.packages['']?.dependencies).toEqual({
      '@fastify/static': '^10.1.3',
      '@fastify/websocket': '^11.3.0',
      fastify: '^5.12.1',
      'js-yaml': '^4.1.0',
      ws: '^8.21.3'
    })
    expect(packageLock.packages['']?.devDependencies?.['@astrojs/node']).toBeDefined()
    expect(packageLock.packages['node_modules/server-destroy']?.dev).toBe(true)
  })
})
