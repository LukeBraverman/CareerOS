import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  MONTH_NAMES_SHORT,
  DAY_LABELS,
  LEVEL_COLORS,
  HEATMAP_COL_WIDTH,
  formatTooltipDate,
} from '@/lib/heatmap'
import { formatDate, parseDate } from '@/lib/date'
import { isUKBankHolidayWeekend, getUKBankHolidayName } from '@/lib/ukHolidays'
import type { TravelReminder } from '@/types/travel'

interface TravelHeatmapProps {
  selectedMonth: number | null
  onSelectMonth: (month: number | null) => void
  reminders?: TravelReminder[]
  isLoading?: boolean
  year?: number
  onYearChange?: (year: number) => void
}

interface TravelDayCell {
  date: Date
  isoDate: string
  formattedDate: string
  tooltipDate: string
  count: number
  level: number
  isCurrentYear: boolean
  isBankHoliday: boolean
  holidayName?: string
}

export function TravelHeatmap({
  selectedMonth,
  onSelectMonth,
  reminders,
  isLoading = false,
  year: controlledYear,
  onYearChange,
}: TravelHeatmapProps) {
  const [internalYear, setInternalYear] = useState(2026)
  const currentYear = controlledYear !== undefined ? controlledYear : internalYear

  const setYear = (newYear: number) => {
    if (controlledYear === undefined) {
      setInternalYear(newYear)
    }
    onYearChange?.(newYear)
  }

  const [hoveredCell, setHoveredCell] = useState<{
    cell: TravelDayCell
    x: number
    y: number
  } | null>(null)

  // Pre-calculate travel reminder counts by isoDate for active year
  const dateCounts = useMemo(() => {
    const list = reminders ?? []
    const counts = new Map<string, number>()
    list.forEach((r) => {
      const parsed = parseDate(r.date)
      if (parsed && parsed.getFullYear() === currentYear) {
        counts.set(r.isoDate, (counts.get(r.isoDate) || 0) + 1)
      }
    })
    return counts
  }, [reminders, currentYear])

  const totalReminders = useMemo(() => {
    const list = reminders ?? []
    return list.filter((r) => {
      const parsed = parseDate(r.date)
      return parsed && parsed.getFullYear() === currentYear
    }).length
  }, [reminders, currentYear])

  // Build 53-week grid for the given year
  const gridData = useMemo(() => {
    const firstDayOfYear = new Date(currentYear, 0, 1)
    const startDayOfWeek = firstDayOfYear.getDay() // 0=Sun..6=Sat
    const calendarStart = new Date(currentYear, 0, 1 - startDayOfWeek)

    const lastDayOfYear = new Date(currentYear, 11, 31)
    const totalDays =
      Math.ceil(
        (lastDayOfYear.getTime() - calendarStart.getTime()) /
          (24 * 60 * 60 * 1000)
      ) + 1
    const totalWeeks = Math.ceil(totalDays / 7)

    const weeks: TravelDayCell[][] = []

    for (let w = 0; w < totalWeeks; w++) {
      const days: TravelDayCell[] = []
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(
          calendarStart.getFullYear(),
          calendarStart.getMonth(),
          calendarStart.getDate() + w * 7 + d
        )
        const isCurrentYear = cellDate.getFullYear() === currentYear
        const y = cellDate.getFullYear()
        const m = String(cellDate.getMonth() + 1).padStart(2, '0')
        const dayStr = String(cellDate.getDate()).padStart(2, '0')
        const isoDate = `${y}-${m}-${dayStr}`
        const count = isCurrentYear ? dateCounts.get(isoDate) || 0 : 0
        const isBankHoliday = isUKBankHolidayWeekend(isoDate)
        const holidayName = isBankHoliday
          ? getUKBankHolidayName(isoDate)
          : undefined

        let level = 0
        if (count === 1) level = 2
        else if (count === 2) level = 3
        else if (count >= 3) level = 4

        days.push({
          date: cellDate,
          isoDate,
          formattedDate: formatDate(cellDate),
          tooltipDate: formatTooltipDate(cellDate),
          count,
          level,
          isCurrentYear,
          isBankHoliday,
          holidayName,
        })
      }
      weeks.push(days)
    }

    const monthHeaders = []
    for (let m = 0; m < 12; m++) {
      const mDate = new Date(currentYear, m, 1)
      const diffDays = Math.round(
        (mDate.getTime() - calendarStart.getTime()) / (24 * 60 * 60 * 1000)
      )
      const weekIndex = Math.floor(diffDays / 7)

      const lastDayOfMonth = new Date(currentYear, m + 1, 0)
      const lastDiffDays = Math.round(
        (lastDayOfMonth.getTime() - calendarStart.getTime()) /
          (24 * 60 * 60 * 1000)
      )
      const endWeekIndex = Math.floor(lastDiffDays / 7)

      monthHeaders.push({
        monthIndex: m,
        monthName: MONTH_NAMES_SHORT[m],
        weekIndex,
        endWeekIndex,
      })
    }

    return { weeks, monthHeaders }
  }, [currentYear, dateCounts])

  const activeMonthHeader = useMemo(() => {
    if (selectedMonth === null) return null
    return (
      gridData.monthHeaders.find((mh) => mh.monthIndex === selectedMonth) ||
      null
    )
  }, [selectedMonth, gridData.monthHeaders])

  return (
    <div className="space-y-4 select-none">
      {/* Heatmap Header Row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
          {isLoading ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#cc785c] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#cc785c]"></span>
              </span>
              <span>Loading {currentYear} reminders...</span>
            </>
          ) : (
            <span>
              {totalReminders} {totalReminders === 1 ? 'travel reminder' : 'travel reminders'} in {currentYear}
            </span>
          )}
        </h2>

        {/* Year Navigator */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setYear(currentYear - 1)}
            className="p-1.5 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#252320] border border-[#2e2c29] transition-colors cursor-pointer"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-semibold text-sm text-white px-2.5">{currentYear}</span>
          <button
            type="button"
            onClick={() => setYear(currentYear + 1)}
            className="p-1.5 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#252320] border border-[#2e2c29] transition-colors cursor-pointer"
            aria-label="Next year"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Heatmap Card Container */}
      <div className="rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-6 shadow-sm relative">
        <div className="overflow-x-auto pb-1 custom-scrollbar">
          <div className="min-w-max flex gap-2.5 items-start">
            {/* Day Labels (Mon, Wed, Fri) */}
            <div className="flex flex-col gap-1 text-[10px] text-[#8e8c87] w-6 shrink-0 pt-7">
              <span className="h-3 flex items-center"></span>
              <span className="h-3 flex items-center">
                {DAY_LABELS[0].label}
              </span>
              <span className="h-3 flex items-center"></span>
              <span className="h-3 flex items-center">
                {DAY_LABELS[1].label}
              </span>
              <span className="h-3 flex items-center"></span>
              <span className="h-3 flex items-center">
                {DAY_LABELS[2].label}
              </span>
              <span className="h-3 flex items-center"></span>
            </div>

            {/* Right: Month Headers & Weeks Grid sharing the exact same horizontal coordinate plane */}
            <div className="flex flex-col relative">
              {/* Month Header row - mathematically aligned */}
              <div className="relative h-6 mb-1.5 select-none">
                {gridData.monthHeaders.map((mh) => {
                  const isSelected = selectedMonth === mh.monthIndex
                  return (
                    <button
                      key={mh.monthIndex}
                      type="button"
                      onClick={() => {
                        if (selectedMonth === mh.monthIndex) {
                          onSelectMonth(null)
                        } else {
                          onSelectMonth(mh.monthIndex)
                        }
                      }}
                      style={{ left: `${mh.weekIndex * HEATMAP_COL_WIDTH}px` }}
                      className={`absolute text-xs transition-colors cursor-pointer px-1.5 py-0.5 rounded-md ${
                        isSelected
                          ? 'text-white font-bold bg-[#353330] border border-[#cc785c] shadow-xs'
                          : 'text-[#8e8c87] hover:text-white hover:bg-[#252320]'
                      }`}
                    >
                      {mh.monthName}
                    </button>
                  )
                })}
              </div>

              {/* Active Month Column Bounding Backdrop */}
              {selectedMonth !== null && activeMonthHeader && (
                <div
                  className="absolute top-7 bottom-0 rounded-lg bg-[#cc785c]/5 border border-[#cc785c]/30 pointer-events-none transition-all duration-150 z-0"
                  style={{
                    left: `${activeMonthHeader.weekIndex * HEATMAP_COL_WIDTH - 2}px`,
                    width: `${
                      (activeMonthHeader.endWeekIndex -
                        activeMonthHeader.weekIndex +
                        1) *
                        HEATMAP_COL_WIDTH +
                      1
                    }px`,
                  }}
                />
              )}

              {/* Weeks Columns */}
              <div className="flex gap-1 relative z-1 overflow-hidden rounded-md">
                {/* Traveling shimmer wave bar during loading */}
                {isLoading && (
                  <div
                    className="absolute inset-y-0 w-36 bg-gradient-to-r from-transparent via-[#cc785c]/35 to-transparent pointer-events-none animate-heatmap-shimmer-sweep z-30"
                    aria-hidden="true"
                  />
                )}

                {gridData.weeks.map((week, wIdx) => (
                  <div key={wIdx} className="flex flex-col gap-1">
                    {week.map((cell, dIdx) => {
                      if (!cell.isCurrentYear) {
                        return (
                          <div
                            key={dIdx}
                            className="w-3 h-3 rounded-xs opacity-0 pointer-events-none"
                          />
                        )
                      }

                      if (isLoading) {
                        return (
                          <div
                            key={dIdx}
                            style={{
                              animationDelay: `${wIdx * 35 + dIdx * 15}ms`,
                            }}
                            className="w-3 h-3 rounded-[2px] bg-[#22201e] animate-heatmap-wave pointer-events-none"
                            aria-hidden="true"
                          />
                        )
                      }

                      const isCellInSelectedMonth =
                        selectedMonth !== null &&
                        cell.date.getMonth() === selectedMonth

                      const cellColor = LEVEL_COLORS[cell.level]

                      const opacityClass =
                        selectedMonth === null || isCellInSelectedMonth
                          ? 'opacity-100'
                          : 'opacity-35 hover:opacity-100'

                      return (
                        <div
                          key={dIdx}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setHoveredCell({
                              cell,
                              x: rect.left + rect.width / 2,
                              y: rect.top - 8,
                            })
                          }}
                          onMouseLeave={() => setHoveredCell(null)}
                          onClick={() => {
                            onSelectMonth(cell.date.getMonth())
                          }}
                          style={{ backgroundColor: cellColor }}
                          className={`w-3 h-3 rounded-xs transition-all duration-100 cursor-pointer ${opacityClass} ${
                            cell.isBankHoliday
                              ? 'border border-red-500 shadow-[0_0_2px_rgba(239,68,68,0.7)]'
                              : 'border border-transparent'
                          } ${
                            isCellInSelectedMonth
                              ? 'ring-1 ring-[#cc785c] ring-offset-1 ring-offset-[#1e1d1b]'
                              : 'hover:ring-1 hover:ring-white/40'
                          }`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Floating Tooltip */}
        {hoveredCell && (
          <div
            className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-lg bg-[#252320] border border-[#383531] text-[11px] text-white shadow-xl whitespace-nowrap"
            style={{
              left: `${hoveredCell.x}px`,
              top: `${hoveredCell.y}px`,
            }}
          >
            <span className="font-semibold">
              {hoveredCell.cell.count > 0
                ? `${hoveredCell.cell.count} travel reminder${
                    hoveredCell.cell.count > 1 ? 's' : ''
                  }`
                : 'No travel reminders'}{' '}
              on {hoveredCell.cell.tooltipDate}
            </span>
            {hoveredCell.cell.isBankHoliday && (
              <span className="block text-red-400 text-[10px] mt-0.5">
                ● {hoveredCell.cell.holidayName || 'UK Bank Holiday Weekend'}
              </span>
            )}
          </div>
        )}

        {/* Footer: Red Square info & Legend */}
        <div className="mt-5 pt-4 border-t border-[#2e2c29] flex flex-wrap items-center justify-between gap-4 text-xs text-[#8e8c87]">
          {/* Left indicator: Bank Holiday weekend */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs border border-red-500 bg-[#22201e] inline-block shrink-0" />
            <span>Bank holiday weekend · click a month to open it</span>
          </div>

          {/* Right: Legend */}
          <div className="flex items-center gap-1.5">
            <span>Less</span>
            {LEVEL_COLORS.map((col, idx) => (
              <div
                key={idx}
                style={{ backgroundColor: col }}
                className="w-3 h-3 rounded-xs border border-[#2e2c29]"
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  )
}
