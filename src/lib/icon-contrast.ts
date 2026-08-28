import fs from 'node:fs'
import path from 'node:path'

export type IconContrast = 'dark' | 'light'

let contrastIndex: Record<string, IconContrast> | undefined

function loadContrastIndex(): Record<string, IconContrast> {
  if (contrastIndex) return contrastIndex

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.resolve('src/data/icon-contrast.json'), 'utf-8'))
    if (parsed && typeof parsed === 'object') {
      contrastIndex = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, IconContrast] => entry[1] === 'dark' || entry[1] === 'light'))
      return contrastIndex
    }
  } catch {
    // The generated index is optional when developing without a prebuild.
  }

  contrastIndex = {}
  return contrastIndex
}

export function getIconContrast(url: string): IconContrast | undefined {
  return loadContrastIndex()[url]
}
