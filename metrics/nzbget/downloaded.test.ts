import { expectFixtureMetric } from '../test-utils'

it('extracts the NZBGet downloaded size', async () => {
  await expectFixtureMetric(new URL('./downloaded.yml', import.meta.url), { result: { DownloadedSizeMB: 512 } }, 536870912)
})
