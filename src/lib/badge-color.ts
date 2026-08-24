const BADGE_COLOR_COUNT = 12
const CHART_COLOR_COUNT = 8

export function badgeColor(index: number): string {
  return `dashmark-badge-color dashmark-badge-color-${index % BADGE_COLOR_COUNT}`
}

export function chartColorVariable(index: number): string {
  return `var(--dashmark-chart-color-${index % CHART_COLOR_COUNT})`
}
