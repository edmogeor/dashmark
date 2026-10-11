// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { RealtimeMetricsResponse } from '@/lib/realtime-protocol'

const subscription = vi.hoisted(() => ({ receive: undefined as ((metrics: RealtimeMetricsResponse) => void) | undefined }))
vi.mock('@/components/use-realtime', () => ({
  useRealtimeMetrics: (_cardId: string, _active: boolean, receive: (metrics: RealtimeMetricsResponse) => void) => {
    subscription.receive = receive
  }
}))
import { useMetrics } from '@/components/use-metrics'
import { useDashboardViewModel } from '@/components/use-dashboard-view-model'
import type { Card } from '@/lib/docker'

it('releases inactive chart histories while preserving current metric values', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let current: ReturnType<typeof useMetrics> | undefined
  function View({ active }: { active: boolean }) {
    current = useMetrics('app', true, active)
    return null
  }
  const root = createRoot(document.createElement('div'))
  try {
    await act(async () => root.render(createElement(View, { active: true })))
    await act(async () =>
      subscription.receive?.({
        resource: { cpuPercent: 12 },
        history: [{ timestamp: 1, cpuPercent: 12 }],
        customMetrics: [{ key: 'count', label: 'Count', value: 5, unit: 'count', chart: 'line', historyPeriodMs: 300_000, history: [{ timestamp: 1, value: 5 }] }],
        metricErrors: []
      })
    )
    expect(current?.history).toHaveLength(1)
    await act(async () => root.render(createElement(View, { active: false })))
    expect(current?.history).toEqual([])
    expect(current?.resources).toEqual({ cpuPercent: 12 })
    expect(current?.customMetrics).toMatchObject([{ value: 5, history: [] }])
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})

it('keeps search results and category filtering consistent when queries change', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const cards: Card[] = ['Plex', 'Grafana'].map((title) => ({
    id: title,
    title,
    category: title === 'Plex' ? 'Media' : 'Monitoring',
    url: 'https://example.test',
    icon: { type: 'placeholder', initials: title[0]! },
    searchAliases: [],
    hasContainer: false,
    access: []
  }))
  const order: string[] = []
  let current: ReturnType<typeof useDashboardViewModel> | undefined
  function View({ search, selected }: { search: string; selected: string | null }) {
    current = useDashboardViewModel(cards, search, selected, false, order, 'Uncategorised')
    return null
  }
  const root = createRoot(document.createElement('div'))
  try {
    await act(async () => root.render(createElement(View, { search: 'plex', selected: null })))
    expect(current?.flatCards.map((card) => card.title)).toEqual(['Plex'])
    const first = current?.flatCards
    await act(async () => root.render(createElement(View, { search: 'plex ', selected: null })))
    expect(current?.flatCards).toBe(first)
    await act(async () => root.render(createElement(View, { search: 'grafana', selected: null })))
    expect(current?.flatCards.map((card) => card.title)).toEqual(['Grafana'])
    await act(async () => root.render(createElement(View, { search: 'grafana', selected: 'media' })))
    expect(current?.flatCards).toEqual([])
    await act(async () => root.render(createElement(View, { search: '', selected: 'media' })))
    expect(current?.flatCards.map((card) => card.title)).toEqual(['Plex'])
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
