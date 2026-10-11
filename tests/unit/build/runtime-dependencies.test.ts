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

    expect(Object.keys(packageLock.packages['']?.dependencies ?? {}).sort()).toEqual(['@fastify/static', '@fastify/websocket', 'fastify', 'js-yaml', 'ws'])
    expect(packageLock.packages['']?.devDependencies?.['@astrojs/node']).toBeDefined()
    expect(packageLock.packages['node_modules/server-destroy']?.dev).toBe(true)
  })
})
