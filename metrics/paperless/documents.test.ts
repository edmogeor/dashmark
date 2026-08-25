import { expectFixtureMetric } from '../test-utils'

it('extracts the Paperless document total', async () => {
  await expectFixtureMetric(new URL('./documents.yml', import.meta.url), { documents_total: 42 }, 42)
})
