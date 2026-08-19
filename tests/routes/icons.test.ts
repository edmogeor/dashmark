import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '@/pages/icons/[...path]'

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
  return GET({ params: { path: iconPath } } as never)
}

describe('GET /icons/[...path]', () => {
  it('serves supported icon files with a safe content type', async () => {
    fs.writeFileSync(path.join(iconsDirectory, 'icon.svg'), '<svg />')

    const response = await requestIcon('icon.svg')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('blocks traversal and symlinks that point outside the icon directory', async () => {
    fs.writeFileSync(path.join(rootDirectory, 'secret.svg'), '<svg />')
    fs.symlinkSync(path.join(rootDirectory, 'secret.svg'), path.join(iconsDirectory, 'linked.svg'))

    expect((await requestIcon('../secret.svg')).status).toBe(403)
    expect((await requestIcon('linked.svg')).status).toBe(403)
  })

  it('does not serve unsupported file types', async () => {
    fs.writeFileSync(path.join(iconsDirectory, 'secret.txt'), 'secret')

    expect((await requestIcon('secret.txt')).status).toBe(404)
  })
})
