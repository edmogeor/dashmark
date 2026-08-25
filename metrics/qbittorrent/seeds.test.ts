import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts seeding torrents', async () => {
  await expectFixtureMetric(new URL('./seeds.yml', import.meta.url), JSON.parse(readFileSync(new URL('./torrents.fixture.json', import.meta.url), 'utf8')), 2)
})
