const BADGE_COLOR_COUNT = 12

export function badgeColor(index: number): string {
  return `dashmark-badge-color dashmark-badge-color-${index % BADGE_COLOR_COUNT}`
}
