import { MONTH_NAMES_SHORT } from '@/lib/heatmap'
import type { CultureReminder, DeadSpot } from '@/types/culture'

/**
 * Calculates ONLY "the next dead spot" for the Culture view.
 *
 * Rules:
 * 1. Only calculates "the next dead spot", not every single dead spot.
 * 2. Accurate and strictly from today onwards (a dead spot is never shown for past dates).
 * 3. A dead spot is a period of at least 14 days without scheduled events.
 * 4. If the gap between events is between 14 and 28 days, the dead spot spans the gap.
 *    If the gap is longer than 28 days or there are no upcoming events, the dead spot
 *    highlights the upcoming 15-day block (over 2 weeks) starting from the gap beginning.
 */
export function calculateNextDeadSpot(
  reminders: CultureReminder[],
  viewingYear = 2026,
  filterCultureOnly = false
): DeadSpot | null {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Past years cannot have dead spots from today onwards
  if (viewingYear < today.getFullYear()) {
    return null
  }

  // Evaluation start: today (if viewing the current year) or Jan 1 (if viewing a future year)
  const evalStartDate =
    viewingYear === today.getFullYear()
      ? today
      : new Date(viewingYear, 0, 1)

  const endOfYear = new Date(viewingYear, 11, 31)

  // Build set of days with scheduled events
  const eventDates = new Set<string>()
  for (const r of reminders) {
    if (filterCultureOnly) {
      if (r.category === 'Culture') {
        eventDates.add(r.isoDate)
      }
    } else {
      // Both culture and travel count as active events
      eventDates.add(r.isoDate)
    }
  }

  let gapStart: Date | null = null
  let currentGapDates: string[] = []

  const iter = new Date(evalStartDate)
  while (iter <= endOfYear) {
    const y = iter.getFullYear()
    const m = String(iter.getMonth() + 1).padStart(2, '0')
    const d = String(iter.getDate()).padStart(2, '0')
    const isoDate = `${y}-${m}-${d}`

    if (eventDates.has(isoDate)) {
      if (currentGapDates.length >= 14 && gapStart) {
        return buildDeadSpot(gapStart, currentGapDates)
      }
      gapStart = null
      currentGapDates = []
    } else {
      if (!gapStart) {
        gapStart = new Date(iter)
      }
      currentGapDates.push(isoDate)
    }

    iter.setDate(iter.getDate() + 1)
  }

  if (currentGapDates.length >= 14 && gapStart) {
    return buildDeadSpot(gapStart, currentGapDates)
  }

  return null
}

function buildDeadSpot(gapStart: Date, gapDates: string[]): DeadSpot {
  const cappedDates = gapDates.length > 28 ? gapDates.slice(0, 15) : gapDates
  const startDateStr = cappedDates[0]
  const endDateStr = cappedDates[cappedDates.length - 1]

  const startD = new Date(gapStart)
  const endD = new Date(startD)
  endD.setDate(startD.getDate() + (cappedDates.length - 1))

  const startDay = startD.getDate()
  const startMonthShort = MONTH_NAMES_SHORT[startD.getMonth()]
  const startYear = startD.getFullYear()

  const endDay = endD.getDate()
  const endMonthShort = MONTH_NAMES_SHORT[endD.getMonth()]
  const endYear = endD.getFullYear()

  const dateRangeDisplay = `${startDay} ${startMonthShort} ${startYear} – ${endDay} ${endMonthShort} ${endYear}`

  return {
    id: `deadspot-${startDateStr}`,
    daysCount: cappedDates.length,
    startDate: startDateStr,
    endDate: endDateStr,
    dateRangeDisplay,
    targetMonthIndex: startD.getMonth(),
    affectedDates: cappedDates,
  }
}
