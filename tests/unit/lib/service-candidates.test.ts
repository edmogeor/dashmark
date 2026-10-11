import { describe, expect, it } from 'vitest'
import { getServiceCandidates } from '@/lib/service-candidates'

describe('getServiceCandidates', () => {
  it('does not use the first word of a title as a candidate', () => {
    expect(getServiceCandidates(undefined, 'code-server', 'Code Server')).toEqual(['code-server'])
  })
})
