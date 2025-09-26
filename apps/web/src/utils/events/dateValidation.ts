import { DateTime } from 'luxon'

export interface DateValidationResult {
  date: Date
  corrected: boolean
  reason?: string
  originalDate?: string
}

/**
 * Validates and corrects a date string to ensure it's in the future and properly formatted
 */
export function validateAndCorrectDate(
  dateStr: string, 
  userTZ = 'America/New_York',
  isEndDate = false
): DateValidationResult {
  try {
    // Try to parse as ISO string first
    let parsed: Date
    if (dateStr.includes('T') || dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-')) {
      // ISO format
      parsed = new Date(dateStr)
    } else {
      // Try to parse as local date and convert to user timezone
      const dt = DateTime.fromISO(dateStr, { zone: userTZ })
      if (dt.isValid) {
        parsed = dt.toJSDate()
      } else {
        parsed = new Date(dateStr)
      }
    }

    if (isNaN(parsed.getTime())) {
      return {
        date: getTomorrowMorning(userTZ),
        corrected: true,
        reason: 'invalid date format',
        originalDate: dateStr
      }
    }

    const now = new Date()
    const tomorrow = getTomorrowMorning(userTZ)
    
    // If date is in the past or today, move to tomorrow
    if (parsed <= now) {
      const corrected = new Date(tomorrow)
      corrected.setHours(parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds())
      return {
        date: corrected,
        corrected: true,
        reason: 'moved from past to future',
        originalDate: dateStr
      }
    }

    // If date is too far in the future (more than 1 year), cap it
    const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    if (parsed > oneYearFromNow) {
      return {
        date: oneYearFromNow,
        corrected: true,
        reason: 'capped to 1 year from now',
        originalDate: dateStr
      }
    }

    return {
      date: parsed,
      corrected: false,
      originalDate: dateStr
    }
  } catch (error) {
    // Fallback to tomorrow if parsing fails
    return {
      date: getTomorrowMorning(userTZ),
      corrected: true,
      reason: 'parsing error, using tomorrow',
      originalDate: dateStr
    }
  }
}

/**
 * Ensures end date is after start date with reasonable duration
 */
export function ensureValidDuration(
  startDate: Date, 
  endDate: Date, 
  minDurationMinutes = 30,
  maxDurationHours = 8
): Date {
  const minEnd = new Date(startDate.getTime() + minDurationMinutes * 60 * 1000)
  const maxEnd = new Date(startDate.getTime() + maxDurationHours * 60 * 60 * 1000)
  
  if (endDate <= startDate) {
    return minEnd
  }
  
  if (endDate > maxEnd) {
    return maxEnd
  }
  
  return endDate
}

/**
 * Gets tomorrow morning at 9 AM in the user's timezone
 */
function getTomorrowMorning(userTZ: string): Date {
  const tomorrow = DateTime.now().setZone(userTZ).plus({ days: 1 }).startOf('day').set({ hour: 9 })
  return tomorrow.toJSDate()
}

/**
 * Validates that a date is during reasonable business hours (8 AM - 8 PM)
 */
export function isReasonableTime(date: Date, userTZ: string): boolean {
  const dt = DateTime.fromJSDate(date).setZone(userTZ)
  const hour = dt.hour
  return hour >= 8 && hour <= 20
}

/**
 * Adjusts a date to the next reasonable business hour if it's outside business hours
 */
export function adjustToBusinessHours(date: Date, userTZ: string): Date {
  const dt = DateTime.fromJSDate(date).setZone(userTZ)
  const hour = dt.hour
  
  if (hour < 8) {
    // Too early, move to 8 AM same day
    return dt.set({ hour: 8, minute: 0, second: 0, millisecond: 0 }).toJSDate()
  } else if (hour > 20) {
    // Too late, move to 8 AM next day
    return dt.plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 }).toJSDate()
  }
  
  return date
}
