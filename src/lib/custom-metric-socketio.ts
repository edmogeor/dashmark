import { io } from 'socket.io-client'
import type { CookieJar } from 'tough-cookie'
import type { MetricOverride } from './config-file-types'
import { resolveReferences, resolveSocketIoArguments } from './custom-metric-references'
import { extractJqValue } from './custom-metric-parsing'
import { transformMetricResult, unavailable, type MetricResult } from './custom-metric-result'
import { logger } from './logger'

const REQUEST_TIMEOUT_MS = 5_000

export async function collectSocketIoMetric(key: string, metric: MetricOverride, url: URL, headers: Headers, cookieJar: CookieJar): Promise<MetricResult> {
  const socketio = metric.source.socketio
  if (!socketio) return unavailable(key, 'Socket.IO source was not configured')
  const auth = resolveReferences(metric, socketio.auth ?? {}, 'Socket.IO auth')
  if (auth.error || !auth.values) return unavailable(key, auth.error ?? 'Could not resolve a Socket.IO secret')
  const loginArguments = resolveSocketIoArguments(metric, socketio.login?.args)
  if (loginArguments.error || !loginArguments.values) return unavailable(key, loginArguments.error ?? 'Could not resolve a Socket.IO argument')
  const requestArguments = resolveSocketIoArguments(metric, socketio.request.args)
  if (requestArguments.error || !requestArguments.values) return unavailable(key, requestArguments.error ?? 'Could not resolve a Socket.IO argument')

  const cookie = await cookieJar.getCookieString(url.toString())
  if (cookie) headers.set('Cookie', cookie)
  const extraHeaders = Object.fromEntries(headers)
  const socket = io(url.origin, { autoConnect: false, auth: auth.values, ...(socketio.path ? { path: socketio.path } : {}), ...(Object.keys(extraHeaders).length > 0 ? { extraHeaders } : {}) })
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket.IO connection timed out')), REQUEST_TIMEOUT_MS)
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('connect_error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      socket.connect()
    })
    if (socketio.login) await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(socketio.login.event, ...loginArguments.values)
    const response = await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(socketio.request.event, ...requestArguments.values)
    return transformMetricResult(key, await extractJqValue(key, response, metric), metric)
  } catch (error) {
    const detail = error instanceof Error ? error.name : 'unknown error'
    logger.error('metrics', 'Socket.IO metric request failed', { key, url: url.origin, error: detail })
    return { error: 'collection_failed' }
  } finally {
    socket.disconnect()
  }
}
