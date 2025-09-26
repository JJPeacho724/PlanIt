import { DateTime } from "luxon"
import * as chrono from "chrono-node"

export type TemporalWindow = "morning"|"afternoon"|"evening"|"night"|null
export type CadenceKind = "once"|"daily"|"every_other_day"|"weekly"|"biweekly"|"monthly"|"custom"

export type USI = {
  goal: string
  durationMin: number
  cadence: { kind: CadenceKind; daysOfWeek?: number[]; interval?: number; byMonthDay?: number|null; bySetPos?: number|null; nthWeekday?: { nth:number; dow:number }|null }
  window: TemporalWindow
  startDate: string
  endDate?: string | null
  count?: number | null
  timezone: string
  priority?: 1|2|3
  // explicit time seed if present, in local tz
  seedTime?: { hour: number; minute: number } | null
}

export function inferWindow(text: string): TemporalWindow {
  const s = text.toLowerCase()
  if (/morning|before\s*noon|a\.?m\.?/i.test(s)) return "morning"
  if (/afternoon|after\s*lunch/i.test(s)) return "afternoon"
  if (/evening|after\s*work|p\.?m\.?/i.test(s)) return "evening"
  if (/night|late/i.test(s)) return "night"
  return null
}

export function parseDOW(text: string): number[]|undefined {
  const map: Record<string, number> = { sun:0, mon:1, tue:2, tues:2, wed:3, thu:4, thur:4, fri:5, sat:6 }
  const s = text.toLowerCase()
  if (/weekdays/.test(s)) return [1,2,3,4,5]
  if (/weekends?/.test(s)) return [0,6]
  const hits = Array.from(s.matchAll(/\b(sun|mon|tue|tues|wed|thu|thur|fri|sat)\b/g)).map(m=>map[m[1]])
  return hits.length ? Array.from(new Set(hits)) : undefined
}

export function resolveHorizon(text: string, tz="America/Chicago") {
  const now = DateTime.now().setZone(tz).startOf("day")
  let start = now
  let end = now.plus({ days: 7 }).endOf("day")

  const s = text.toLowerCase()

  const until = chrono.parseDate(text, { forwardDate: true })
  if (/until|through|thru/i.test(text) && until) {
    start = now
    end = DateTime.fromJSDate(until).setZone(tz).endOf("day")
  }

  const mFor = s.match(/\bfor\s+(\d+)\s*(day|days|week|weeks|month|months)\b/)
  if (mFor) {
    const n = parseInt(mFor[1],10)
    const unit = mFor[2].startsWith("day") ? "days" : mFor[2].startsWith("week") ? "weeks" : "months"
    start = now
    end = now.plus({ [unit]: n } as any).endOf("day")
  }

  if (/\bthis week\b/i.test(text)) {
    start = now.startOf("week")
    end = now.endOf("week")
  }
  if (/\bnext week\b/i.test(text)) {
    start = now.plus({ weeks:1 }).startOf("week")
    end = start.endOf("week")
  }
  if (/\bthis month\b/i.test(text)) {
    start = now.startOf("month")
    end = now.endOf("month")
  }
  if (/\bnext month\b/i.test(text)) {
    start = now.plus({ months:1 }).startOf("month")
    end = start.endOf("month")
  }
  if (/\bthis weekend\b/i.test(text)) {
    const sat = now.plus({ days: (6 - now.weekday) % 7 + 1 }).startOf("day")
    start = sat
    end = sat.plus({ days:1 }).endOf("day")
  }

  const mQ = s.match(/\bq([1-4])\b/)
  if (mQ) {
    const q = parseInt(mQ[1],10)
    const startMonth = (q-1)*3 + 1
    start = DateTime.fromObject({ year: now.year, month: startMonth, day: 1 }, { zone: tz })
    end = start.plus({ months: 3 }).minus({ days: 1 }).endOf("day")
  }

  const mIn = s.match(/\bin\s+(\d+)\s*(day|days|week|weeks)\b/)
  if (mIn) {
    const n = parseInt(mIn[1],10)
    const unit = mIn[2].startsWith("day") ? "days" : "weeks"
    start = now.plus({ [unit]: n } as any)
    end = start.endOf("week")
  }

  const abs = chrono.parseDate(text, { forwardDate: true })
  if (abs && /on\b|@|at\s+\d|^(\d{1,2}\/\d{1,2})/i.test(text)) {
    const d = DateTime.fromJSDate(abs).setZone(tz)
    start = d.startOf("day")
    end = d.endOf("day")
  }

  return { startDate: start.toISODate()!, endDate: end.toISODate()! }
}

export function interpretTemporal(message: string, tz="America/Chicago"): USI {
  const s = message.toLowerCase()
  let window: TemporalWindow = inferWindow(s)
  const dow = parseDOW(s)
  let durationMin = 60
  const mDur = s.match(/(\d+)\s*(min|mins|minutes|hour|hours|hr|hrs)\b/)
  if (mDur) {
    const n = parseInt(mDur[1],10)
    durationMin = /min/.test(mDur[2]) ? Math.max(25, n) : Math.max(25, n*60)
  }

  // explicit time (e.g., "at 5:30 pm", "7am", "18:00")
  let seedTime: { hour: number; minute: number } | null = null
  try {
    const parsed = chrono.parse(message, DateTime.now().setZone(tz).toJSDate(), { forwardDate: true })
    for (const p of parsed) {
      if ((p as any)?.start?.isCertain && (p as any).start.isCertain("hour")) {
        const comp = (p as any).start.date()
        const dt = DateTime.fromJSDate(comp).setZone(tz)
        seedTime = { hour: dt.hour, minute: dt.minute }
        break
      }
    }
  } catch {}

  let cadence: USI["cadence"] = { kind: "once" }
  if (/\bdaily|every day\b/i.test(s)) cadence = { kind: "daily" }
  else if (/\bevery other day\b/i.test(s)) cadence = { kind: "every_other_day" }
  else if (/\bbiweekly\b/i.test(s)) cadence = { kind: "biweekly", interval: 2 }
  else if (/\bweekly\b/i.test(s) || dow) cadence = { kind: "weekly", daysOfWeek: dow, interval: 1 }
  else if (/\bmonthly\b/i.test(s)) cadence = { kind: "monthly", interval: 1 }

  const mNth = s.match(/\b(1st|first|2nd|second|3rd|third|4th|fourth)\s+(sun|mon|tue|tues|wed|thu|thur|fri|sat)\b/)
  if (mNth) {
    const nthMap: Record<string,number> = { "1st":1, first:1, "2nd":2, second:2, "3rd":3, third:3, "4th":4, fourth:4 }
    const dowMap: Record<string,number> = { sun:0, mon:1, tue:2, tues:2, wed:3, thu:4, thur:4, fri:5, sat:6 }
    cadence = { kind: "custom", daysOfWeek: [dowMap[mNth[2]]], interval: 1, bySetPos: nthMap[mNth[1]], nthWeekday: { nth: nthMap[mNth[1]], dow: dowMap[mNth[2]] } }
  }

  // domain hints (fallback) e.g., gym tends to morning/evening if no explicit time/window
  if (!window && !seedTime && /(gym|workout|run|exercise|train)/i.test(s)) window = "evening"

  const { startDate, endDate } = resolveHorizon(message, tz)

  return {
    goal: message.replace(/^i\s+want\s+to\s+/i,"").trim(),
    durationMin,
    cadence,
    window,
    startDate,
    endDate,
    count: null,
    timezone: tz,
    priority: 2,
    seedTime,
  }
}


