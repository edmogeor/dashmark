import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serveCustomStylesheet } from '@/pages/custom.css'

let rootDirectory: string

beforeEach(() => {
  rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmark-stylesheet-'))
})

afterEach(() => {
  fs.rmSync(rootDirectory, { recursive: true, force: true })
})

describe('GET /custom.css', () => {
  it('serves the configured stylesheet without caching', async () => {
    const stylesheetPath = path.join(rootDirectory, 'custom.css')
    fs.writeFileSync(stylesheetPath, '.dashmark { color: red; }')

    const response = serveCustomStylesheet(stylesheetPath)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/css; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await expect(response.text()).resolves.toBe('.dashmark { color: red; }')
  })

  it('returns not found when the stylesheet is unset or missing', () => {
    expect(serveCustomStylesheet(undefined).status).toBe(404)
    expect(serveCustomStylesheet(path.join(rootDirectory, 'missing.css')).status).toBe(404)
  })
})
