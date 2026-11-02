/**
 * Date utility functions for parsing and formatting dates in DD/MM/YYYY format.
 */

export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

export function parseDate(str: string): Date | null {
  if (!str) return null
  const trimmed = str.trim()

  // Match DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10)
    const month = parseInt(dmyMatch[2], 10) - 1
    const year = parseInt(dmyMatch[3], 10)
    const d = new Date(year, month, day)
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d
    }
  }

  // Fallback to match YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10)
    const month = parseInt(ymdMatch[2], 10) - 1
    const day = parseInt(ymdMatch[3], 10)
    const d = new Date(year, month, day)
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d
    }
  }

  return null
}

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatDisplayDate(date: Date): string {
  const day = date.getDate()
  const month = MONTH_NAMES_SHORT[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

export function formatDayDisplay(date: Date): string {
  const dayName = DAY_NAMES_SHORT[date.getDay()]
  const day = date.getDate()
  const month = MONTH_NAMES_SHORT[date.getMonth()]
  return `${dayName} ${day} ${month}`
}

export function formatFullDateTime(date: Date, timeStr: string): string {
  const dayName = DAY_NAMES_SHORT[date.getDay()]
  const day = date.getDate()
  const month = MONTH_NAMES_LONG[date.getMonth()]
  const year = date.getFullYear()
  return `${dayName} ${day} ${month} ${year}, ${timeStr}`
}

/**
 * Formats a date string (DD/MM/YYYY) and time string (HH:mm) into an RFC3339 timestamp
 * with the correct timezone offset for the given IANA timeZone (e.g. "Europe/London").
 */
export function formatToRFC3339(
  dateStr: string,
  timeStr: string,
  timeZone = 'Europe/London'
): string {
  const parsed = parseDate(dateStr)
  if (!parsed) {
    return new Date().toISOString()
  }

  const y = parsed.getFullYear()
  const m = parsed.getMonth() + 1
  const d = parsed.getDate()

  const [hoursStr = '00', minutesStr = '00'] = timeStr.trim().split(':')
  const h = parseInt(hoursStr, 10) || 0
  const min = parseInt(minutesStr, 10) || 0

  const yyyy = String(y)
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  const hh = String(h).padStart(2, '0')
  const minStr = String(min).padStart(2, '0')

  let offsetStr = 'Z'
  try {
    const approxUtc = new Date(Date.UTC(y, m - 1, d, h, min))
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'Europe/London',
      timeZoneName: 'longOffset',
    })
    const parts = formatter.formatToParts(approxUtc)
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value
    if (tzPart) {
      if (tzPart === 'GMT') {
        offsetStr = 'Z'
      } else {
        offsetStr = tzPart.replace('GMT', '')
      }
    }
  } catch {
    offsetStr = 'Z'
  }

  return `${yyyy}-${mm}-${dd}T${hh}:${minStr}:00${offsetStr}`
}

/**
 * Returns the current time formatted as HH:mm in the Europe/London timezone.
 */
export function getLondonTime(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)

    const hour = parts.find((p) => p.type === 'hour')?.value || '00'
    const minute = parts.find((p) => p.type === 'minute')?.value || '00'
    return `${hour}:${minute}`
  } catch {
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
}

export interface ParsedLocalDate {
  date: Date
  dateStr: string // "DD/MM/YYYY"
  timeStr: string // "HH:mm"
  dayDisplay: string // "Sat 12 Sep"
  displayDate: string // "12 Sep 2026"
  fullDateTime: string // "Sat 12 September 2026, 08:00"
}

export function parseIsoToLocalDate(
  isoStr: string,
  timeZone = 'Europe/London'
): ParsedLocalDate {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) {
    const fallback = new Date()
    return {
      date: fallback,
      dateStr: formatDate(fallback),
      timeStr: '09:00',
      dayDisplay: formatDayDisplay(fallback),
      displayDate: formatDisplayDate(fallback),
      fullDateTime: formatFullDateTime(fallback, '09:00'),
    }
  }

  try {
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = dtf.formatToParts(d)
    const day = parts.find((p) => p.type === 'day')?.value || '01'
    const month = parts.find((p) => p.type === 'month')?.value || '01'
    const year = parts.find((p) => p.type === 'year')?.value || '2026'
    const hour = parts.find((p) => p.type === 'hour')?.value || '00'
    const minute = parts.find((p) => p.type === 'minute')?.value || '00'

    const dateStr = `${day}/${month}/${year}`
    const timeStr = `${hour}:${minute}`
    const localDateObj = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10)
    )

    return {
      date: localDateObj,
      dateStr,
      timeStr,
      dayDisplay: formatDayDisplay(localDateObj),
      displayDate: formatDisplayDate(localDateObj),
      fullDateTime: formatFullDateTime(localDateObj, timeStr),
    }
  } catch {
    return {
      date: d,
      dateStr: formatDate(d),
      timeStr: '09:00',
      dayDisplay: formatDayDisplay(d),
      displayDate: formatDisplayDate(d),
      fullDateTime: formatFullDateTime(d, '09:00'),
    }
  }
}

