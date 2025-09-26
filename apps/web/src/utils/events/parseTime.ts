import { DateTime } from 'luxon'
import * as chrono from 'chrono-node'

const TZ_ABBR_TO_IANA: Record<string, string> = {
  PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  MT: 'America/Denver', MST: 'America/Denver', MDT: 'America/Denver',
  CT: 'America/Chicago', CST: 'America/Chicago', CDT: 'America/Chicago',
  ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York'
}

export function parseToUserTZ(text: string, userTZ = 'America/New_York') {
  const results = chrono.parse(text, new Date(), { forwardDate: true })
  if (!results[0]) return null
  const res = results[0]

  // Determine input timezone from abbreviation or chrono timezoneOffset
  const abbrMatch = text.match(/\b(PT|PST|PDT|MT|MST|MDT|CT|CST|CDT|ET|EST|EDT)\b/i)
  const inputZone = abbrMatch ? TZ_ABBR_TO_IANA[abbrMatch[1].toUpperCase()] : undefined
  const tzOffset = res.start.get('timezoneOffset')

  // Build DateTime from parsed components in the right zone
  const y = res.start.get('year') ?? DateTime.now().year
  const m = res.start.get('month') ?? DateTime.now().month
  const d = res.start.get('day') ?? DateTime.now().day
  const hasExplicitTime = typeof res.start.get('hour') === 'number'
  const hh = res.start.get('hour') ?? 9
  const mm = res.start.get('minute') ?? 0

  let start = DateTime.fromObject(
    { year: y, month: m, day: d, hour: hh, minute: mm },
    { zone: inputZone || (typeof tzOffset === 'number' ? `UTC${formatOffset(tzOffset)}` : userTZ) }
  )

  let end: DateTime
  if (res.end) {
    const ye = res.end.get('year') ?? y
    const me = res.end.get('month') ?? m
    const de = res.end.get('day') ?? d
    const hhe = res.end.get('hour') ?? hh
    const mme = res.end.get('minute') ?? mm
    end = DateTime.fromObject(
      { year: ye, month: me, day: de, hour: hhe, minute: mme },
      { zone: inputZone || (typeof tzOffset === 'number' ? `UTC${formatOffset(tzOffset)}` : userTZ) }
    )
  } else {
    end = start.plus({ minutes: 60 })
  }

  const startISO = start.setZone(userTZ).toISO()!
  const endISO = end.setZone(userTZ).toISO()!
  return { startISO, endISO, timezone: userTZ, hasExplicitTime }
}

function formatOffset(mins: number) {
  // mins is minutes offset from UTC, e.g., -480 for PT
  const sign = mins >= 0 ? '-' : '+' // chrono offsets are opposite direction
  const abs = Math.abs(mins)
  const h = Math.floor(abs / 60).toString().padStart(2, '0')
  const m = (abs % 60).toString().padStart(2, '0')
  return `${sign}${h}:${m}`
}

export function detectAmbiguity(text: string): boolean {
  // Heuristic: times without explicit timezone words may be ambiguous
  const hasExplicitTZ = /(\b(et|est|edt|pt|pst|pdt|ct|cst|cdt|mt|mst|mdt)\b|UTC|GMT)/i.test(text)
  const hasDateOrDay = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun|\b\d{1,2}\/\d{1,2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i.test(text)
  const hasTime = /(\b\d{1,2}(:\d{2})?\s?(am|pm)\b|\b\d{1,2}:\d{2}\b)/i.test(text)
  return hasTime && !hasExplicitTZ && !hasDateOrDay
}


