import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type PackageLock = {
  packages: Record<string, { dependencies?: Record<string, string>; dev?: boolean }>
}

function readPackageLock(): PackageLock {
  return JSON.parse(fs.readFileSync(path.resolve('package-lock.json'), 'utf8'))
}

describe('runtime dependencies', () => {
  it('includes the Node adapter and its standalone server dependency', () => {
    const packageLock = readPackageLock()

    expect(packageLock.packages['']?.dependencies?.['@astrojs/node']).toBeDefined()
    expect(packageLock.packages['node_modules/server-destroy']?.dev).not.toBe(true)
  })
})
