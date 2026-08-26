export function sharedCacheControl(intervalMs: number): string {
  const sMaxAge = Math.max(1, Math.min(5, Math.floor(intervalMs / 1_000)))
  return `public, max-age=0, s-maxage=${sMaxAge}, must-revalidate`
}
