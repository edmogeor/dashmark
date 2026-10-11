import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serveIcon } from '@/pages/icons/[...path]'

let rootDirectory: string
let iconsDirectory: string
let previousIconsDir: string | undefined

beforeEach(() => {
  rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmark-icons-'))
  iconsDirectory = path.join(rootDirectory, 'icons')
  fs.mkdirSync(iconsDirectory)
  previousIconsDir = process.env.ICONS_DIR
  process.env.ICONS_DIR = iconsDirectory
})

afterEach(() => {
  if (previousIconsDir === undefined) delete process.env.ICONS_DIR
  else process.env.ICONS_DIR = previousIconsDir
  fs.rmSync(rootDirectory, { recursive: true, force: true })
})

function requestIcon(iconPath: string) {
  return serveIcon(iconsDirectory, iconPath)
}

describe('GET /icons/[...path]', () => {
  it('serves supported icon files with a safe content type', () => {
    fs.writeFileSync(path.join(iconsDirectory, 'icon.svg'), '<svg />')

    const response = requestIcon('icon.svg')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('blocks traversal and symlinks that point outside the icon directory', () => {
    fs.writeFileSync(path.join(rootDirectory, 'secret.svg'), '<svg />')
    fs.symlinkSync(path.join(rootDirectory, 'secret.svg'), path.join(iconsDirectory, 'linked.svg'))

    expect(requestIcon('../secret.svg').status).toBe(403)
    expect(requestIcon('linked.svg').status).toBe(403)
  })

  it('does not serve unsupported file types', () => {
    fs.writeFileSync(path.join(iconsDirectory, 'secret.txt'), 'secret')

    expect(requestIcon('secret.txt').status).toBe(404)
  })
})
