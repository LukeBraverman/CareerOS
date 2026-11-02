import { useState, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { parseDate, formatDate } from '@/lib/date'
import {
  LEVEL_COLORS,
  DAY_LABELS,
  HEATMAP_COL_WIDTH,
  getYearReminderData,
  buildCountsFromReminders,
  getHeatmapGrid,
  type HeatmapDayCell,
} from '@/lib/heatmap'
import type { SearchReminder } from '@/types/reminder'

export interface ReminderHeatmapProps {
  onSelectDate?: (formattedDate: string) => void
  onSelectMonthRange?: (fromDate: string, toDate: string) => void
  selectedDate?: string
  initialYear?: number
  year?: number
  onYearChange?: (newYear: number) => void
  reminders?: SearchReminder[]
  isLoading?: boolean
}

interface HoveredTooltip {
  x: number
  y: number
  text: string
}

export function ReminderHeatmap({
  onSelectDate,
  onSelectMonthRange,
  selectedDate,
  initialYear = 2026,
  year: controlledYear,
  onYearChange,
  reminders,
  isLoading = false,
}: ReminderHeatmapProps) {
  const [internalYear, setInternalYear] = useState(initialYear)
  const currentYear = controlledYear !== undefined ? controlledYear : internalYear

  const setYear = (newYear: number) => {
    if (controlledYear === undefined) {
      setInternalYear(newYear)
    }
    onYearChange?.(newYear)
  }

  const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate)
  const [internalSelected, setInternalSelected] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [hovered, setHovered] = useState<HoveredTooltip | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Synchronize year if external selectedDate changes to another year
  if (selectedDate !== prevSelectedDate) {
    setPrevSelectedDate(selectedDate)
    if (selectedDate) {
      const parsed = parseDate(selectedDate)
      if (parsed && parsed.getFullYear() !== currentYear) {
        setYear(parsed.getFullYear())
      }
    }
  }

  // Reminder counts and totals for current year
  const yearData = useMemo(() => {
    if (reminders !== undefined) {
      return buildCountsFromReminders(currentYear, reminders)
    }
    return getYearReminderData(currentYear)
  }, [currentYear, reminders])

  const gridData = useMemo(
    () => getHeatmapGrid(currentYear, yearData.counts),
    [currentYear, yearData.counts]
  )

  const activeSelected =
    selectedDate !== undefined ? selectedDate : internalSelected

  const activeMonthHeader = useMemo(() => {
    if (selectedMonth === null) return null
    return (
      gridData.monthHeaders.find((mh) => mh.monthIndex === selectedMonth) ||
      null
    )
  }, [selectedMonth, gridData.monthHeaders])

  const handleDayClick = (cell: HeatmapDayCell) => {
    setInternalSelected(cell.formattedDate)
    setSelectedMonth(cell.date.getMonth())
    onSelectDate?.(cell.formattedDate)
  }

  const handleMonthClick = (monthIndex: number) => {
    setSelectedMonth(monthIndex)
    const firstDate = new Date(currentYear, monthIndex, 1)
    const lastDate = new Date(currentYear, monthIndex + 1, 0)
    const fromStr = formatDate(firstDate)
    const toStr = formatDate(lastDate)
    onSelectMonthRange?.(fromStr, toStr)
  }

  const handlePrevYear = () => {
    setYear(currentYear - 1)
    setHovered(null)
  }

  const handleNextYear = () => {
    setYear(currentYear + 1)
    setHovered(null)
  }

  return (
    <div className="space-y-4">
      {/* Header Row: Title on Left, Year Navigator on Right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h3 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
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
                {yearData.total} {yearData.total === 1 ? 'reminder' : 'reminders'} in {currentYear}
              </span>
            )}
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevYear}
            aria-label="Previous year"
            className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg bg-[#22201e] hover:bg-[#2c2a27] border border-[#2e2c29] text-[#8e8c87] hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="text-sm sm:text-base font-bold text-white px-2 min-w-[3rem] text-center select-none">
            {currentYear}
          </span>

          <button
            type="button"
            onClick={handleNextYear}
            aria-label="Next year"
            className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg bg-[#22201e] hover:bg-[#2c2a27] border border-[#2e2c29] text-[#8e8c87] hover:text-white transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Heatmap Card */}
      <div
        ref={cardRef}
        className="relative rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-6 shadow-sm select-none"
      >
        {/* Floating Custom Tooltip */}
        {hovered && (
          <div
            style={{
              left: `${hovered.x}px`,
              top: `${hovered.y - 6}px`,
              transform: 'translate(-50%, -100%)',
            }}
            className="absolute z-50 pointer-events-none px-2.5 py-1 text-xs font-medium text-[#f0ede6] bg-[#141413] border border-[#2e2c29] rounded-lg shadow-xl whitespace-nowrap animate-in fade-in duration-100"
          >
            {hovered.text}
          </div>
        )}

        {/* Scrollable Container for Heatmap Grid */}
        <div
          className="overflow-x-auto custom-scrollbar pb-3"
          onScroll={() => setHovered(null)}
        >
          <div className="min-w-max flex gap-2.5 items-start">
            {/* Left Day Labels Column */}
            <div className="flex flex-col gap-1 text-[10px] text-[#8e8c87] w-6 shrink-0 pt-7 select-none">
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

            {/* Right: Month Labels Header & 53 Weeks Grid */}
            <div className="flex flex-col relative">
              {/* Month Labels Header - mathematically aligned to week columns */}
              <div className="relative h-6 mb-1.5 select-none">
                {gridData.monthHeaders.map((header) => {
                  const isSelected = selectedMonth === header.monthIndex
                  return (
                    <button
                      key={header.month}
                      type="button"
                      onClick={() => handleMonthClick(header.monthIndex)}
                      style={{
                        left: `${header.weekIndex * HEATMAP_COL_WIDTH}px`,
                      }}
                      className={`absolute text-xs transition-colors cursor-pointer px-1.5 py-0.5 rounded-md ${
                        isSelected
                          ? 'text-white font-bold bg-[#353330] border border-[#cc785c] shadow-xs'
                          : 'text-[#8e8c87] hover:text-white hover:bg-[#252320]'
                      }`}
                    >
                      {header.month}
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

              {/* 53 Weeks Grid */}
              <div className="flex gap-1 relative z-1 overflow-hidden rounded-md">
                {/* Traveling shimmer wave bar during loading */}
                {isLoading && (
                  <div
                    className="absolute inset-y-0 w-36 bg-gradient-to-r from-transparent via-[#cc785c]/35 to-transparent pointer-events-none animate-heatmap-shimmer-sweep z-30"
                    aria-hidden="true"
                  />
                )}

                {gridData.weeks.map((week, wIndex) => (
                  <div key={wIndex} className="flex flex-col gap-1">
                    {week.map((cell, dIndex) => {
                      if (!cell.isCurrentYear) {
                        return (
                          <div
                            key={dIndex}
                            className="w-3 h-3 pointer-events-none opacity-0"
                            aria-hidden="true"
                          />
                        )
                      }

                      if (isLoading) {
                        return (
                          <div
                            key={dIndex}
                            style={{
                              animationDelay: `${wIndex * 35 + dIndex * 15}ms`,
                            }}
                            className="w-3 h-3 rounded-[2px] bg-[#22201e] animate-heatmap-wave pointer-events-none"
                            aria-hidden="true"
                          />
                        )
                      }

                      const isSelected = activeSelected === cell.formattedDate
                      const tooltipText = `${cell.count} reminder${cell.count === 1 ? '' : 's'} on ${cell.tooltipDate}`

                      let ringClass = ''
                      if (cell.isToday && isSelected) {
                        ringClass =
                          'ring-2 ring-white border-2 border-[#d97757] z-20'
                      } else if (isSelected) {
                        ringClass = 'ring-2 ring-[#d4d1cb] z-20'
                      } else if (cell.isToday) {
                        ringClass = 'border-2 border-[#d97757] z-10'
                      }

                      const isCellInSelectedMonth =
                        selectedMonth !== null &&
                        cell.date.getMonth() === selectedMonth

                      const opacityClass =
                        selectedMonth === null || isCellInSelectedMonth
                          ? 'opacity-100'
                          : 'opacity-35 hover:opacity-100'

                      return (
                        <button
                          key={dIndex}
                          type="button"
                          onClick={() => handleDayClick(cell)}
                          onMouseEnter={(e) => {
                            if (!cardRef.current) return
                            const cardRect =
                              cardRef.current.getBoundingClientRect()
                            const cellRect =
                              e.currentTarget.getBoundingClientRect()
                            setHovered({
                              x:
                                cellRect.left -
                                cardRect.left +
                                cellRect.width / 2,
                              y: cellRect.top - cardRect.top,
                              text: tooltipText,
                            })
                          }}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={(e) => {
                            if (!cardRef.current) return
                            const cardRect =
                              cardRef.current.getBoundingClientRect()
                            const cellRect =
                              e.currentTarget.getBoundingClientRect()
                            setHovered({
                              x:
                                cellRect.left -
                                cardRect.left +
                                cellRect.width / 2,
                              y: cellRect.top - cardRect.top,
                              text: tooltipText,
                            })
                          }}
                          onBlur={() => setHovered(null)}
                          aria-label={tooltipText}
                          title={tooltipText}
                          style={{
                            backgroundColor: LEVEL_COLORS[cell.level],
                          }}
                          className={`w-3 h-3 rounded-[2px] transition-all duration-100 cursor-pointer hover:brightness-125 focus:outline-hidden ${opacityClass} ${ringClass}`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer of Heatmap Card */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-3 pt-1 text-xs text-[#8e8c87]">
          {/* Left: Today indicator and hint */}
          <button
            type="button"
            onClick={() => {
              const now = new Date()
              const todayStr = formatDate(now)
              onSelectDate?.(todayStr)
              setInternalSelected(todayStr)
              setSelectedMonth(now.getMonth())
              if (currentYear !== now.getFullYear()) {
                setYear(now.getFullYear())
              }
            }}
            className="flex items-center gap-2 text-[#8e8c87] hover:text-[#d4d1cb] transition-colors cursor-pointer"
          >
            <div
              className="w-3.5 h-3.5 rounded-[2px] border-2 border-[#d97757] bg-transparent shrink-0"
              aria-hidden="true"
            />
            <span>Today · click any day to list it</span>
          </button>

          {/* Right: Legend */}
          <div className="flex items-center gap-2 text-[#8e8c87]">
            <span>Less</span>
            <div className="flex items-center gap-1">
              {LEVEL_COLORS.map((color, idx) => (
                <div
                  key={idx}
                  className="w-3 h-3 rounded-[2px]"
                  style={{ backgroundColor: color }}
                  title={`Level ${idx}`}
                />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  )
}
