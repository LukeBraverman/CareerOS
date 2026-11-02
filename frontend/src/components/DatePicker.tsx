import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { formatDate, parseDate } from '@/lib/date'

interface DatePickerProps {
  id: string
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  placement?: 'auto' | 'top' | 'bottom'
  onTodayClick?: () => void
  disablePast?: boolean
  minDate?: string
  maxDate?: string
}

const MONTH_NAMES = [
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

const DAYS_OF_WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

interface CalendarCell {
  day: number
  month: number
  year: number
  isCurrentMonth: boolean
}

export function DatePicker({
  id,
  label,
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  className,
  inputClassName,
  placement = 'auto',
  onTodayClick,
  disablePast = false,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [opensUp, setOpensUp] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const [viewYear, setViewYear] = useState<number>(() => {
    const parsed = parseDate(value)
    return parsed ? parsed.getFullYear() : now.getFullYear()
  })
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const parsed = parseDate(value)
    return parsed ? parsed.getMonth() : now.getMonth()
  })

  // Synchronize view month/year with input value and determine placement when opened
  const openPicker = useCallback(() => {
    const parsed = parseDate(value)
    if (parsed) {
      setViewYear(parsed.getFullYear())
      setViewMonth(parsed.getMonth())
    } else {
      const today = new Date()
      setViewYear(today.getFullYear())
      setViewMonth(today.getMonth())
    }

    if (placement === 'top') {
      setOpensUp(true)
    } else if (placement === 'bottom') {
      setOpensUp(false)
    } else if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      // Calendar popover is approx 320px tall
      if (spaceBelow < 320 && spaceAbove > spaceBelow) {
        setOpensUp(true)
      } else {
        setOpensUp(false)
      }
    }

    setIsOpen(true)
  }, [value, placement])

  const togglePicker = () => {
    if (isOpen) {
      setIsOpen(false)
    } else {
      openPicker()
    }
  }

  // Handle clicking outside and Escape key
  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Navigation handlers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const handlePrevYear = () => {
    setViewYear((y) => y - 1)
  }

  const handleNextYear = () => {
    setViewYear((y) => y + 1)
  }

  const selectedDate = parseDate(value)
  const today = new Date()

  const isDateDisabled = (year: number, month: number, day: number) => {
    const cellDate = new Date(year, month, day, 0, 0, 0, 0)
    if (disablePast) {
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
      if (cellDate.getTime() < todayStart.getTime()) {
        return true
      }
    }
    if (minDate) {
      const min = parseDate(minDate)
      if (min) {
        const minStart = new Date(min.getFullYear(), min.getMonth(), min.getDate(), 0, 0, 0, 0)
        if (cellDate.getTime() < minStart.getTime()) {
          return true
        }
      }
    }
    if (maxDate) {
      const max = parseDate(maxDate)
      if (max) {
        const maxStart = new Date(max.getFullYear(), max.getMonth(), max.getDate(), 0, 0, 0, 0)
        if (cellDate.getTime() > maxStart.getTime()) {
          return true
        }
      }
    }
    return false
  }

  // Date selection
  const handleSelectDate = (year: number, month: number, day: number) => {
    if (isDateDisabled(year, month, day)) {
      return
    }
    const selected = new Date(year, month, day)
    onChange(formatDate(selected))
    setIsOpen(false)
  }

  // Calculate calendar grid cells
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7 // Monday = 0
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()

  const cells: CalendarCell[] = []

  // Previous month trailing days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({
      day: daysInPrevMonth - i,
      month: prevMonth,
      year: prevYear,
      isCurrentMonth: false,
    })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      month: viewMonth,
      year: viewYear,
      isCurrentMonth: true,
    })
  }

  // Next month leading days to complete full weeks
  const remainingCells = (7 - (cells.length % 7)) % 7
  for (let d = 1; d <= remainingCells; d++) {
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear
    cells.push({
      day: d,
      month: nextMonth,
      year: nextYear,
      isCurrentMonth: false,
    })
  }

  const isSelected = (cell: CalendarCell) => {
    if (!selectedDate) return false
    return (
      selectedDate.getDate() === cell.day &&
      selectedDate.getMonth() === cell.month &&
      selectedDate.getFullYear() === cell.year
    )
  }

  const isToday = (cell: CalendarCell) => {
    return (
      today.getDate() === cell.day &&
      today.getMonth() === cell.month &&
      today.getFullYear() === cell.year
    )
  }

  return (
    <div className={`relative ${className || ''}`} ref={containerRef}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs text-neutral-400 mb-1.5 font-medium"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={openPicker}
          placeholder={placeholder}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className={
            inputClassName
              ? `${inputClassName} pr-9 ${isOpen ? 'border-[#cc785c]!' : ''}`
              : `h-10 w-36 sm:w-40 pl-3.5 pr-9 rounded-xl border bg-[#161514] text-sm text-white font-mono placeholder:text-neutral-500 focus:outline-hidden transition-colors cursor-pointer ${
                  isOpen ? 'border-[#cc785c]' : 'border-[#353330] focus:border-[#cc785c]'
                }`
          }
        />
        <button
          type="button"
          onClick={togglePicker}
          tabIndex={-1}
          aria-label={`Open ${label || 'date'} picker`}
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer p-0.5 ${
            isOpen ? 'text-[#cc785c]' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-label={`${label || 'Date'} selection calendar`}
          className={`absolute left-0 z-50 w-[272px] rounded-2xl border border-[#2e2c29] bg-[#1b1a18] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100 select-none ${
            opensUp ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {/* Calendar Header with Navigation */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handlePrevYear}
                title="Previous year"
                aria-label="Previous year"
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-[#252320] transition-colors cursor-pointer"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                title="Previous month"
                aria-label="Previous month"
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-[#252320] transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <span className="text-xs font-semibold text-white tracking-wide">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleNextMonth}
                title="Next month"
                aria-label="Next month"
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-[#252320] transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNextYear}
                title="Next year"
                aria-label="Next year"
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-[#252320] transition-colors cursor-pointer"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {DAYS_OF_WEEK.map((d) => (
              <span
                key={d}
                className="text-[11px] font-semibold text-neutral-500 py-0.5"
              >
                {d}
              </span>
            ))}
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {cells.map((cell) => {
              const selected = isSelected(cell)
              const todayCell = isToday(cell)
              const disabled = isDateDisabled(cell.year, cell.month, cell.day)

              let buttonClass = 'text-[#e0ded8] hover:bg-[#2e2c29] hover:text-white cursor-pointer'
              if (disabled) {
                buttonClass = 'opacity-25 text-neutral-600 cursor-not-allowed pointer-events-none'
              } else if (selected) {
                buttonClass = 'bg-[#cc785c] text-white font-semibold shadow-xs ring-1 ring-[#cc785c] cursor-pointer'
              } else if (todayCell) {
                buttonClass = 'border border-[#cc785c]/60 text-white font-semibold hover:bg-[#2e2c29] cursor-pointer'
              } else if (!cell.isCurrentMonth) {
                buttonClass = 'text-neutral-600 hover:text-neutral-400 hover:bg-[#252320] cursor-pointer'
              }

              return (
                <button
                  key={`${cell.year}-${cell.month}-${cell.day}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectDate(cell.year, cell.month, cell.day)}
                  aria-label={`${cell.day} ${MONTH_NAMES[cell.month]} ${cell.year}`}
                  aria-disabled={disabled}
                  className={`h-8 w-8 mx-auto rounded-lg flex items-center justify-center text-xs font-mono transition-all duration-100 ${buttonClass}`}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {/* Footer Quick Actions */}
          <div className="flex items-center justify-between border-t border-[#2e2c29] pt-2 mt-2 px-1">
            {(() => {
              const todayDisabled = isDateDisabled(
                today.getFullYear(),
                today.getMonth(),
                today.getDate()
              )
              return (
                <button
                  type="button"
                  disabled={todayDisabled}
                  onClick={() => {
                    if (todayDisabled) return
                    onChange(formatDate(new Date()))
                    if (onTodayClick) {
                      onTodayClick()
                    }
                    setIsOpen(false)
                  }}
                  className={`text-xs font-medium transition-colors ${
                    todayDisabled
                      ? 'opacity-30 text-neutral-500 cursor-not-allowed pointer-events-none'
                      : 'text-[#cc785c] hover:text-[#e08b6f] cursor-pointer'
                  }`}
                >
                  Today
                </button>
              )
            })()}
            <button
              type="button"
              onClick={() => {
                onChange('')
                setIsOpen(false)
              }}
              className="text-xs font-medium text-neutral-400 hover:text-neutral-300 transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
