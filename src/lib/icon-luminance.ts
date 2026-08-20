import sharp from 'sharp'

export type IconContrast = 'dark' | 'light'

const luminanceCache = new Map<string, IconContrast | null>()

const DARK_LUMINANCE_THRESHOLD = 0.2
const LIGHT_LUMINANCE_THRESHOLD = 0.9
const ANALYSIS_SIZE = 32
const BLUR_SIGMA = 4
const FETCH_TIMEOUT_MS = 5000

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export async function analyzeIconLuminance(url: string): Promise<IconContrast | null> {
  const cached = luminanceCache.get(url)
  if (cached !== undefined) return cached

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) {
      luminanceCache.set(url, null)
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const { data, info } = await sharp(buffer)
      .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'inside' })
      .blur(BLUR_SIGMA)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true })

    let totalLuminance = 0
    let opaquePixels = 0

    for (let i = 0; i < data.length; i += info.channels) {
      const alpha = data[i + 3] / 255
      if (alpha < 0.1) continue

      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      totalLuminance += relativeLuminance(r, g, b)
      opaquePixels++
    }

    if (opaquePixels === 0) {
      luminanceCache.set(url, null)
      return null
    }

    const average = totalLuminance / opaquePixels

    if (average < DARK_LUMINANCE_THRESHOLD) {
      luminanceCache.set(url, 'dark')
      return 'dark'
    }

    if (average > LIGHT_LUMINANCE_THRESHOLD) {
      luminanceCache.set(url, 'light')
      return 'light'
    }

    luminanceCache.set(url, null)
    return null
  } catch {
    luminanceCache.set(url, null)
    return null
  }
}
