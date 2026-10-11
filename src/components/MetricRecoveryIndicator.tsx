import { CircleAlert, LoaderCircle } from 'lucide-react'
import type { MetricRecoveryState } from '@/lib/status'
import { useStableLoading } from '@/lib/use-stable-loading'
import { useLocalization } from './localization'

export function MetricRecoveryIndicator({ state }: { state: MetricRecoveryState | undefined }) {
  const { messages } = useLocalization()
  const loading = useStableLoading(state === 'recovering')
  if (!loading && state !== 'retrying') return null
  const label = state === 'retrying' ? messages.metrics.collectionFailed : messages.card.loading(messages.uptime.history)
  return (
    <span className="inline-flex shrink-0 items-center text-muted-foreground" role="status" title={label}>
      {state === 'retrying' ? <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      <span className="sr-only">{label}</span>
    </span>
  )
}
