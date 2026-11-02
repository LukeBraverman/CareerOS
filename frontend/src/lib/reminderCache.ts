import {
  getRemindersForYear,
  getRemindersForMonth,
  FULL_MONTH_NAMES,
  type BackendReminder,
} from '@/lib/api'
import {
  parseIsoToLocalDate,
  formatDisplayDate,
  parseDate,
  formatDate,
} from '@/lib/date'
import type { SearchReminder, TodayReminder, ReminderCategory } from '@/types/reminder'

// In-memory module-level cache keyed by year
const yearCache = new Map<number, SearchReminder[]>()
const inFlightRequests = new Map<number, Promise<SearchReminder[]>>()

// In-memory module-level cache keyed by `${year}-${month.toLowerCase()}`
const monthCache = new Map<string, SearchReminder[]>()
const inFlightMonthRequests = new Map<string, Promise<SearchReminder[]>>()

/**
 * Returns cached reminders for the specified year, if available.
 */
export function getCachedYearReminders(year: number): SearchReminder[] | undefined {
  return yearCache.get(year)
}

/**
 * Manually updates the cached reminders for a year.
 */
export function setCachedYearReminders(
  year: number,
  reminders: SearchReminder[]
): void {
  yearCache.set(year, reminders)
}

/**
 * Adds or updates a single reminder in the appropriate year cache.
 */
export function addReminderToCache(reminder: SearchReminder): void {
  const yearMatch = reminder.date.match(/\/(\d{4})$/)
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10)
    const existing = yearCache.get(year)
    if (existing) {
      if (!existing.some((r) => r.id === reminder.id)) {
        yearCache.set(year, [reminder, ...existing])
      }
    }
  }
}

/**
 * Converts a backend API reminder into a SearchReminder model.
 */
export function backendReminderToSearchReminder(
  r: BackendReminder
): SearchReminder {
  const { dateStr, timeStr, dayDisplay, fullDateTime } = parseIsoToLocalDate(
    r.triggerAt,
    r.timeZone || 'Europe/London'
  )

  // Format channels: e.g. ["WHATSAPP", "SLACK"] -> ["WhatsApp", "Slack"]
  const channels =
    r.channels && r.channels.length > 0
      ? r.channels.map((c) => {
          const lower = c.toLowerCase()
          if (lower === 'whatsapp') return 'WhatsApp'
          if (lower === 'slack') return 'Slack'
          if (lower === 'sms') return 'SMS'
          if (lower === 'email') return 'Email'
          if (lower === 'push') return 'Push'
          return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()
        })
      : ['Push']

  // Categorization: Rely strictly on metadata tags
  let category: ReminderCategory = 'General'
  const tag = (r.metadata?.tag || r.metadata?.category || '').trim().toLowerCase()
  if (tag === 'travel') {
    category = 'Travel'
  } else if (tag === 'culture') {
    category = 'Culture'
  } else {
    category = 'General'
  }

  // Format recurrence label
  let recurrenceLabel = 'Once'
  const recType = (r.recurrence?.type || '').toUpperCase()
  if (recType === 'DAILY') {
    recurrenceLabel = 'Daily'
  } else if (recType === 'WEEKLY') {
    recurrenceLabel =
      r.recurrence.daysOfWeek && r.recurrence.daysOfWeek.length > 0
        ? `Weekly · on ${r.recurrence.daysOfWeek.join(', ')}`
        : 'Weekly'
  } else if (recType === 'MONTHLY') {
    const interval =
      r.recurrence?.intervalMonths && r.recurrence.intervalMonths > 1
        ? `Every ${r.recurrence.intervalMonths} months`
        : 'Monthly'
    const mode =
      r.recurrence?.monthlyMode === 'END_OF_MONTH'
        ? 'End of month'
        : 'Same day'
    recurrenceLabel = `${interval} · ${mode}`
  } else if (recType === 'YEARLY') {
    recurrenceLabel = 'Yearly'
  }

  const createdAtFormatted =
    r.createdAt && !r.createdAt.startsWith('0001')
      ? formatDisplayDate(new Date(r.createdAt))
      : '—'
  const completedAtFormatted =
    r.completedAt && !r.completedAt.startsWith('0001')
      ? formatDisplayDate(new Date(r.completedAt))
      : '—'

  return {
    id: r.id,
    time: timeStr,
    icon: r.emoji || '🔔',
    title: r.message,
    channels,
    recipient: r.recipient || 'SYSTEM',
    status: r.status || 'PENDING',
    important: Boolean(r.important),
    category,
    firesAt: fullDateTime,
    timeZone: r.timeZone || 'Europe/London',
    createdAt: createdAtFormatted,
    completedAt: completedAtFormatted,
    recurrence: recurrenceLabel,
    date: dateStr,
    dateDisplay: dayDisplay,
    metadata: r.metadata,
  }
}

/**
 * Fetches reminders for the specified year across all 12 months, utilizing the in-memory cache.
 * If cached, returns immediately without network calls.
 * Deduplicates in-flight requests for the same year.
 */
export async function fetchYearRemindersWithCache(
  year: number
): Promise<SearchReminder[]> {
  const cached = yearCache.get(year)
  if (cached !== undefined) {
    return cached
  }

  const inFlight = inFlightRequests.get(year)
  if (inFlight) {
    return inFlight
  }

  const promise = (async () => {
    try {
      const rawReminders = await getRemindersForYear(year)
      const mapped = rawReminders.map(backendReminderToSearchReminder)
      // Sort soonest first by date and time
      mapped.sort((a, b) => {
        const dateA = parseDate(a.date)
        const dateB = parseDate(b.date)
        const timeA = dateA ? dateA.getTime() : 0
        const timeB = dateB ? dateB.getTime() : 0
        if (timeA !== timeB) return timeA - timeB
        return a.time.localeCompare(b.time)
      })
      yearCache.set(year, mapped)
      return mapped
    } finally {
      inFlightRequests.delete(year)
    }
  })()

  inFlightRequests.set(year, promise)
  return promise
}

/**
 * Fetches reminders for a specific month with in-memory caching.
 * If the full year is already cached, derives the month's reminders from yearCache.
 */
export async function fetchMonthRemindersWithCache(
  year: number,
  month: string
): Promise<SearchReminder[]> {
  const monthKey = `${year}-${month.toLowerCase()}`

  // If the entire year is already cached, filter from the year cache directly
  const cachedYear = yearCache.get(year)
  if (cachedYear !== undefined) {
    const monthIndex = FULL_MONTH_NAMES.findIndex(
      (m) => m.toLowerCase() === month.toLowerCase()
    )
    if (monthIndex !== -1) {
      return cachedYear.filter((r) => {
        const parsed = parseDate(r.date)
        return parsed && parsed.getFullYear() === year && parsed.getMonth() === monthIndex
      })
    }
  }

  // Check month cache
  const cachedMonth = monthCache.get(monthKey)
  if (cachedMonth !== undefined) {
    return cachedMonth
  }

  // Deduplicate in-flight month requests
  const inFlight = inFlightMonthRequests.get(monthKey)
  if (inFlight) {
    return inFlight
  }

  const promise = (async () => {
    try {
      const rawReminders = await getRemindersForMonth(year, month)
      const mapped = rawReminders.map(backendReminderToSearchReminder)
      mapped.sort((a, b) => {
        const dateA = parseDate(a.date)
        const dateB = parseDate(b.date)
        const timeA = dateA ? dateA.getTime() : 0
        const timeB = dateB ? dateB.getTime() : 0
        if (timeA !== timeB) return timeA - timeB
        return a.time.localeCompare(b.time)
      })
      monthCache.set(monthKey, mapped)
      return mapped
    } finally {
      inFlightMonthRequests.delete(monthKey)
    }
  })()

  inFlightMonthRequests.set(monthKey, promise)
  return promise
}

/**
 * Returns today's reminders from cache if available, or fetches the current month's
 * reminders from the backend and filters for today.
 */
export async function getTodayRemindersWithCache(): Promise<TodayReminder[]> {
  const now = new Date()
  const year = now.getFullYear()
  const monthName = FULL_MONTH_NAMES[now.getMonth()]
  const todayFormatted = formatDate(now)

  // 1. Check if year cache is available
  const cachedYear = yearCache.get(year)
  if (cachedYear !== undefined) {
    return cachedYear.filter((r) => r.date === todayFormatted)
  }

  // 2. Check month cache or fetch current month
  const monthReminders = await fetchMonthRemindersWithCache(year, monthName)
  return monthReminders.filter((r) => r.date === todayFormatted)
}

/**
 * Removes a reminder from all active in-memory caches.
 */
export function removeReminderFromCache(id: string): void {
  for (const [year, reminders] of yearCache.entries()) {
    yearCache.set(
      year,
      reminders.filter((r) => r.id !== id)
    )
  }
  for (const [monthKey, reminders] of monthCache.entries()) {
    monthCache.set(
      monthKey,
      reminders.filter((r) => r.id !== id)
    )
  }
}

/**
 * Updates an existing reminder in all active in-memory caches.
 * Removes the old record from all caches first, then places the updated record
 * into the appropriate year (and month) cache based on its updated date.
 */
export function updateReminderInCache(updated: SearchReminder): void {
  // First remove old record from all caches
  removeReminderFromCache(updated.id)

  // Place into the correct year cache if loaded
  const parsed = parseDate(updated.date)
  if (parsed) {
    const year = parsed.getFullYear()
    const existingYear = yearCache.get(year)
    if (existingYear) {
      const nextList = [...existingYear, updated]
      nextList.sort((a, b) => {
        const dateA = parseDate(a.date)
        const dateB = parseDate(b.date)
        const timeA = dateA ? dateA.getTime() : 0
        const timeB = dateB ? dateB.getTime() : 0
        if (timeA !== timeB) return timeA - timeB
        return a.time.localeCompare(b.time)
      })
      yearCache.set(year, nextList)
    }

    const monthName = FULL_MONTH_NAMES[parsed.getMonth()].toLowerCase()
    const monthKey = `${year}-${monthName}`
    const existingMonth = monthCache.get(monthKey)
    if (existingMonth) {
      const nextMonthList = [...existingMonth, updated]
      nextMonthList.sort((a, b) => {
        const dateA = parseDate(a.date)
        const dateB = parseDate(b.date)
        const timeA = dateA ? dateA.getTime() : 0
        const timeB = dateB ? dateB.getTime() : 0
        if (timeA !== timeB) return timeA - timeB
        return a.time.localeCompare(b.time)
      })
      monthCache.set(monthKey, nextMonthList)
    }
  }
}

