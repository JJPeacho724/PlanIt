import { prisma } from "@/lib/clients/prisma"
import { DateTime } from "luxon"
import type { USI } from "./temporal"

export async function expandAndSlot(
  usi: any,
  userId: string,
  dailyCap = 4,
  overlapPolicy?: { mode?: "none"|"soft"|"allow"; maxOverlapMinutes?: number; stackableGoalRegex?: RegExp }
) {
  const tz = usi.timezone || "America/Chicago"
  const now = new Date()
  const horizonStart = new Date(((usi.startDate || toISODateLocal(now, tz)) + "T00:00:00"))
  const horizonEnd   = new Date(((usi.endDate   || toISODateLocal(addDays(now, 7), tz)) + "T23:59:59"))
  const busy = await prisma.calendarBusy.findMany({
    where: { userId, startsAt: { gte: horizonStart }, endsAt: { lte: horizonEnd } },
    orderBy: { startsAt: "asc" }
  })
  const occurrences = enumerate(usi, horizonStart, horizonEnd)
  const drafts: any[] = []
  const perDayCount = new Map<string, number>()
  for (const localStart of occurrences) {
    const target = seedByWindow(localStart, usi.window, tz)
    const slot = findSlot(target, usi.durationMin, busy, {
      policy: {
        mode: overlapPolicy?.mode ?? "none",
        maxOverlapMinutes: overlapPolicy?.maxOverlapMinutes ?? 30,
        stackableGoalRegex: overlapPolicy?.stackableGoalRegex ?? /(walk|stretch|listen|review flashcards)/i,
      },
      goal: usi.goal || "",
    })
    if (!slot) continue
    const dayKey = slot.toISOString().slice(0,10)
    const used = perDayCount.get(dayKey) || 0
    if (used >= dailyCap) continue
    perDayCount.set(dayKey, used + 1)
    drafts.push({
      id: `draft_${Math.random().toString(36).slice(2)}`,
      title: titleize(usi.goal),
      startsAt: slot.toISOString(),
      endsAt: new Date(slot.getTime() + usi.durationMin*60000).toISOString(),
      rationale: `Proposed ${usi.durationMin} min block for "${usi.goal}"`,
      confidence: 0.7,
      seriesId: seriesId(usi)
    })
    if (drafts.length >= (usi.count || 10)) break
  }
  return drafts
}

// New conflict-aware slotter that accepts pre-expanded occurrences
export async function slotOccurrences(
  usi: USI,
  occurrences: Date[],
  userId: string,
  dailyCap=4,
  overlap?: { mode?: "none"|"soft"|"allow"; maxOverlapMinutes?: number; stackableRegex?: RegExp }
) {
  const tz = usi.timezone
  const policy = {
    mode: overlap?.mode ?? "none",
    maxOverlapMinutes: overlap?.maxOverlapMinutes ?? 20,
    stackableRegex: overlap?.stackableRegex ?? /(walk|stretch|listen|flashcards)/i
  }

  const busy = await prisma.calendarBusy.findMany({
    where: {
      userId,
      startsAt: { gte: DateTime.fromISO(usi.startDate, { zone: tz }).toJSDate() },
      endsAt:   { lte: DateTime.fromISO(usi.endDate || usi.startDate, { zone: tz }).endOf("day").toJSDate() }
    },
    orderBy: { startsAt: "asc" }
  })

  const drafts: any[] = []
  const perDay = new Map<string, number>()

  for (const occ of occurrences) {
    // Normalize to local date start to avoid UTC shifts, then seed time
    let startLocal = DateTime.fromJSDate(occ, { zone: tz }).setZone(tz).startOf("day")
    if (usi.seedTime) {
      startLocal = startLocal.set({ hour: usi.seedTime.hour, minute: usi.seedTime.minute })
    } else if (usi.window === "morning")  startLocal = startLocal.set({ hour: 9,  minute: 0 })
    else if (usi.window === "afternoon")  startLocal = startLocal.set({ hour: 13, minute: 0 })
    else if (usi.window === "evening")    startLocal = startLocal.set({ hour: 18, minute: 0 })
    else if (usi.window === "night")      startLocal = startLocal.set({ hour: 20, minute: 0 })
    else                                   startLocal = startLocal.set({ hour: 18, minute: 0 })

    const slot = findSlotDT(startLocal, usi.durationMin, busy, policy, usi.goal)
    if (!slot) continue

    const dayKey = slot.toISODate()
    const used = perDay.get(dayKey) || 0
    if (used >= dailyCap) continue
    perDay.set(dayKey, used + 1)

    drafts.push({
      id: `draft_${Math.random().toString(36).slice(2)}`,
      title: titleize(usi.goal),
      startsAt: slot.toUTC().toISO(),
      endsAt: slot.plus({ minutes: usi.durationMin }).toUTC().toISO(),
      rationale: `Proposed ${usi.durationMin} min block for "${usi.goal}"`,
      confidence: 0.7
    })
  }

  // Clamp drafts to horizon and not in the past (local tz)
  try {
    const horizonStart = DateTime.fromISO(usi.startDate, { zone: tz }).startOf("day")
    const horizonEnd   = DateTime.fromISO(usi.endDate || usi.startDate, { zone: tz }).endOf("day")
    const nowLocal     = DateTime.now().setZone(tz)
    const clamped = drafts.filter(d => {
      const s = DateTime.fromISO(d.startsAt).setZone(tz)
      return s >= horizonStart && s <= horizonEnd && s >= nowLocal
    })
    return clamped
  } catch {
    return drafts
  }
}

function enumerate(usi: any, now: Date, horizonEnd: Date) {
  const out: Date[] = []
  const start = usi.startDate ? new Date(usi.startDate + "T00:00:00") : now
  const end = usi.endDate ? new Date(usi.endDate + "T23:59:59") : horizonEnd
  const pushIfInRange = (d: Date) => { if (d >= start && d <= end) out.push(new Date(d)) }
  switch (usi.cadence?.kind) {
    case "daily": {
      for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) pushIfInRange(d)
      break
    }
    case "every_other_day": {
      for (let d=new Date(start); d<=end; d.setDate(d.getDate()+2)) pushIfInRange(d)
      break
    }
    case "weekly": {
      const dow = (usi.cadence.daysOfWeek && usi.cadence.daysOfWeek.length) ? usi.cadence.daysOfWeek : [start.getDay()]
      for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) { if (dow.includes(d.getDay())) pushIfInRange(d) }
      break
    }
    case "custom": {
      const dow = usi.cadence.daysOfWeek || []
      const step = Math.max(1, usi.cadence.interval || 1)
      for (let d=new Date(start), i=0; d<=end; d.setDate(d.getDate()+1)) {
        if (dow.length ? dow.includes(d.getDay()) : (i % step === 0)) pushIfInRange(d)
        i++
      }
      break
    }
    default: out.push(start)
  }
  return out
}

function seedByWindow(d: Date, w: string | null, tz: string) {
  const s = new Date(d)
  const set = (h:number,m:number)=>{ s.setHours(h,m,0,0); return s }
  if (w === "morning")  return set(9, 0)
  if (w === "afternoon")return set(13, 0)
  if (w === "evening")  return set(18, 0)
  if (w === "night")    return set(20, 0)
  return set(18, 0)
}

function findSlot(
  start: Date,
  mins: number,
  busy: {startsAt: Date, endsAt: Date}[],
  ctx: { policy: { mode: "none"|"soft"|"allow", maxOverlapMinutes: number, stackableGoalRegex: RegExp }, goal: string }
) {
  const step = 30*60000
  for (let k=0;k<16;k++) {
    const a = new Date(start.getTime() + k*step)
    const b = new Date(a.getTime() + mins*60000)
    const overlaps = busy.filter(x => !(b <= (x as any).startsAt || a >= (x as any).endsAt))
    if (overlaps.length === 0) return a
    if (ctx.policy.mode !== "none" && ctx.policy.stackableGoalRegex.test(ctx.goal || "")) {
      const totalOverlap = overlaps.reduce((acc, x) => {
        const s = Math.max(a.getTime(), (x as any).startsAt.getTime())
        const e = Math.min(b.getTime(), (x as any).endsAt.getTime())
        return acc + Math.max(0, (e - s)/60000)
      }, 0)
      if (totalOverlap <= ctx.policy.maxOverlapMinutes) return a
    }
  }
  return null
}

function findSlotDT(
  startLocal: import("luxon").DateTime,
  mins: number,
  busy: {startsAt: Date, endsAt: Date}[],
  policy: { mode: "none"|"soft"|"allow", maxOverlapMinutes: number, stackableRegex: RegExp },
  goal: string
) {
  for (let k=0;k<16;k++) {
    const a = startLocal.plus({ minutes: k*30 })
    const b = a.plus({ minutes: mins })
    const overlaps = busy.filter(x => !(b.toJSDate() <= x.startsAt || a.toJSDate() >= x.endsAt))
    if (overlaps.length === 0) return a
    if (policy.mode !== "none" && policy.stackableRegex.test(goal)) {
      const total = overlaps.reduce((acc, x) => {
        const s = Math.max(a.toMillis(), new Date(x.startsAt).getTime())
        const e = Math.min(b.toMillis(), new Date(x.endsAt).getTime())
        return acc + Math.max(0, (e - s)/60000)
      }, 0)
      if (total <= policy.maxOverlapMinutes) return a
    }
  }
  return null
}

const titleize = (g:string)=> g.replace(/^i\s+want\s+to\s+/i,'').replace(/^\w/,c=>c.toUpperCase())
const seriesId = (usi:any)=> `series_${Buffer.from([usi.goal,usi.cadence?.kind,usi.startDate||'',usi.endDate||''].join('|')).toString('base64').slice(0,12)}`

function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x }
function toISODateLocal(d: Date, tz: string) {
  // Fallback: keep date components in local system tz; acceptable for day-bound horizons
  const y = d.getFullYear(), m = d.getMonth()+1, day = d.getDate()
  return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}


