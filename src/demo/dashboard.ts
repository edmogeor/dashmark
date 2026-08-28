import { resolveDescription } from '@/lib/descriptions'
import { resolveIcon } from '@/lib/icons'
import type { AppConfig } from '@/lib/config'
import type { Card } from '@/lib/docker'
import { demoServices } from './services'

export const demoUser = { firstName: 'John', groups: ['admins', 'media', 'family'] }

export async function getDemoCards(config: AppConfig): Promise<Card[]> {
  return Promise.all(
    demoServices.map(async ({ imageName, ...card }) => ({
      ...card,
      isDemo: true,
      metricsPollIntervalMs: config.metricsPollIntervalMs,
      description: resolveDescription(config, { imageName, title: card.title, containerName: card.id }),
      access: card.access ?? [],
      state: card.state ?? 'running',
      health: card.health ?? 'healthy',
      icon: await resolveIcon(config, { imageName, title: card.title, containerName: card.id })
    }))
  )
}
