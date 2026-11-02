/**
 * UK Bank Holidays and associated long-weekend dates for 2026.
 * Standard England & Wales calendar.
 */

export interface UKBankHoliday {
  name: string
  date: string // YYYY-MM-DD
  weekendDates: string[] // All dates forming the long weekend (YYYY-MM-DD)
}

export const UK_BANK_HOLIDAYS_2026: UKBankHoliday[] = [
  {
    name: "New Year's Day",
    date: '2026-01-01',
    weekendDates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'],
  },
  {
    name: 'Good Friday',
    date: '2026-04-03',
    weekendDates: ['2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06'],
  },
  {
    name: 'Easter Monday',
    date: '2026-04-06',
    weekendDates: ['2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06'],
  },
  {
    name: 'Early May Bank Holiday',
    date: '2026-05-04',
    weekendDates: ['2026-05-02', '2026-05-03', '2026-05-04'],
  },
  {
    name: 'Spring Bank Holiday',
    date: '2026-05-25',
    weekendDates: ['2026-05-23', '2026-05-24', '2026-05-25'],
  },
  {
    name: 'Summer Bank Holiday',
    date: '2026-08-31',
    weekendDates: ['2026-08-29', '2026-08-30', '2026-08-31'],
  },
  {
    name: 'Christmas Day',
    date: '2026-12-25',
    weekendDates: [
      '2026-12-25',
      '2026-12-26',
      '2026-12-27',
      '2026-12-28',
    ],
  },
  {
    name: 'Boxing Day (substitute day)',
    date: '2026-12-28',
    weekendDates: [
      '2026-12-25',
      '2026-12-26',
      '2026-12-27',
      '2026-12-28',
    ],
  },
]

// Set of all dates (YYYY-MM-DD) that are part of a UK bank holiday weekend
export const UK_BANK_HOLIDAY_WEEKEND_SET: Set<string> = new Set(
  UK_BANK_HOLIDAYS_2026.flatMap((h) => h.weekendDates)
)

export function isUKBankHolidayWeekend(isoDateString: string): boolean {
  return UK_BANK_HOLIDAY_WEEKEND_SET.has(isoDateString)
}

export function getUKBankHolidayName(isoDateString: string): string | undefined {
  const match = UK_BANK_HOLIDAYS_2026.find((h) => h.date === isoDateString)
  if (match) return match.name
  const weekendMatch = UK_BANK_HOLIDAYS_2026.find((h) =>
    h.weekendDates.includes(isoDateString)
  )
  return weekendMatch ? `${weekendMatch.name} Weekend` : undefined
}
