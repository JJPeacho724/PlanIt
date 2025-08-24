// Minimal timezone helpers without external deps. Consumers should pass proper Date objects created in the desired TZ if needed.
// We operate using JS Date in UTC internally but produce date keys and windows using the provided IANA string only for labeling.

import { PlannerPreferences } from './types'

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000))
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000)
}

export function clampToDayWindow(date: Date, preferences: PlannerPreferences): { windowStart: Date; windowEnd: Date } {
  // Convert date to a window [startHour, endHour) in local time of the provided timeZone by constructing a date string
  // We avoid full TZ shifting logic; we assume input Date already approximates local time. This function only builds same-day bounds.
  const d = new Date(date)
  const windowStart = new Date(d)
  windowStart.setHours(preferences.workWindow.startHour, 0, 0, 0)
  const windowEnd = new Date(d)
  windowEnd.setHours(preferences.workWindow.endHour, 0, 0, 0)
  return { windowStart, windowEnd }
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isWorkDay(date: Date, workDays: number[]): boolean {
  return workDays.includes(date.getDay())
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function compareAsc(a: Date, b: Date): number {
  return a.getTime() - b.getTime()
}

