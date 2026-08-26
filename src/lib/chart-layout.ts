type ChartEndLabel = { key: string; value: number }
type ChartViewBox = { y?: number; height?: number }

const LABEL_HEIGHT = 24
const LABEL_GAP = 4

export function chartDomain(values: number[]): [number, number] {
  const finiteValues = values.filter(Number.isFinite)
  if (finiteValues.length === 0) return [0, 1]
  const minimum = Math.min(...finiteValues)
  const maximum = Math.max(...finiteValues)
  if (minimum === 0 && maximum === 0) return [0, 1]
  const padding = Math.max((maximum - minimum) * 0.1, Math.abs(maximum) * 0.05, 1)
  const domain: [number, number] = [minimum, maximum + padding]
  return domain.every(Number.isFinite) ? domain : [0, 1]
}

export function endLabelOffset(key: string, y: number, labels: ChartEndLabel[], domain: [number, number], viewBox: ChartViewBox | undefined): number {
  const top = Number(viewBox?.y)
  const height = Number(viewBox?.height)
  const [minimum, maximum] = domain
  const current = labels.find(label => label.key === key)
  if (!current || !Number.isFinite(y) || !Number.isFinite(top) || !Number.isFinite(height) || height <= 0 || maximum <= minimum) return 0

  const range = maximum - minimum
  const desiredTop = y - LABEL_HEIGHT / 2
  const positions = labels
    .map(label => ({
      key: label.key,
      top: y + ((current.value - label.value) / range) * height - LABEL_HEIGHT / 2
    }))
    .sort((left, right) => left.top - right.top)

  for (let index = 1; index < positions.length; index++) {
    positions[index]!.top = Math.max(positions[index]!.top, positions[index - 1]!.top + LABEL_HEIGHT + LABEL_GAP)
  }

  const minimumTop = top
  const maximumTop = top + height - LABEL_HEIGHT
  let shift = -Math.max(0, positions.at(-1)!.top - maximumTop)
  shift += Math.max(0, minimumTop - (positions[0]!.top + shift))
  const position = positions.find(label => label.key === key)
  return position ? position.top + shift - desiredTop : 0
}
