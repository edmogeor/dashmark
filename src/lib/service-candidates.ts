import { IMAGE_SUFFIXES } from './constants'

export function normalizeServiceCandidate(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export function getServiceCandidates(imageName: string | undefined, containerName: string, title: string): string[] {
  const candidates = new Set<string>()

  const add = (value: string | undefined) => {
    if (!value) return
    const normalized = normalizeServiceCandidate(value)
    if (normalized) candidates.add(normalized)
  }

  if (imageName) {
    const base = imageName.split('/').pop() ?? imageName
    const withoutTag = base.split(':')[0]
    add(withoutTag)
    for (const suffix of IMAGE_SUFFIXES) {
      if (withoutTag.endsWith(suffix) && withoutTag.length > suffix.length) {
        add(withoutTag.slice(0, -suffix.length))
      }
    }
  }

  add(containerName)
  add(title)

  return [...candidates]
}
