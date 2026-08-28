import type { AppConfig } from './config'
import type { AuthUser } from './auth'
import { strings } from './strings'
import { MORNING_START_HOUR, AFTERNOON_START_HOUR, EVENING_START_HOUR } from './constants'

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening'

type TagResolver = (config: AppConfig, user: AuthUser, date: Date) => string

const TAG_RESOLVERS: Record<string, TagResolver> = {
  greeting: (config, _user, date) => timeOfDayGreeting(config, date),
  email: (_config, user) => user.email ?? '',
  username: (_config, user) => user.username ?? '',
  full_name: (_config, user) => user.name ?? '',
  first_name: (_config, user) => user.firstName ?? '',
  last_name: (_config, user) => user.lastName ?? ''
}

export function greetingPeriod(date: Date): GreetingPeriod {
  const hour = date.getHours()
  if (hour < MORNING_START_HOUR) return 'evening'
  if (hour < AFTERNOON_START_HOUR) return 'morning'
  if (hour < EVENING_START_HOUR) return 'afternoon'
  return 'evening'
}

export function timeOfDayGreeting(config: AppConfig, date: Date): string {
  switch (greetingPeriod(date)) {
    case 'morning':
      return config.greetingMorning ?? strings.greeting.morning
    case 'afternoon':
      return config.greetingAfternoon ?? strings.greeting.afternoon
    case 'evening':
      return config.greetingEvening ?? strings.greeting.evening
  }
}

function defaultGreeting(config: AppConfig, user: AuthUser, date: Date): string {
  const period = timeOfDayGreeting(config, date)
  return user.firstName ? `${period}, ${user.firstName}!` : `${period}!`
}

export function renderGreeting(template: string, config: AppConfig, user: AuthUser, date: Date): string {
  return template
    .replace(/\{(\w+)\}/g, (match, tag: string) => {
      const resolve = TAG_RESOLVERS[tag]
      return resolve ? resolve(config, user, date) : match
    })
    .trim()
}

export function resolveGreeting(config: AppConfig, user: AuthUser, date = new Date()): string {
  const template = config.customHeader?.trim()
  if (!template) return defaultGreeting(config, user, date)

  const rendered = renderGreeting(template, config, user, date)
  return rendered || defaultGreeting(config, user, date)
}
