import fs from 'node:fs'
import path from 'node:path'
import { logger } from './logger'
import { errorMessage, isRecord } from './errors'
import type { SelfhstIcon } from './selfhst'

export type DashboardIcon = SelfhstIcon & { darkUrl?: string; lightUrl?: string }

let icons: DashboardIcon[] | undefined

function isIcon(value: unknown): value is DashboardIcon {
  return (
    isRecord(value) &&
    typeof value.reference === 'string' &&
    typeof value.name === 'string' &&
    typeof value.url === 'string' &&
    (value.darkUrl === undefined || typeof value.darkUrl === 'string') &&
    (value.lightUrl === undefined || typeof value.lightUrl === 'string')
  )
}

export function fetchDashboardIcons(): DashboardIcon[] {
  if (icons) return icons

  try {
    const catalog: unknown = JSON.parse(fs.readFileSync(path.resolve('src/data/icons.json'), 'utf-8'))
    const dashboardIcons = isRecord(catalog) ? catalog.dashboard : undefined
    if (!Array.isArray(dashboardIcons) || !dashboardIcons.every(isIcon)) throw new Error('Local icon index had an invalid format')
    return (icons = dashboardIcons)
  } catch (error) {
    logger.warn('selfhst', 'failed to load Dashboard Icons index', { error: errorMessage(error) })
    return (icons = [])
  }
}
