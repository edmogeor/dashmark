// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { RealtimeMetricsResponse } from '@/lib/realtime-protocol'

const subscription = vi.hoisted(() => ({ receive: undefined as ((metrics: RealtimeMetricsResponse) => void) | undefined, priority: undefined as string | true | undefined }))
vi.mock('@/components/use-realtime', () => ({
  useRealtimeMetrics: (_id: string, _active: boolean, receive: typeof subscription.receive, _unavailable: unknown, priority: typeof subscription.priority) => {
    subscription.receive = receive
    subscription.priority = priority
  }
}))
vi.mock('@/components/tooltip-controller', () => ({ useTooltipController: () => ({ activeTooltip: 'resource-app', setActiveTooltip: vi.fn() }) }))
vi.mock('@/lib/use-stable-loading', () => ({ useStableLoading: (loading: boolean) => loading }))

import { AppCard } from '@/components/AppCard'
import { getMessages } from '@/i18n'

it('keeps saved uptime visible and updates recovery state and buckets in the open chart modal', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const messages = getMessages()
  const bucket = { start: 0, end: 1, status: 'up' as const, successes: 1, failures: 0 }
  const metrics: RealtimeMetricsResponse = {
    resource: null,
    customMetrics: [],
    metricErrors: [],
    metricRecovery: { uptime: 'recovering' },
    uptimeMetrics: [{ key: 'uptime', label: 'Uptime', current: 'up', buckets: { '24h': [bucket], '7d': [bucket], '30d': [bucket] } }]
  }
  try {
    await act(async () =>
      root.render(
        createElement(AppCard, {
          card: {
            id: 'app',
            title: 'App',
            url: 'https://example.test',
            icon: { type: 'placeholder', initials: 'A' },
            hasContainer: false,
            access: [],
            searchAliases: [],
            customMetricLabels: [{ key: 'uptime', label: 'Uptime' }],
            metrics: ['uptime']
          }
        })
      )
    )
    await act(async () => subscription.receive?.(metrics))
    expect(subscription.priority).toBe(true)
    const row = document.querySelector<HTMLButtonElement>('.dashmark-uptime-metric')!
    expect(row.querySelector('.animate-spin')).not.toBeNull()
    expect(row.querySelector('.dashmark-uptime-heartbeat-cell')).not.toBeNull()
    await act(async () => row.click())
    expect(subscription.priority).toBe('uptime')
    expect(document.querySelector('[role="dialog"] .animate-spin')).not.toBeNull()
    const down = { ...bucket, status: 'down' as const, successes: 0, failures: 1 }
    await act(async () =>
      subscription.receive?.({ ...metrics, metricRecovery: { uptime: 'retrying' }, uptimeMetrics: [{ ...metrics.uptimeMetrics![0]!, buckets: { '24h': [down], '7d': [down], '30d': [down] } }] })
    )
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.querySelector('.animate-spin')).toBeNull()
    expect(dialog.querySelector('[role="status"]')?.textContent).toBe(messages.metrics.collectionFailed)
    expect(dialog.querySelector('.dashmark-uptime-heartbeat-cell')?.classList.contains('bg-destructive')).toBe(true)
    await act(async () => subscription.receive?.({ ...metrics, metricRecovery: {} }))
    expect(document.querySelector('[role="dialog"] [role="status"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
