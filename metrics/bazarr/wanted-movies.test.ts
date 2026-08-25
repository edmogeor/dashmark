import { expectFixtureMetric } from '../test-utils'

it('extracts wanted movie subtitles', async () => {
  await expectFixtureMetric(new URL('./wanted-movies.yml', import.meta.url), { total: 4 }, 4)
})
