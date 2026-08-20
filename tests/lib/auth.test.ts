import { describe, it, expect } from 'vitest'
import { getConfig } from '@/lib/config'
import {
  getUser,
  getUserName,
  getUserFirstName,
  getUserLastName,
  getUserUsername,
  getUserEmail,
  parseUserGroups,
  readUserGroups,
  groupHeaderNames
} from '@/lib/auth'

describe('parseUserGroups', () => {
  it('splits comma and semicolon separated values', () => {
    expect(parseUserGroups('admins,media;family')).toEqual(['admins', 'media', 'family'])
  })

  it('trims and drops empty entries', () => {
    expect(parseUserGroups(' admins , , media ')).toEqual(['admins', 'media'])
  })

  it('returns an empty array for missing values', () => {
    expect(parseUserGroups(null)).toEqual([])
    expect(parseUserGroups(undefined)).toEqual([])
    expect(parseUserGroups('')).toEqual([])
  })
})

describe('getUserName', () => {
  it('detects Authentik name header', () => {
    expect(getUserName(new Headers({ 'X-Authentik-Name': 'John Doe' }))).toBe('John Doe')
  })

  it('detects oauth2-proxy preferred username', () => {
    expect(getUserName(new Headers({ 'X-Forwarded-Preferred-Username': 'Jane' }))).toBe('Jane')
  })

  it('returns undefined when no name header is present', () => {
    expect(getUserName(new Headers())).toBeUndefined()
  })
})

describe('getUserUsername', () => {
  it('detects Authentik username header', () => {
    expect(getUserUsername(new Headers({ 'X-Authentik-Username': 'john' }))).toBe('john')
  })

  it('detects oauth2-proxy user header', () => {
    expect(getUserUsername(new Headers({ 'X-Forwarded-User': 'jane' }))).toBe('jane')
  })
})

describe('getUserEmail', () => {
  it('detects Authentik email header', () => {
    expect(getUserEmail(new Headers({ 'X-Authentik-Email': 'john@example.com' }))).toBe('john@example.com')
  })

  it('returns undefined when no email header is present', () => {
    expect(getUserEmail(new Headers())).toBeUndefined()
  })
})

describe('getUserFirstName and getUserLastName', () => {
  it('reads dedicated given/family name headers', () => {
    const headers = new Headers({
      'X-Authentik-Given-Name': 'John',
      'X-Authentik-Family-Name': 'Doe'
    })
    expect(getUserFirstName(headers)).toBe('John')
    expect(getUserLastName(headers)).toBe('Doe')
  })

  it('returns undefined when no dedicated header is present', () => {
    expect(getUserFirstName(new Headers())).toBeUndefined()
    expect(getUserLastName(new Headers())).toBeUndefined()
  })
})

describe('getUser', () => {
  it('reads all fields and derived names from auto-detected headers', () => {
    const config = getConfig()
    const headers = new Headers({
      'X-Authentik-Name': 'John Doe',
      'X-Authentik-Username': 'john',
      'X-Authentik-Email': 'john@example.com',
      'X-Authentik-Groups': 'admins, media'
    })

    expect(getUser(config, headers)).toEqual({
      name: 'John Doe',
      username: 'john',
      email: 'john@example.com',
      firstName: 'John',
      lastName: 'Doe',
      groups: ['admins', 'media']
    })
  })

  it('returns a single-part first name with no last name', () => {
    const config = getConfig()
    const headers = new Headers({ 'X-Authentik-Name': 'John' })

    expect(getUser(config, headers)).toEqual({
      name: 'John',
      username: undefined,
      email: undefined,
      firstName: 'John',
      lastName: undefined,
      groups: []
    })
  })

  it('prefers dedicated given/family name headers over splitting the full name', () => {
    const config = getConfig()
    const headers = new Headers({
      'X-Authentik-Name': 'John Doe',
      'X-Authentik-Given-Name': 'Johnny',
      'X-Authentik-Family-Name': 'Smith'
    })

    const result = getUser(config, headers)
    expect(result.firstName).toBe('Johnny')
    expect(result.lastName).toBe('Smith')
  })

  it('falls back to splitting the full name when dedicated headers are missing', () => {
    const config = getConfig()
    const headers = new Headers({ 'X-Authentik-Name': 'Jane Mary Doe' })

    const result = getUser(config, headers)
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('returns empty groups when no group header is present', () => {
    const config = getConfig()
    expect(getUser(config, new Headers()).groups).toEqual([])
  })

  it('respects a custom group header', () => {
    const config = getConfig()
    config.accessGroupsHeader = 'X-Custom-Groups'
    const headers = new Headers({ 'X-Custom-Groups': 'admins' })

    expect(getUser(config, headers).groups).toEqual(['admins'])
  })
})

describe('groupHeaderNames', () => {
  it('returns candidate headers in auto mode', () => {
    const config = getConfig()
    config.accessGroupsHeader = 'auto'
    expect(groupHeaderNames(config)).toContain('X-Authentik-Groups')
    expect(groupHeaderNames(config)).toContain('X-Forwarded-Groups')
  })

  it('returns the single custom header', () => {
    const config = getConfig()
    config.accessGroupsHeader = 'X-Custom-Groups'
    expect(groupHeaderNames(config)).toEqual(['X-Custom-Groups'])
  })
})

describe('readUserGroups', () => {
  it('reports whether a header was found', () => {
    const config = getConfig()
    expect(readUserGroups(config, new Headers()).found).toBe(false)
    expect(readUserGroups(config, new Headers({ 'Remote-Groups': 'admins' })).found).toBe(true)
  })
})
