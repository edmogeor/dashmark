const BADGE_COLOR_COUNT = 12
const CHART_COLOR_COUNT = 8

export function badgeColorIndex(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0
  return (hash >>> 0) % BADGE_COLOR_COUNT
}

export function badgeColor(index: number): string {
  return `dashmark-badge-color dashmark-badge-color-${index % BADGE_COLOR_COUNT}`
}

export function chartColorVariable(index: number): string {
  return `var(--dashmark-chart-color-${index % CHART_COLOR_COUNT})`
}
