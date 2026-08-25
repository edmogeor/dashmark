import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts active leechers', async () => {
  await expectFixtureMetric(new URL('./leechers.yml', import.meta.url), JSON.parse(readFileSync(new URL('./torrents.fixture.json', import.meta.url), 'utf8')), 1)
})
