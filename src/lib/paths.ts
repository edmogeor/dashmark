import path from 'node:path'

export function isOutsideDirectory(directory: string, target: string): boolean {
  const relativePath = path.relative(directory, target)
  return relativePath === '' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)
}
