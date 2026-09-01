import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { sameOrigin } from '@/lib/realtime-server'

function request(headers: IncomingMessage['headers']): IncomingMessage {
  return { headers } as IncomingMessage
}

describe('realtime origin validation', () => {
  it('accepts a direct same-origin request', () => {
    expect(sameOrigin(request({ host: 'dash.example.test', origin: 'http://dash.example.test' }))).toBe(true)
  })

  it('rejects a cross-origin request', () => {
    expect(sameOrigin(request({ host: 'dash.example.test', origin: 'https://other.example.test' }))).toBe(false)
  })

  it('uses standard forwarded headers from a TLS-terminating proxy', () => {
    expect(
      sameOrigin(
        request({
          host: 'dashmark:4321',
          origin: 'https://dash.example.test',
          forwarded: 'for=192.0.2.1;host=dash.example.test;proto=https'
        })
      )
    ).toBe(true)
  })

  it('uses X-Forwarded headers when standard Forwarded is unavailable', () => {
    expect(
      sameOrigin(
        request({
          host: 'dashmark:4321',
          origin: 'https://dash.example.test',
          'x-forwarded-host': 'dash.example.test',
          'x-forwarded-proto': 'https'
        })
      )
    ).toBe(true)
  })
})
