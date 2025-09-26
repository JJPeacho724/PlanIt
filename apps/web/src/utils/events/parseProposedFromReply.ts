import { DateTime } from 'luxon'
import { parseToUserTZ } from './parseTime'

export type ProposedBlock = {
  title: string
  startsAt: Date
  endsAt: Date
  rationale?: string
}

/**
 * Parse "Proposed" schedule blocks from a chatbot reply and convert them to concrete times in the user's timezone.
 * Supported patterns (case-insensitive):
 * - "Proposed: 9:00–10:00 AM — Deep work on X"
 * - "Proposed 2: 1:30 PM–2:00 PM: Review PRs"
 * - "Proposed — 3–3:30pm ET: Title"
 * - "9–10am: Title" if the reply section is preceded by a heading like "Proposed" or "Proposed schedule"
 */
export function parseProposedFromReply(reply: string, userTZ = 'America/New_York', referenceDate?: Date): ProposedBlock[] {
  if (!reply || typeof reply !== 'string') return []
  const tz = userTZ || 'America/New_York'
  const day = referenceDate ? DateTime.fromJSDate(referenceDate).setZone(tz).toISODate() : DateTime.local().setZone(tz).toISODate()

  const lines = reply.split(/\r?\n/)
  const out: ProposedBlock[] = []

  // Identify if we're inside a Proposed section to allow lenient parsing
  let inProposed = false
  // Build a weekday → title map from earlier sections like "Plan Workouts"
  const weekdayTitleMap: Record<string, string> = {}
  try {
    for (const raw of lines) {
      const s = raw.trim()
      // Match lines like "Monday: Cardio (running, cycling)" or "Tue - Upper body strength"
      const m = s.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*[:\-]\s*(.+)$/i)
      if (m) {
        const wk = m[1].toLowerCase()
        const title = (m[2] || '').trim()
        if (title) {
          weekdayTitleMap[wk] = normalizeTitle(title)
        }
      }
    }
  } catch {}
  // Helper: find next date for a given weekday name in user's TZ
  function nextDateForWeekday(weekdayName: string): DateTime {
    const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    const idx = weekdays.indexOf(weekdayName.toLowerCase())
    const now = referenceDate ? DateTime.fromJSDate(referenceDate).setZone(tz) : DateTime.local().setZone(tz)
    let candidate = now
    // move forward to the next occurrence of the target weekday (including today if later time can still work is out of scope here)
    for (let i = 0; i < 8; i++) {
      candidate = i === 0 ? now : now.plus({ days: i })
      if (candidate.weekday % 7 === idx) break
    }
    return candidate.startOf('day')
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.length === 0) continue

    // Track proposed section markers
    if (/^#+\s*proposed( schedule| blocks| plan)?\b/i.test(line) || /\*\*proposed\*\*/i.test(line) || /^proposed\b/i.test(line)) {
      inProposed = true
      continue
    }
    if (/^#+\s*[a-z]/i.test(line) && !/^#+\s*proposed/i.test(line)) {
      // New heading; exit Proposed block
      inProposed = false
    }

    // Patterns to capture time range and title
    // Examples:
    // - 9:00–10:00 AM — Title
    // - 1:30 PM–2 PM: Title
    // - 3–3:30pm ET - Title
    // - 09:00-10:00: Title
    const timeTitleMatch = line.match(/^(?:[-*]\s*)?(?:proposed\s*\d*[:\-]\s*)?\s*([\w: .APMapm]+)\s*[–\-]\s*([\w: .APMapm]+)(?:\s*\b([A-Z]{1,4})\b)?\s*(?:—|:|\-)?\s*(.+)$/i)
    if (timeTitleMatch) {
      const startText = normalizeTimeString(timeTitleMatch[1])
      const endText = normalizeTimeString(timeTitleMatch[2])
      const tzAbbr = timeTitleMatch[3]
      const title = (timeTitleMatch[4] || '').trim()

      const whenText = `${day} ${startText} - ${endText}${tzAbbr ? ' ' + tzAbbr : ''}`
      const parsed = parseToUserTZ(whenText, tz)
      if (parsed) {
        out.push({
          title: title || 'Proposed block',
          startsAt: new Date(parsed.startISO),
          endsAt: new Date(parsed.endISO),
        })
        continue
      }
    }

    // Day-of-week + time range without a title, e.g., "Monday: 7:00 AM - 8:00 AM"
    const dowMatch = line.match(/^(?:[-*]\s*)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*[:\-]\s*([\w: .APMapm]+)\s*[–\-]\s*([\w: .APMapm]+)(?:\s*\b([A-Z]{1,4})\b)?\s*(.*)$/i)
    if (dowMatch) {
      const weekdayName = dowMatch[1]
      const startText = normalizeTimeString(dowMatch[2])
      const endText = normalizeTimeString(dowMatch[3])
      const tzAbbr = dowMatch[4]
      const trailing = (dowMatch[5] || '').trim()
      const baseDay = nextDateForWeekday(weekdayName).toISODate()
      const whenText = `${baseDay} ${startText} - ${endText}${tzAbbr ? ' ' + tzAbbr : ''}`
      const parsed = parseToUserTZ(whenText, tz)
      if (parsed) {
        // Try to infer a reasonable title from surrounding context
        const fromMap = weekdayTitleMap[weekdayName.toLowerCase()]
        const title = trailing || fromMap || (/\bgym\b/i.test(reply) ? 'Gym Session' : 'Proposed block')
        out.push({
          title,
          startsAt: new Date(parsed.startISO),
          endsAt: new Date(parsed.endISO),
        })
        continue
      }
    }

    // If in Proposed section, allow single time + duration patterns like "10:00 AM (50m): Title"
    if (inProposed) {
      const singleWithDuration = line.match(/^(?:[-*]\s*)?([\w: .APMapm]+)\s*\((\d{2,3})\s*(?:m|min|minutes)\)\s*[:\-—]\s*(.+)$/i)
      if (singleWithDuration) {
        const startText = normalizeTimeString(singleWithDuration[1])
        const durationMin = parseInt(singleWithDuration[2], 10)
        const title = singleWithDuration[3].trim()
        const startParsed = parseToUserTZ(`${day} ${startText}`, tz)
        if (startParsed) {
          const startsAt = new Date(startParsed.startISO)
          const endsAt = new Date(startsAt.getTime() + Math.max(25, durationMin) * 60000)
          out.push({ title, startsAt, endsAt })
          continue
        }
      }
    }
  }

  // Drop items that ended up in the past relative to user's local time
  try {
    const nowLocal = DateTime.local().setZone(tz)
    const future = out.filter(b => DateTime.fromJSDate(b.startsAt).setZone(tz) >= nowLocal)
    return dedupeByTimeAndTitle(future)
  } catch {
    return dedupeByTimeAndTitle(out)
  }
}

function normalizeTimeString(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\b(am)\b/i, 'AM')
    .replace(/\b(pm)\b/i, 'PM')
    .trim()
}

function normalizeTitle(s: string): string {
  // Prefer an em-dash to separate category and details if present in parentheses
  const m = s.match(/^(.*)\((.*)\)$/)
  if (m) {
    const head = m[1].trim().replace(/[\-–—:]+$/, '').trim()
    const tail = m[2].trim()
    return `${head} — ${tail}`
  }
  return s.trim()
}

function dedupeByTimeAndTitle(list: ProposedBlock[]): ProposedBlock[] {
  const seen = new Set<string>()
  const out: ProposedBlock[] = []
  for (const e of list) {
    const key = `${e.title}|${e.startsAt.toISOString()}|${e.endsAt.toISOString()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}


