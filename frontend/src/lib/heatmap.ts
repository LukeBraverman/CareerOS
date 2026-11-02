import { formatDate, parseDate } from '@/lib/date'

export const LEVEL_COLORS = [
  '#22201e', // Level 0 (empty)
  '#4a3028', // Level 1
  '#7d4432', // Level 2
  '#b55b3d', // Level 3
  '#d97757', // Level 4
] as const

export const MONTH_NAMES_SHORT = [
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
] as const

export const DAY_LABELS = [
  { dayIndex: 1, label: 'Mon' },
  { dayIndex: 3, label: 'Wed' },
  { dayIndex: 5, label: 'Fri' },
] as const

// Standard heatmap layout constants
export const HEATMAP_CELL_SIZE = 12 // px
export const HEATMAP_GAP = 4 // px (Tailwind gap-1)
export const HEATMAP_COL_WIDTH = HEATMAP_CELL_SIZE + HEATMAP_GAP // 16px

export function getLevel(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count === 3) return 3
  return 4
}

export function formatTooltipDate(date: Date): string {
  const day = date.getDate()
  const month = MONTH_NAMES_SHORT[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

export function isTodayDate(date: Date): boolean {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

// PRNG: Mulberry32
function mulberry32(seed: number) {
  let a = seed
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface YearReminderData {
  counts: Map<string, number>
  total: number
}

/**
 * Builds actual heatmap counts and total from a list of reminders for the given year.
 */
export function buildCountsFromReminders(
  year: number,
  reminders: { date: string }[]
): YearReminderData {
  const counts = new Map<string, number>()
  let total = 0

  for (const r of reminders) {
    const parsed = parseDate(r.date)
    if (parsed && parsed.getFullYear() === year) {
      const day = String(parsed.getDate()).padStart(2, '0')
      const month = String(parsed.getMonth() + 1).padStart(2, '0')
      const dateKey = `${year}-${month}-${day}`
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1)
      total++
    }
  }

  return { counts, total }
}

export function getYearReminderData(year: number): YearReminderData {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const totalDays = isLeap ? 366 : 365

  const rng = mulberry32(year * 1000 + 42)
  const counts = new Map<string, number>()
  const raw: number[] = []

  for (let i = 0; i < totalDays; i++) {
    const r = rng()
    let c = 0
    if (r > 0.44) c = 1
    if (r > 0.71) c = 2
    if (r > 0.88) c = 3
    if (r > 0.95) c = 4
    raw.push(c)
  }

  // If year is 2026, anchor Sep 11 to count 3 (matching mockup) and calibrate total to exactly 381
  if (year === 2026) {
    // Sep 11 is day index 253 (0-indexed)
    raw[253] = 3
  }

  let currentSum = raw.reduce((a, b) => a + b, 0)
  const target = year === 2026 ? 381 : Math.round(currentSum)
  let diff = target - currentSum

  const adjRng = mulberry32(year * 777 + 99)
  while (diff !== 0) {
    const i = Math.floor(adjRng() * totalDays)
    if (year === 2026 && i === 253) continue // preserve Sep 11
    if (diff > 0 && raw[i] < 4) {
      raw[i]++
      diff--
    } else if (diff < 0 && raw[i] > 0) {
      raw[i]--
      diff++
    }
  }

  const curDate = new Date(year, 0, 1)
  let total = 0
  for (let i = 0; i < totalDays; i++) {
    const day = String(curDate.getDate()).padStart(2, '0')
    const month = String(curDate.getMonth() + 1).padStart(2, '0')
    const dateKey = `${year}-${month}-${day}`
    const cnt = raw[i]
    counts.set(dateKey, cnt)
    total += cnt
    curDate.setDate(curDate.getDate() + 1)
  }

  return { counts, total }
}

export interface HeatmapDayCell {
  date: Date
  dateKey: string
  formattedDate: string // DD/MM/YYYY
  tooltipDate: string // e.g. 11 Sep 2026
  count: number
  level: number
  isCurrentYear: boolean
  isToday: boolean
}

export interface MonthHeader {
  month: string
  monthIndex: number
  weekIndex: number
  endWeekIndex: number
}

export interface HeatmapGridData {
  weeks: HeatmapDayCell[][]
  monthHeaders: MonthHeader[]
  totalWeeks: number
}

export function getHeatmapGrid(year: number, counts: Map<string, number>): HeatmapGridData {
  const firstDayOfYear = new Date(year, 0, 1)
  const startDayOfWeek = firstDayOfYear.getDay() // 0=Sun..6=Sat
  const calendarStart = new Date(year, 0, 1 - startDayOfWeek)

  const lastDayOfYear = new Date(year, 11, 31)
  const totalDays =
    Math.ceil(
      (lastDayOfYear.getTime() - calendarStart.getTime()) / (24 * 60 * 60 * 1000)
    ) + 1
  const totalWeeks = Math.ceil(totalDays / 7)

  const weeks: HeatmapDayCell[][] = []

  for (let w = 0; w < totalWeeks; w++) {
    const days: HeatmapDayCell[] = []
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(
        calendarStart.getFullYear(),
        calendarStart.getMonth(),
        calendarStart.getDate() + w * 7 + d
      )
      const isCurrentYear = cellDate.getFullYear() === year
      const day = String(cellDate.getDate()).padStart(2, '0')
      const month = String(cellDate.getMonth() + 1).padStart(2, '0')
      const dateKey = `${cellDate.getFullYear()}-${month}-${day}`
      const count = isCurrentYear ? (counts.get(dateKey) || 0) : 0

      days.push({
        date: cellDate,
        dateKey,
        formattedDate: formatDate(cellDate),
        tooltipDate: formatTooltipDate(cellDate),
        count,
        level: getLevel(count),
        isCurrentYear,
        isToday: isTodayDate(cellDate),
      })
    }
    weeks.push(days)
  }

  const monthHeaders: MonthHeader[] = []
  for (let m = 0; m < 12; m++) {
    const mDate = new Date(year, m, 1)
    const diffDays = Math.round(
      (mDate.getTime() - calendarStart.getTime()) / (24 * 60 * 60 * 1000)
    )
    const weekIndex = Math.floor(diffDays / 7)

    const lastDayOfMonth = new Date(year, m + 1, 0)
    const lastDiffDays = Math.round(
      (lastDayOfMonth.getTime() - calendarStart.getTime()) / (24 * 60 * 60 * 1000)
    )
    const endWeekIndex = Math.floor(lastDiffDays / 7)

    monthHeaders.push({
      month: MONTH_NAMES_SHORT[m],
      monthIndex: m,
      weekIndex,
      endWeekIndex,
    })
  }

  return {
    weeks,
    monthHeaders,
    totalWeeks,
  }
}
