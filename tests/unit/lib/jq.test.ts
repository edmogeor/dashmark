import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const spawn = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn }))
import { runJq } from '@/lib/jq'

class Child extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
}

describe('jq process budget', () => {
  it('limits simultaneous processes and drains the queue even when extraction fails', async () => {
    const children: Child[] = []
    let active = 0
    let peak = 0
    spawn.mockImplementation(() => {
      const child = new Child()
      children.push(child)
      peak = Math.max(peak, ++active)
      child.once('close', () => active--)
      return child
    })
    const completed = Promise.allSettled(Array.from({ length: 10 }, () => runJq('.', { value: 1 })))
    expect(children).toHaveLength(4)
    children[0]!.emit('close', 1)
    await vi.waitFor(() => expect(children).toHaveLength(5))
    for (let index = 1; index < 10; index++) {
      await vi.waitFor(() => expect(children[index]).toBeDefined())
      children[index]!.stdout.write('1')
      children[index]!.emit('close', 0)
    }
    const results = await completed
    expect(peak).toBe(4)
    expect(active).toBe(0)
    expect(results[0]?.status).toBe('rejected')
    expect(results.slice(1)).toEqual(Array.from({ length: 9 }, () => ({ status: 'fulfilled', value: 1 })))
  })
})
