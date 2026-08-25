import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

const definition = new URL('./backup-health.yml', import.meta.url)

type Job = { enabled: boolean; lastBackupStatus: string | null }

const job = (enabled: boolean, lastBackupStatus: string | null): Job => ({ enabled, lastBackupStatus })

it('reports success when every enabled job succeeded, ignoring disabled jobs', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./backup-health.fixture.json', import.meta.url), 'utf8'))
  await expectFixtureMetric(definition, fixture, 'success')
})

it('reports error when any enabled job failed, ahead of warnings', async () => {
  await expectFixtureMetric(definition, [job(true, 'success'), job(true, 'warning'), job(true, 'error')], 'error')
})

it('reports warning when any enabled job warned', async () => {
  await expectFixtureMetric(definition, [job(true, 'success'), job(true, 'warning')], 'warning')
})

it('reports in_progress while a backup is running', async () => {
  await expectFixtureMetric(definition, [job(true, 'success'), job(true, 'in_progress')], 'in_progress')
})

it('reports unknown when an enabled job never ran', async () => {
  await expectFixtureMetric(definition, [job(true, 'success'), job(true, null)], 'unknown')
})

it('reports unknown when no schedules are enabled', async () => {
  await expectFixtureMetric(definition, [job(false, 'error')], 'unknown')
})
