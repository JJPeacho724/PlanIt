import { RRule, RRuleSet, Weekday } from "rrule"
import { DateTime } from "luxon"
import type { USI } from "./temporal"

const dowMap: Record<number, Weekday> = {
  0: RRule.SU, 1: RRule.MO, 2: RRule.TU, 3: RRule.WE, 4: RRule.TH, 5: RRule.FR, 6: RRule.SA
}

export function buildRuleSet(usi: USI) {
  const set = new RRuleSet()
  const tz = usi.timezone
  const start = DateTime.fromISO(usi.startDate, { zone: tz }).startOf("day")
  const end = DateTime.fromISO(usi.endDate || usi.startDate, { zone: tz }).endOf("day")
  const dtstart = start.toJSDate()

  const base: Partial<RRule.Options> = { dtstart }

  const addDaily = (interval=1) => set.rrule(new RRule({ ...base, freq: RRule.DAILY, interval }))
  const addWeekly = (days: number[]|undefined, interval=1) =>
    set.rrule(new RRule({ ...base, freq: RRule.WEEKLY, byweekday: (days||[start.weekday%7]).map(d=>dowMap[d]), interval }))
  const addMonthly = (byMonthDay?: number|null, bySetPos?: number|null, dow?: number[]|undefined) => {
    if (bySetPos && dow && dow.length) {
      set.rrule(new RRule({ ...base, freq: RRule.MONTHLY, bysetpos: bySetPos, byweekday: dow.map(d=>dowMap[d]) }))
    } else {
      set.rrule(new RRule({ ...base, freq: RRule.MONTHLY, bymonthday: byMonthDay ?? start.day }))
    }
  }

  switch (usi.cadence.kind) {
    case "once": addDaily(1); break
    case "daily": addDaily(1); break
    case "every_other_day": addDaily(2); break
    case "weekly": addWeekly(usi.cadence.daysOfWeek, usi.cadence.interval||1); break
    case "biweekly": addWeekly(usi.cadence.daysOfWeek, 2); break
    case "monthly": addMonthly(); break
    case "custom": addMonthly(undefined, usi.cadence.bySetPos||null, usi.cadence.daysOfWeek); break
  }

  const until = end.toJSDate()
  set.rdate(dtstart)
  set.rdate(until)

  return { set, horizonStart: start, horizonEnd: end }
}

export function expandOccurrences(usi: USI, maxCount=50) {
  const { set, horizonStart, horizonEnd } = buildRuleSet(usi)
  const list = set.between(horizonStart.toJSDate(), horizonEnd.toJSDate(), true)
  return list.slice(0, usi.count || maxCount)
}


