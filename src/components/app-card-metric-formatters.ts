import { defaultLocale, getMessages, type Locale } from '@/i18n'
import type { CustomMetricUnit } from '@/lib/status'

const byteUnits = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const satisfies readonly Intl.NumberFormatOptions['unit'][]
const bitUnits = ['bit', 'kilobit', 'megabit', 'gigabit', 'terabit'] as const satisfies readonly Intl.NumberFormatOptions['unit'][]
const bytePerSecondUnits = [
  'byte-per-second',
  'kilobyte-per-second',
  'megabyte-per-second',
  'gigabyte-per-second',
  'terabyte-per-second'
] as const satisfies readonly Intl.NumberFormatOptions['unit'][]
const bitPerSecondUnits = ['bit-per-second', 'kilobit-per-second', 'megabit-per-second', 'gigabit-per-second', 'terabit-per-second'] as const satisfies readonly Intl.NumberFormatOptions['unit'][]

function scaledUnitParts(value: number, unitCount: number): { amount: number; index: number } {
  const normalizedValue = Math.max(0, value)
  const index = normalizedValue === 0 ? 0 : Math.min(Math.floor(Math.log(normalizedValue) / Math.log(1_024)), unitCount - 1)
  return { amount: normalizedValue / 1_024 ** index, index }
}

function formatNumber(value: number, significantDigits: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: significantDigits }).format(value)
}

function formatScaledUnit(value: number, units: readonly Intl.NumberFormatOptions['unit'][], significantDigits: number, locale: Locale): string {
  const { amount, index } = scaledUnitParts(value, units.length)
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[index],
    unitDisplay: 'narrow',
    maximumSignificantDigits: significantDigits
  }).format(amount)
}

function formatBytesWithPrecision(value: number, significantDigits: number, locale: Locale): string {
  return formatScaledUnit(value, byteUnits, significantDigits, locale)
}

function formatBitsWithPrecision(value: number, significantDigits: number, locale: Locale): string {
  return formatScaledUnit(value, bitUnits, significantDigits, locale)
}

export function formatBytes(value: number, locale: Locale = defaultLocale): string {
  return formatBytesWithPrecision(value, 3, locale)
}

export function formatDetailedBytes(value: number, locale: Locale = defaultLocale): string {
  return formatBytesWithPrecision(value, 4, locale)
}

export function formatPercent(value: number, locale: Locale = defaultLocale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumSignificantDigits: 3 }).format(value / 100)
}

export function formatDetailedPercent(value: number, locale: Locale = defaultLocale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumSignificantDigits: 4 }).format(value / 100)
}

export const formatAxisPercent = formatPercent
export const formatAxisBytes = formatBytes

function formatDuration(value: number, significantDigits: number, locale: Locale): string {
  const [amount, unit]: [number, Intl.NumberFormatOptions['unit']] =
    value < 1 ? [value * 1_000, 'millisecond'] : value < 60 ? [value, 'second'] : value < 3_600 ? [value / 60, 'minute'] : [value / 3_600, 'hour']
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow', maximumSignificantDigits: significantDigits }).format(amount)
}

function formatUnit(value: number, unit: Intl.NumberFormatOptions['unit'], significantDigits: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow', maximumSignificantDigits: significantDigits }).format(value)
}

function formatCustomMetricWithPrecision(value: number, unit: CustomMetricUnit, significantDigits: number, locale: Locale): string {
  if (typeof unit === 'object') return `${formatNumber(value, significantDigits, locale)} ${unit.suffix}`
  if (unit === 'bytes') return formatBytesWithPrecision(value, significantDigits, locale)
  if (unit === 'bytes_per_second') return formatScaledUnit(value, bytePerSecondUnits, significantDigits, locale)
  if (unit === 'bits') return formatBitsWithPrecision(value, significantDigits, locale)
  if (unit === 'bits_per_second') return formatScaledUnit(value, bitPerSecondUnits, significantDigits, locale)
  if (unit === 'percent') return formatPercent(value, locale)
  if (unit === 'ratio') return formatPercent(value * 100, locale)
  if (unit === 'seconds') return formatUnit(value, 'second', significantDigits, locale)
  if (unit === 'milliseconds') return formatUnit(value, 'millisecond', significantDigits, locale)
  if (unit === 'microseconds') return formatUnit(value, 'microsecond', significantDigits, locale)
  if (unit === 'duration') return formatDuration(value, significantDigits, locale)
  if (unit === 'hertz') return formatUnit(value, 'hertz', significantDigits, locale)
  if (unit === 'watts') return formatUnit(value, 'watt', significantDigits, locale)
  if (unit === 'volts') return formatUnit(value, 'volt', significantDigits, locale)
  if (unit === 'amperes') return formatUnit(value, 'ampere', significantDigits, locale)
  if (unit === 'celsius') return formatUnit(value, 'celsius', significantDigits, locale)
  if (unit === 'fahrenheit') return formatUnit(value, 'fahrenheit', significantDigits, locale)
  if (unit === 'boolean') return value === 0 ? getMessages(locale).common.false : getMessages(locale).common.true
  return formatNumber(value, significantDigits, locale)
}

export function formatCustomMetric(value: number, unit: CustomMetricUnit, locale: Locale = defaultLocale): string {
  return formatCustomMetricWithPrecision(value, unit, 3, locale)
}

export function formatDetailedCustomMetric(value: number, unit: CustomMetricUnit, locale: Locale = defaultLocale): string {
  return formatCustomMetricWithPrecision(value, unit, 4, locale)
}

export function formatAxisCustomMetric(value: number, unit: CustomMetricUnit, locale: Locale = defaultLocale): string {
  if (unit === 'bytes') return formatAxisBytes(value, locale)
  if (unit === 'percent') return formatAxisPercent(value, locale)
  if (unit === 'ratio') return formatAxisPercent(value * 100, locale)
  return formatCustomMetric(value, unit, locale)
}
