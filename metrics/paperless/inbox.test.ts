import { expectFixtureMetric } from '../test-utils'

it('extracts the Paperless inbox total', async () => {
  await expectFixtureMetric(new URL('./inbox.yml', import.meta.url), { documents_inbox: 7 }, 7)
})
