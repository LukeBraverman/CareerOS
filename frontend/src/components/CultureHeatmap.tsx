import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Square } from 'lucide-react'
import {
  MONTH_NAMES_SHORT,
  DAY_LABELS,
  LEVEL_COLORS,
  HEATMAP_COL_WIDTH,
  formatTooltipDate,
} from '@/lib/heatmap'
import { formatDate, parseDate } from '@/lib/date'
import type { DeadSpot, CultureReminder } from '@/types/culture'
import { calculateNextDeadSpot } from '@/lib/cultureDeadSpot'

interface CultureHeatmapProps {
  selectedMonth: number | null
  onSelectMonth: (month: number | null) => void
  activeDeadSpot: DeadSpot | null
  onCycleDeadSpot: () => void
  reminders?: CultureReminder[]
  isLoading?: boolean
  filterCultureOnly?: boolean
  year?: number
  onYearChange?: (year: number) => void
}

interface CultureDayCell {
  date: Date
  isoDate: string
  formattedDate: string
  tooltipDate: string
  hasCulture: boolean
  hasTravel: boolean
  isDeadSpot: boolean
  isCurrentYear: boolean
}

export function CultureHeatmap({
  selectedMonth,
  onSelectMonth,
  activeDeadSpot,
  onCycleDeadSpot,
  reminders,
  isLoading = false,
  filterCultureOnly = false,
  year: controlledYear,
  onYearChange,
}: CultureHeatmapProps) {
  const [internalYear, setInternalYear] = useState(2026)
  const currentYear = controlledYear !== undefined ? controlledYear : internalYear

  const setYear = (newYear: number) => {
    if (controlledYear === undefined) {
      setInternalYear(newYear)
    }
    onYearChange?.(newYear)
  }

  const [hoveredCell, setHoveredCell] = useState<{
    cell: CultureDayCell
    x: number
    y: number
  } | null>(null)

  // Sets of isoDates with reminders for the active year
  const cultureDates = useMemo(() => {
    const s = new Set<string>()
    const source = reminders ?? []
    source
      .filter((r) => r.category === 'Culture')
      .forEach((r) => {
        const parsed = parseDate(r.date)
        if (parsed && parsed.getFullYear() === currentYear) {
          s.add(r.isoDate)
        }
      })
    return s
  }, [reminders, currentYear])

  const travelDates = useMemo(() => {
    const s = new Set<string>()
    const source = reminders ?? []
    source
      .filter((r) => r.category === 'Travel')
      .forEach((r) => {
        const parsed = parseDate(r.date)
        if (parsed && parsed.getFullYear() === currentYear) {
          s.add(r.isoDate)
        }
      })
    return s
  }, [reminders, currentYear])

  // Dynamically calculate strictly THE NEXT DEAD SPOT for the active year
  const nextDeadSpot = useMemo(() => {
    return calculateNextDeadSpot(reminders ?? [], currentYear, filterCultureOnly)
  }, [reminders, currentYear, filterCultureOnly])

  const deadSpotDatesSet = useMemo(() => {
    return new Set(nextDeadSpot ? nextDeadSpot.affectedDates : [])
  }, [nextDeadSpot])

  const gridData = useMemo(() => {
    const firstDayOfYear = new Date(currentYear, 0, 1)
    const startDayOfWeek = firstDayOfYear.getDay()
    const calendarStart = new Date(currentYear, 0, 1 - startDayOfWeek)

    const lastDayOfYear = new Date(currentYear, 11, 31)
    const totalDays =
      Math.ceil(
        (lastDayOfYear.getTime() - calendarStart.getTime()) /
          (24 * 60 * 60 * 1000)
      ) + 1
    const totalWeeks = Math.ceil(totalDays / 7)

    const weeks: CultureDayCell[][] = []

    for (let w = 0; w < totalWeeks; w++) {
      const days: CultureDayCell[] = []
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

        const hasCulture = isCurrentYear && cultureDates.has(isoDate)
        const hasTravel = isCurrentYear && travelDates.has(isoDate)

        // Only mark as dead spot if the date is part of the single next dead spot
        const isDeadSpot = isCurrentYear && deadSpotDatesSet.has(isoDate)

        days.push({
          date: cellDate,
          isoDate,
          formattedDate: formatDate(cellDate),
          tooltipDate: formatTooltipDate(cellDate),
          hasCulture,
          hasTravel,
          isDeadSpot,
          isCurrentYear,
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
  }, [currentYear, cultureDates, travelDates, deadSpotDatesSet])

  const activeMonthHeader = useMemo(() => {
    if (selectedMonth === null) return null
    return (
      gridData.monthHeaders.find((mh) => mh.monthIndex === selectedMonth) ||
      null
    )
  }, [selectedMonth, gridData.monthHeaders])

  const decemberHeader = useMemo(() => {
    return (
      gridData.monthHeaders.find((mh) => mh.monthIndex === 11) ||
      null
    )
  }, [gridData.monthHeaders])

  return (
    <div className="space-y-4 select-none">
      {/* Heatmap Header Row matching 19_1.png */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              {cultureDates.size} culture · {travelDates.size} travel in {currentYear}
            </span>
          )}
        </h2>

        <div className="flex items-center gap-2">
          {/* Next Dead Spot Button matching 19_1.png */}
          <button
            type="button"
            onClick={onCycleDeadSpot}
            disabled={!nextDeadSpot}
            className={`h-8 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs ${
              !nextDeadSpot
                ? 'border-[#2e2c29] bg-[#1b1a18] text-[#63615b] cursor-not-allowed opacity-60'
                : 'border-[#2e2c29] bg-[#252320] hover:bg-[#302e2a] hover:border-[#3d3a36] text-white cursor-pointer'
            }`}
          >
            <Square className="h-3.5 w-3.5 text-neutral-400" />
            <span>Next dead spot</span>
          </button>

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
            <span className="font-semibold text-sm text-white px-2.5">
              {currentYear}
            </span>
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
      </div>

      {/* Heatmap Card Container */}
      <div className="rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-6 shadow-sm relative">
        <div className="overflow-x-auto pb-1 custom-scrollbar">
          <div className="min-w-max flex gap-2.5 items-start">
            {/* Day Labels (Mon, Wed, Fri) aligned with grid */}
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
              {/* Month Header row - mathematically aligned to each month's starting week */}
              <div className="relative h-6 mb-1.5 select-none">
                {gridData.monthHeaders.map((mh) => {
                  const isSelected = selectedMonth === mh.monthIndex
                  const isDecember = mh.monthIndex === 11
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
                          ? isDecember
                            ? 'text-white font-bold bg-[#353330] border border-white shadow-xs'
                            : 'text-white font-bold bg-[#353330] border border-[#cc785c] shadow-xs'
                          : isDecember
                            ? 'text-white/90 hover:text-white hover:bg-[#252320]'
                            : 'text-[#8e8c87] hover:text-white hover:bg-[#252320]'
                      }`}
                    >
                      {mh.monthName}
                      {isDecember ? ' 🎄' : ''}
                    </button>
                  )
                })}
              </div>

              {/* Active Month Column Bounding Backdrop (for non-December months) */}
              {selectedMonth !== null && selectedMonth !== 11 && activeMonthHeader && (
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

              {/* Christmas December Wintery White Outline */}
              {decemberHeader && (
                <div
                  className={`absolute top-7 bottom-0 rounded-lg pointer-events-none transition-all duration-150 z-0 ${
                    selectedMonth === 11
                      ? 'bg-white/[0.06] border-2 border-white shadow-[0_0_18px_rgba(255,255,255,0.25)]'
                      : 'bg-white/[0.03] border border-white/50 shadow-[0_0_12px_rgba(255,255,255,0.15)]'
                  }`}
                  style={{
                    left: `${decemberHeader.weekIndex * HEATMAP_COL_WIDTH - 2}px`,
                    width: `${
                      (decemberHeader.endWeekIndex -
                        decemberHeader.weekIndex +
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

                      const isInActiveDeadSpot =
                        activeDeadSpot?.affectedDates.includes(cell.isoDate)

                      // Determine cell background color matching 19_1.png
                      let bg = '#22201e' // empty
                      if (cell.hasCulture && cell.hasTravel) {
                        bg = '#a855f7' // Purple: Both
                      } else if (cell.hasCulture) {
                        bg = '#d97757' // Terracotta: Culture
                      } else if (cell.hasTravel) {
                        bg = '#38bdf8' // Blue: Travel
                      }

                      const isCellInSelectedMonth =
                        selectedMonth !== null &&
                        cell.date.getMonth() === selectedMonth

                      // When a month is selected, deemphasize other months so the selected month is crystal clear
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
                          style={{ backgroundColor: bg }}
                          className={`w-3 h-3 rounded-xs transition-all duration-100 cursor-pointer ${opacityClass} ${
                            isInActiveDeadSpot
                              ? 'border-2 border-white ring-1 ring-white/50 z-10 scale-110 shadow-sm'
                              : cell.isDeadSpot
                              ? 'border border-neutral-300'
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
              {hoveredCell.cell.tooltipDate}
            </span>
            <div className="text-[10px] text-[#c2bfb8] mt-0.5 space-y-0.5">
              {hoveredCell.cell.hasCulture && (
                <div className="text-[#d97757]">● Culture reminder</div>
              )}
              {hoveredCell.cell.hasTravel && (
                <div className="text-sky-400">● Travel reminder</div>
              )}
              {hoveredCell.cell.isDeadSpot && (
                <div className="text-neutral-300">
                  □ Gap over two weeks without events
                </div>
              )}
              {!hoveredCell.cell.hasCulture &&
                !hoveredCell.cell.hasTravel &&
                !hoveredCell.cell.isDeadSpot && (
                  <div className="text-[#8e8c87]">No scheduled reminders</div>
                )}
            </div>
          </div>
        )}

        {/* Footer Legend matching 19_1.png */}
        <div className="mt-5 pt-4 border-t border-[#2e2c29] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#8e8c87]">
            {/* Category Indicators */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Culture */}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#d97757] inline-block shrink-0" />
                <span className="text-white">Culture</span>
              </div>

              {/* Travel */}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#38bdf8] inline-block shrink-0" />
                <span className="text-white">Travel</span>
              </div>

              {/* Both */}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#a855f7] inline-block shrink-0" />
                <span className="text-white">Both</span>
              </div>

              {/* Gap over two weeks */}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs border border-neutral-300 bg-[#22201e] inline-block shrink-0" />
                <span className="text-white">Gap over two weeks</span>
              </div>
            </div>

            {/* Density Scale */}
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

          {/* Subtext: Active or Next Dead Spot information */}
          {activeDeadSpot || nextDeadSpot ? (
            <div className="text-xs text-[#a8a59f]">
              Next dead spot · {(activeDeadSpot || nextDeadSpot)!.daysCount} days,{' '}
              {(activeDeadSpot || nextDeadSpot)!.dateRangeDisplay}
            </div>
          ) : (
            <div className="text-xs text-[#8e8c87]">
              No upcoming dead spots in {currentYear}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
