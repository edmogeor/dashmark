import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts total download speed', async () => {
  await expectFixtureMetric(new URL('./download_speed.yml', import.meta.url), JSON.parse(readFileSync(new URL('./torrents.fixture.json', import.meta.url), 'utf8')), 120000)
})
