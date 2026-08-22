import { describe, it, expect, afterEach } from 'vitest'
import { getConfig } from '@/lib/config'

const trackedVars = [
  'ACCESS_GROUPS_HEADER',
  'USER_NAME_HEADER',
  'USER_USERNAME_HEADER',
  'USER_EMAIL_HEADER',
  'USER_FIRST_NAME_HEADER',
  'USER_LAST_NAME_HEADER',
  'ENABLE_ACCESS_GROUPS',
  'SHOW_SEARCH',
  'SHOW_STATUS',
  'ENABLE_AUTOMATIC_ICONS',
  'SHOW_BRANDING',
  'SHOW_HEADER',
  'SHOW_GROUP_TAGS',
  'SHOW_THEME_TOGGLE',
  'NEW_TAB',
  'CUSTOM_HEADER',
  'GREETING_MORNING',
  'GREETING_AFTERNOON',
  'GREETING_EVENING',
  'CUSTOM_STYLESHEET'
]

const originals = trackedVars.map(name => ({ name, value: process.env[name] }))

afterEach(() => {
  for (const { name, value } of originals) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('getConfig accessGroupsHeader', () => {
  it('defaults to auto when unset', () => {
    delete process.env.ACCESS_GROUPS_HEADER
    expect(getConfig().accessGroupsHeader).toBe('auto')
  })

  it('keeps a valid custom header', () => {
    process.env.ACCESS_GROUPS_HEADER = 'X-Forwarded-Groups'
    expect(getConfig().accessGroupsHeader).toBe('X-Forwarded-Groups')
  })

  it('falls back to auto for an invalid header name', () => {
    process.env.ACCESS_GROUPS_HEADER = 'X Bad Header'
    expect(getConfig().accessGroupsHeader).toBe('auto')
  })
})

describe('getConfig user headers', () => {
  it('reads valid custom user headers', () => {
    process.env.USER_NAME_HEADER = ' X-Custom-Name '
    process.env.USER_USERNAME_HEADER = 'X-Custom-Username'
    process.env.USER_EMAIL_HEADER = 'X-Custom-Email'
    process.env.USER_FIRST_NAME_HEADER = 'X-Custom-Given-Name'
    process.env.USER_LAST_NAME_HEADER = 'X-Custom-Family-Name'

    expect(getConfig()).toMatchObject({
      userNameHeader: 'X-Custom-Name',
      userUsernameHeader: 'X-Custom-Username',
      userEmailHeader: 'X-Custom-Email',
      userFirstNameHeader: 'X-Custom-Given-Name',
      userLastNameHeader: 'X-Custom-Family-Name'
    })
  })

  it('ignores invalid custom user headers', () => {
    process.env.USER_NAME_HEADER = 'X Invalid Header'
    expect(getConfig().userNameHeader).toBeUndefined()
  })
})

describe('getConfig feature toggles', () => {
  it('defaults enableAccessGroups to false', () => {
    delete process.env.ENABLE_ACCESS_GROUPS
    expect(getConfig().enableAccessGroups).toBe(false)
  })

  it('defaults visual features to on', () => {
    delete process.env.SHOW_SEARCH
    delete process.env.SHOW_STATUS
    delete process.env.ENABLE_AUTOMATIC_ICONS
    delete process.env.SHOW_BRANDING

    const cfg = getConfig()
    expect(cfg.showSearch).toBe(true)
    expect(cfg.showStatus).toBe(true)
    expect(cfg.enableAutomaticIcons).toBe(true)
    expect(cfg.showBranding).toBe(true)
  })

  it('can turn visual features off', () => {
    process.env.SHOW_SEARCH = 'false'
    process.env.SHOW_STATUS = 'false'
    process.env.SHOW_BRANDING = 'false'
    process.env.ENABLE_AUTOMATIC_ICONS = 'false'

    const cfg = getConfig()
    expect(cfg.showSearch).toBe(false)
    expect(cfg.showStatus).toBe(false)
    expect(cfg.showBranding).toBe(false)
    expect(cfg.enableAutomaticIcons).toBe(false)
  })

  it('defaults showHeader to true', () => {
    delete process.env.SHOW_HEADER
    expect(getConfig().showHeader).toBe(true)
  })

  it('can hide the header', () => {
    process.env.SHOW_HEADER = 'false'
    expect(getConfig().showHeader).toBe(false)
  })

  it('defaults showGroupTags to true', () => {
    delete process.env.SHOW_GROUP_TAGS
    expect(getConfig().showGroupTags).toBe(true)
  })

  it('can hide the group tags', () => {
    process.env.SHOW_GROUP_TAGS = 'false'
    expect(getConfig().showGroupTags).toBe(false)
  })

  it('defaults showThemeToggle to true', () => {
    delete process.env.SHOW_THEME_TOGGLE
    expect(getConfig().showThemeToggle).toBe(true)
  })

  it('can hide the theme toggle', () => {
    process.env.SHOW_THEME_TOGGLE = 'false'
    expect(getConfig().showThemeToggle).toBe(false)
  })

  it('defaults openInNewTab to false', () => {
    delete process.env.NEW_TAB
    expect(getConfig().openInNewTab).toBe(false)
  })

  it('can open links in a new tab', () => {
    process.env.NEW_TAB = 'true'
    expect(getConfig().openInNewTab).toBe(true)
  })
})

describe('getConfig greeting values', () => {
  it('defaults customHeader to undefined', () => {
    delete process.env.CUSTOM_HEADER
    expect(getConfig().customHeader).toBeUndefined()
  })

  it('trims and reads customHeader', () => {
    process.env.CUSTOM_HEADER = '  {greeting}, {first_name}!  '
    expect(getConfig().customHeader).toBe('{greeting}, {first_name}!')
  })

  it('defaults the period greetings to undefined', () => {
    delete process.env.GREETING_MORNING
    delete process.env.GREETING_AFTERNOON
    delete process.env.GREETING_EVENING
    const cfg = getConfig()
    expect(cfg.greetingMorning).toBeUndefined()
    expect(cfg.greetingAfternoon).toBeUndefined()
    expect(cfg.greetingEvening).toBeUndefined()
  })

  it('reads and trims custom period greetings', () => {
    process.env.GREETING_AFTERNOON = '  G\'day  '
    expect(getConfig().greetingAfternoon).toBe('G\'day')
  })
})

describe('getConfig custom stylesheet', () => {
  it('defaults customStylesheet to undefined', () => {
    delete process.env.CUSTOM_STYLESHEET
    expect(getConfig().customStylesheet).toBeUndefined()
  })

  it('trims and reads the custom stylesheet path', () => {
    process.env.CUSTOM_STYLESHEET = '  /app/custom.css  '
    expect(getConfig().customStylesheet).toBe('/app/custom.css')
  })
})
