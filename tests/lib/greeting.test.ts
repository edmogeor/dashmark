import { describe, it, expect } from 'vitest'
import { getConfig } from '@/lib/config'
import type { AuthUser } from '@/lib/auth'
import { resolveGreeting, renderGreeting, timeOfDayGreeting, greetingPeriod } from '@/lib/greeting'

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    name: 'John Doe',
    username: 'john',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    groups: [],
    ...overrides
  }
}

function config(overrides: Partial<ReturnType<typeof getConfig>> = {}) {
  return { ...getConfig(), ...overrides }
}

describe('greetingPeriod', () => {
  it('splits the day into morning, afternoon, and evening', () => {
    expect(greetingPeriod(new Date(2026, 0, 1, 8))).toBe('morning')
    expect(greetingPeriod(new Date(2026, 0, 1, 14))).toBe('afternoon')
    expect(greetingPeriod(new Date(2026, 0, 1, 19))).toBe('evening')
    expect(greetingPeriod(new Date(2026, 0, 1, 2))).toBe('evening')
  })
})

describe('timeOfDayGreeting', () => {
  it('returns the default period greetings', () => {
    const cfg = config()
    expect(timeOfDayGreeting(cfg, new Date(2026, 0, 1, 8))).toBe('Good morning')
    expect(timeOfDayGreeting(cfg, new Date(2026, 0, 1, 14))).toBe('Good afternoon')
    expect(timeOfDayGreeting(cfg, new Date(2026, 0, 1, 19))).toBe('Good evening')
  })

  it('respects custom period greetings', () => {
    const cfg = config({ greetingMorning: 'Top of the morning' })
    expect(timeOfDayGreeting(cfg, new Date(2026, 0, 1, 8))).toBe('Top of the morning')
    expect(timeOfDayGreeting(cfg, new Date(2026, 0, 1, 14))).toBe('Good afternoon')
  })
})

describe('renderGreeting', () => {
  const cfg = config()
  const date = new Date(2026, 0, 1, 14)

  it('replaces known tags', () => {
    expect(renderGreeting('{greeting}, {first_name} {last_name}!', cfg, user(), date)).toBe('Good afternoon, John Doe!')
  })

  it('supports email, username, and full name tags', () => {
    expect(renderGreeting('{full_name} / {username} / {email}', cfg, user(), date)).toBe('John Doe / john / john@example.com')
  })

  it('replaces missing values with an empty string', () => {
    expect(renderGreeting('Welcome{first_name}!', cfg, user({ name: undefined, firstName: undefined }), date)).toBe('Welcome!')
  })

  it('leaves unknown tags untouched', () => {
    expect(renderGreeting('Hi {bogus}', cfg, user(), date)).toBe('Hi {bogus}')
  })
})

describe('resolveGreeting', () => {
  it('defaults to the period greeting plus first name when available', () => {
    expect(resolveGreeting(config(), user(), new Date(2026, 0, 1, 9))).toBe('Good morning, John!')
  })

  it('defaults to just the period greeting when no name is present', () => {
    expect(resolveGreeting(config(), user({ name: undefined, firstName: undefined }), new Date(2026, 0, 1, 14))).toBe('Good afternoon!')
  })

  it('renders the custom template', () => {
    const cfg = config({ customHeader: 'Hi {first_name}' })
    expect(resolveGreeting(cfg, user(), new Date(2026, 0, 1, 9))).toBe('Hi John')
  })

  it('falls back to the default when the template renders empty', () => {
    const cfg = config({ customHeader: '{first_name}' })
    expect(resolveGreeting(cfg, user({ name: undefined, firstName: undefined }), new Date(2026, 0, 1, 14))).toBe('Good afternoon!')
  })
})
