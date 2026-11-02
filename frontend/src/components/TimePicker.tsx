import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Clock } from 'lucide-react'
import { getLondonTime, parseDate } from '@/lib/date'

export interface TimePickerProps {
  id?: string
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  placement?: 'auto' | 'top' | 'bottom'
  selectedDate?: string // DD/MM/YYYY
  disablePast?: boolean
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const PRESETS = [
  { label: '09:00', time: '09:00' },
  { label: '12:00', time: '12:00' },
  { label: '15:00', time: '15:00' },
  { label: '18:00', time: '18:00' },
  { label: '21:00', time: '21:00' },
]

export function TimePicker({
  id,
  label,
  value,
  onChange,
  placeholder = '09:00',
  className = '',
  inputClassName = '',
  placement = 'auto',
  selectedDate,
  disablePast = false,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [opensUp, setOpensUp] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hoursColRef = useRef<HTMLDivElement>(null)
  const minutesColRef = useRef<HTMLDivElement>(null)

  // Determine if selected date is today or past
  const isSelectedDateToday = useMemo(() => {
    if (!selectedDate) return false
    const parsed = parseDate(selectedDate)
    if (!parsed) return false
    const today = new Date()
    return (
      parsed.getDate() === today.getDate() &&
      parsed.getMonth() === today.getMonth() &&
      parsed.getFullYear() === today.getFullYear()
    )
  }, [selectedDate])

  const isSelectedDatePast = useMemo(() => {
    if (!selectedDate) return false
    const parsed = parseDate(selectedDate)
    if (!parsed) return false
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const selectedStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    return selectedStart.getTime() < todayStart.getTime()
  }, [selectedDate])

  const londonNow = getLondonTime()
  const [currentLondonHour, currentLondonMinute] = useMemo(() => {
    const parts = londonNow.split(':')
    return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0]
  }, [londonNow])

  const isHourDisabled = useCallback(
    (h: string) => {
      if (!disablePast) return false
      if (isSelectedDatePast) return true
      if (!isSelectedDateToday) return false
      const hourNum = parseInt(h, 10)
      return hourNum < currentLondonHour
    },
    [disablePast, isSelectedDatePast, isSelectedDateToday, currentLondonHour]
  )

  const isMinuteDisabled = useCallback(
    (m: string) => {
      if (!disablePast) return false
      if (isSelectedDatePast) return true
      if (!isSelectedDateToday) return false
      const parts = value.trim().split(':')
      const activeHour = parts[0] ? parseInt(parts[0], 10) || 0 : currentLondonHour
      if (activeHour < currentLondonHour) return true
      if (activeHour === currentLondonHour) {
        const minNum = parseInt(m, 10)
        return minNum < currentLondonMinute
      }
      return false
    },
    [disablePast, isSelectedDatePast, isSelectedDateToday, value, currentLondonHour, currentLondonMinute]
  )

  const isPresetDisabled = useCallback(
    (presetTime: string) => {
      if (!disablePast) return false
      if (isSelectedDatePast) return true
      if (!isSelectedDateToday) return false
      return presetTime < londonNow
    },
    [disablePast, isSelectedDatePast, isSelectedDateToday, londonNow]
  )

  // Parse current hour and minute from value (defaulting to 09 and 00)
  const [selectedHour, selectedMinute] = useMemo(() => {
    const parts = value.trim().split(':')
    const h = parts[0] ? parts[0].padStart(2, '0') : '09'
    const m = parts[1] ? parts[1].padStart(2, '0') : '00'
    return [h, m]
  }, [value])

  const openPicker = useCallback(() => {
    if (placement === 'top') {
      setOpensUp(true)
    } else if (placement === 'bottom') {
      setOpensUp(false)
    } else if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      // Time picker popover is approx 280px tall
      if (spaceBelow < 280 && spaceAbove > spaceBelow) {
        setOpensUp(true)
      } else {
        setOpensUp(false)
      }
    }
    setIsOpen(true)
  }, [placement])

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

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Scroll active hour and minute into view when opened
  useEffect(() => {
    if (!isOpen) return

    const scrollSelected = () => {
      if (hoursColRef.current) {
        const activeHourEl = hoursColRef.current.querySelector('[data-selected="true"]')
        if (activeHourEl) {
          activeHourEl.scrollIntoView({ block: 'nearest' })
        }
      }
      if (minutesColRef.current) {
        const activeMinuteEl = minutesColRef.current.querySelector('[data-selected="true"]')
        if (activeMinuteEl) {
          activeMinuteEl.scrollIntoView({ block: 'nearest' })
        }
      }
    }

    const timer = setTimeout(scrollSelected, 50)
    return () => clearTimeout(timer)
  }, [isOpen, selectedHour, selectedMinute])

  const handleHourSelect = (h: string) => {
    if (isHourDisabled(h)) return
    onChange(`${h}:${selectedMinute}`)
  }

  const handleMinuteSelect = (m: string) => {
    if (isMinuteDisabled(m)) return
    onChange(`${selectedHour}:${m}`)
  }

  const handleNowClick = () => {
    const londonNow = getLondonTime()
    onChange(londonNow)
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-[#8e8c87] mb-1.5"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
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
              : `h-10 w-full pl-3.5 pr-9 rounded-xl border bg-[#161514] text-sm text-white font-mono placeholder:text-neutral-500 focus:outline-hidden transition-colors cursor-pointer ${
                  isOpen ? 'border-[#cc785c]' : 'border-[#353330] focus:border-[#cc785c]'
                }`
          }
        />
        <button
          type="button"
          onClick={togglePicker}
          tabIndex={-1}
          aria-label={`Open ${label || 'time'} picker`}
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer p-0.5 ${
            isOpen ? 'text-[#cc785c]' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Clock className="h-4 w-4" />
        </button>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-label={`${label || 'Time'} selection`}
          className={`absolute left-0 z-50 w-[240px] rounded-2xl border border-[#2e2c29] bg-[#1b1a18] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100 select-none ${
            opensUp ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#2e2c29]">
            <span className="text-xs font-semibold text-white tracking-wide">
              Time
            </span>
            <button
              type="button"
              onClick={handleNowClick}
              className="text-[11px] font-medium text-[#cc785c] hover:text-[#e08b6f] transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Current</span>
            </button>
          </div>

          {/* Quick Preset Pills */}
          <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-[#2e2c29] overflow-x-auto scrollbar-none">
            {PRESETS.map((p) => {
              const isSelected = value === p.time
              const disabled = isPresetDisabled(p.time)
              return (
                <button
                  key={p.time}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return
                    onChange(p.time)
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded-md font-mono transition-colors shrink-0 border ${
                    disabled
                      ? 'opacity-25 text-neutral-600 border-[#252320] cursor-not-allowed pointer-events-none'
                      : isSelected
                        ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold cursor-pointer'
                        : 'bg-[#22201e] border-[#2e2c29] text-[#a8a59f] hover:text-white hover:bg-[#2a2825] cursor-pointer'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Hours and Minutes Dual Columns */}
          <div className="grid grid-cols-2 gap-2 text-center">
            {/* Hours Column */}
            <div>
              <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                Hour
              </div>
              <div
                ref={hoursColRef}
                className="h-36 overflow-y-auto pr-1 space-y-1 scrollbar-thin scrollbar-thumb-[#2e2c29] scrollbar-track-transparent"
              >
                {HOURS.map((h) => {
                  const isSelected = h === selectedHour
                  const disabled = isHourDisabled(h)
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={disabled}
                      data-selected={isSelected}
                      onClick={() => handleHourSelect(h)}
                      className={`w-full h-7 rounded-lg text-xs font-mono transition-colors ${
                        disabled
                          ? 'opacity-25 text-neutral-600 cursor-not-allowed pointer-events-none'
                          : isSelected
                            ? 'bg-[#cc785c] text-white font-semibold shadow-xs cursor-pointer'
                            : 'text-[#c2bfb8] hover:bg-[#252320] hover:text-white cursor-pointer'
                      }`}
                    >
                      {h}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Minutes Column */}
            <div>
              <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                Min
              </div>
              <div
                ref={minutesColRef}
                className="h-36 overflow-y-auto pr-1 space-y-1 scrollbar-thin scrollbar-thumb-[#2e2c29] scrollbar-track-transparent"
              >
                {MINUTES.map((m) => {
                  const isSelected = m === selectedMinute
                  const disabled = isMinuteDisabled(m)
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={disabled}
                      data-selected={isSelected}
                      onClick={() => handleMinuteSelect(m)}
                      className={`w-full h-7 rounded-lg text-xs font-mono transition-colors ${
                        disabled
                          ? 'opacity-25 text-neutral-600 cursor-not-allowed pointer-events-none'
                          : isSelected
                            ? 'bg-[#cc785c] text-white font-semibold shadow-xs cursor-pointer'
                            : 'text-[#c2bfb8] hover:bg-[#252320] hover:text-white cursor-pointer'
                      }`}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[#2e2c29] pt-2 mt-2">
            <button
              type="button"
              onClick={handleNowClick}
              className="text-xs font-medium text-[#cc785c] hover:text-[#e08b6f] transition-colors cursor-pointer"
            >
              Now
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 rounded-lg bg-[#2e2c29] hover:bg-[#383531] text-xs font-medium text-white transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
