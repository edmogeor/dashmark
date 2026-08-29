import { describe, expect, it } from 'vitest'
import { chartDomain, endLabelOffset } from '@/lib/chart-layout'

describe('chartDomain', () => {
  it('anchors nonnegative data at zero', () => {
    expect(chartDomain([4, 8])).toEqual([4, 9])
    expect(chartDomain([0, 0])).toEqual([0, 1])
  })

  it('keeps a focused domain for signed data', () => {
    expect(chartDomain([-4, 8])).toEqual([-4, 9.2])
  })
})

describe('endLabelOffset', () => {
  it('separates overlapping labels without clipping them', () => {
    const labels = [
      { key: 'first', value: 50 },
      { key: 'second', value: 51 }
    ]
    const first = endLabelOffset('first', 100, labels, [0, 100], { y: 0, height: 200 })
    const second = endLabelOffset('second', 98, labels, [0, 100], { y: 0, height: 200 })

    expect(first).not.toBe(0)
    expect(100 - 12 + first).toBeGreaterThanOrEqual(0)
    expect(98 - 12 + second).toBeGreaterThanOrEqual(0)
    expect(Math.abs(100 - 12 + first - (98 - 12 + second))).toBeGreaterThanOrEqual(28)
  })

  it('keeps labels at the plot edge within bounds', () => {
    const labels = [
      { key: 'first', value: 100 },
      { key: 'second', value: 99 }
    ]
    const first = endLabelOffset('first', 0, labels, [0, 100], { y: 0, height: 200 })
    const second = endLabelOffset('second', 2, labels, [0, 100], { y: 0, height: 200 })

    expect(0 - 12 + first).toBeGreaterThanOrEqual(0)
    expect(2 - 12 + second).toBeGreaterThanOrEqual(0)
  })

  it('reserves space for x-axis labels below the plot', () => {
    const offset = endLabelOffset('last', 200, [{ key: 'last', value: 0 }], [0, 100], { y: 0, height: 200 })

    expect(200 - 12 + offset + 24).toBeLessThanOrEqual(192)
  })
})
