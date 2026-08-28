import { describe, it, expect, beforeEach, vi } from 'vitest'
import sharp from 'sharp'
import { analyzeIconLuminance } from '@/lib/icon-luminance'

async function makePng(colour: [number, number, number]): Promise<Buffer> {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: colour[0], g: colour[1], b: colour[2] }
    }
  })
    .png()
    .toBuffer()
}

async function makeMixedSvg(darkColour: string, lightColour: string, centreSize: number): Promise<Buffer> {
  const centreOffset = (64 - centreSize) / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${darkColour}"/><rect x="${centreOffset}" y="${centreOffset}" width="${centreSize}" height="${centreSize}" fill="${lightColour}"/></svg>`
  return Buffer.from(svg)
}

async function makeSvg(fill: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${fill}"/></svg>`
  return Buffer.from(svg)
}

function mockFetchWith(buffer: Buffer, contentType: string) {
  global.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array(buffer), { status: 200, headers: { 'Content-Type': contentType } }))
}

describe('analyzeIconLuminance', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('classifies a very dark image as dark', async () => {
    mockFetchWith(await makePng([20, 20, 20]), 'image/png')
    expect(await analyzeIconLuminance('https://example.com/dark.png')).toBe('dark')
  })

  it('classifies a very light image as light', async () => {
    mockFetchWith(await makePng([240, 240, 240]), 'image/png')
    expect(await analyzeIconLuminance('https://example.com/light.png')).toBe('light')
  })

  it('returns null for a mid-tone image', async () => {
    mockFetchWith(await makePng([128, 128, 128]), 'image/png')
    expect(await analyzeIconLuminance('https://example.com/mid.png')).toBeNull()
  })

  it('classifies a dark SVG as dark', async () => {
    mockFetchWith(await makeSvg('#111111'), 'image/svg+xml')
    expect(await analyzeIconLuminance('https://example.com/dark.svg')).toBe('dark')
  })

  it('classifies a mostly-dark icon with a tiny bright centre as dark', async () => {
    mockFetchWith(await makeMixedSvg('#111111', '#ffffff', 4), 'image/svg+xml')
    expect(await analyzeIconLuminance('https://example.com/mixed-dark.svg')).toBe('dark')
  })

  it('returns null when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }))
    expect(await analyzeIconLuminance('https://example.com/missing.png')).toBeNull()
  })

  it('caches results per url', async () => {
    mockFetchWith(await makePng([10, 10, 10]), 'image/png')
    const fetchSpy = vi.mocked(global.fetch)

    await analyzeIconLuminance('https://example.com/cached.png')
    await analyzeIconLuminance('https://example.com/cached.png')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
