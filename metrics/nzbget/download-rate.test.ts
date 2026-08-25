import { expectFixtureMetric } from '../test-utils'

it('extracts the NZBGet download rate', async () => {
  await expectFixtureMetric(new URL('./download-rate.yml', import.meta.url), { result: { DownloadRate: 1_024 } }, 1_024)
})
