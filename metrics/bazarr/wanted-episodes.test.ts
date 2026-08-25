import { expectFixtureMetric } from '../test-utils'

it('extracts wanted episode subtitles', async () => {
  await expectFixtureMetric(new URL('./wanted-episodes.yml', import.meta.url), { total: 9 }, 9)
})
