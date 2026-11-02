import { useState, useMemo, useEffect } from 'react'
import { AlertCircle, CheckCircle2, Download, Loader2, UploadCloud } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { ReminderHeatmap } from '@/components/ReminderHeatmap'
import { SearchRemindersList } from '@/components/SearchRemindersList'
import { ExportRemindersModal } from '@/components/ExportRemindersModal'
import { formatDate, parseDate, formatDisplayDate } from '@/lib/date'
import type { SearchReminder } from '@/types/reminder'
import {
  fetchYearRemindersWithCache,
  getCachedYearReminders,
  setCachedYearReminders,
  removeReminderFromCache,
} from '@/lib/reminderCache'
import { deleteReminder, exportRemindersToNotion } from '@/lib/api'

type PresetId = 'today' | 'this-month' | 'next-30-days' | 'this-quarter' | 'this-year'

interface PresetOption {
  id: PresetId
  label: string
}

const PRESETS: PresetOption[] = [
  { id: 'today', label: 'Today' },
  { id: 'this-month', label: 'This month' },
  { id: 'next-30-days', label: 'Next 30 days' },
  { id: 'this-quarter', label: 'This quarter' },
  { id: 'this-year', label: 'This year' },
]

function getPresetDates(
  presetId: PresetId,
  targetYear: number = 2026
): { from: string; to: string } {
  const now = new Date()
  const year = targetYear
  const month = now.getMonth()

  switch (presetId) {
    case 'today': {
      const today = new Date(year, month, now.getDate())
      const formatted = formatDate(today)
      return { from: formatted, to: formatted }
    }
    case 'this-month': {
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      return { from: formatDate(firstDay), to: formatDate(lastDay) }
    }
    case 'next-30-days': {
      const start = new Date(year, month, now.getDate())
      const next30 = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
      return { from: formatDate(start), to: formatDate(next30) }
    }
    case 'this-quarter': {
      const quarter = Math.floor(month / 3)
      const firstDay = new Date(year, quarter * 3, 1)
      const lastDay = new Date(year, quarter * 3 + 3, 0)
      return { from: formatDate(firstDay), to: formatDate(lastDay) }
    }
    case 'this-year': {
      const firstDay = new Date(year, 0, 1)
      const lastDay = new Date(year, 11, 31)
      return { from: formatDate(firstDay), to: formatDate(lastDay) }
    }
  }
}

function isDateInRange(dateStr: string, fromStr: string, toStr: string): boolean {
  const d = parseDate(dateStr)
  let from = parseDate(fromStr)
  let to = parseDate(toStr)
  if (!d) return false
  if (from && to && from > to) {
    const temp = from
    from = to
    to = temp
  }
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export function SearchView() {
  const [currentYear, setCurrentYear] = useState<number>(2026)
  const [fromDate, setFromDate] = useState('01/01/2026')
  const [toDate, setToDate] = useState('31/12/2026')
  const [activePreset, setActivePreset] = useState<PresetId | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return getCachedYearReminders(2026) === undefined
  })
  const [allReminders, setAllReminders] = useState<SearchReminder[]>(() => {
    return getCachedYearReminders(2026) || []
  })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)

  // Fetch reminders for currentYear with caching
  useEffect(() => {
    let isMounted = true
    const loadReminders = async () => {
      const cached = getCachedYearReminders(currentYear)
      if (cached !== undefined) {
        setAllReminders(cached)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setLoadError(null)
      try {
        const reminders = await fetchYearRemindersWithCache(currentYear)
        if (isMounted) {
          setAllReminders(reminders)
        }
      } catch (err) {
        console.error(`Failed to load reminders for ${currentYear}:`, err)
        if (isMounted) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to fetch reminders'
          )
          setAllReminders([])
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadReminders()
    return () => {
      isMounted = false
    }
  }, [currentYear])

  const handleYearChange = (newYear: number) => {
    setCurrentYear(newYear)
    if (activePreset) {
      const { from, to } = getPresetDates(activePreset, newYear)
      setFromDate(from)
      setToDate(to)
    } else {
      const pFrom = parseDate(fromDate)
      const pTo = parseDate(toDate)
      if (pFrom && pTo) {
        const updatedFrom = new Date(newYear, pFrom.getMonth(), pFrom.getDate())
        const updatedTo = new Date(newYear, pTo.getMonth(), pTo.getDate())
        setFromDate(formatDate(updatedFrom))
        setToDate(formatDate(updatedTo))
      } else {
        setFromDate(`01/01/${newYear}`)
        setToDate(`31/12/${newYear}`)
      }
    }
    setSelectedDate(null)
  }

  const handlePresetSelect = (presetId: PresetId) => {
    setActivePreset(presetId)
    const { from, to } = getPresetDates(presetId, currentYear)
    setFromDate(from)
    setToDate(to)
    setShowList(true)
    if (presetId === 'today') {
      setSelectedDate(from)
    } else {
      setSelectedDate(null)
    }
  }

  const handleStepDay = (delta: number) => {
    let refDate: Date | null = null
    if (selectedDate) {
      refDate = parseDate(selectedDate)
    } else if (fromDate === toDate) {
      refDate = parseDate(fromDate)
    } else {
      refDate = parseDate(fromDate) || new Date()
    }

    if (!refDate) refDate = new Date()

    const newDate = new Date(refDate)
    newDate.setDate(newDate.getDate() + delta)

    const newYear = newDate.getFullYear()
    if (newYear !== currentYear) {
      setCurrentYear(newYear)
    }

    const formatted = formatDate(newDate)
    setFromDate(formatted)
    setToDate(formatted)
    setSelectedDate(formatted)
    setShowList(true)

    const todayFormatted = formatDate(new Date())
    if (formatted === todayFormatted) {
      setActivePreset('today')
    } else {
      setActivePreset(null)
    }
  }

  const handlePreviousDay = () => handleStepDay(-1)
  const handleNextDay = () => handleStepDay(1)
  const handleJumpToToday = () => handlePresetSelect('today')

  const isTodayActive = useMemo(() => {
    const todayStr = formatDate(new Date())
    if (selectedDate) return selectedDate === todayStr
    return fromDate === toDate && fromDate === todayStr
  }, [selectedDate, fromDate, toDate])

  const handleHeatmapSelectDate = (dateStr: string) => {
    setFromDate(dateStr)
    setToDate(dateStr)
    setActivePreset(null)
    setSelectedDate(dateStr)
    setShowList(true)
  }

  const handleBackToPeriod = () => {
    setSelectedDate(null)
    setShowList(false)
  }

  const handleDeleteReminder = async (id: string) => {
    const updated = allReminders.filter((r) => r.id !== id)
    setAllReminders(updated)
    setCachedYearReminders(currentYear, updated)
    removeReminderFromCache(id)

    try {
      await deleteReminder(id)
    } catch (err) {
      console.warn('Backend delete error:', err)
    }
  }

  const handleUpdateReminder = (updated: SearchReminder) => {
    const parsed = parseDate(updated.date)
    if (parsed && parsed.getFullYear() !== currentYear) {
      setAllReminders((prev) => prev.filter((r) => r.id !== updated.id))
    } else {
      setAllReminders((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      )
    }
  }

  // Determine reminders to display in list view
  const currentReminders = useMemo(() => {
    if (selectedDate) {
      return allReminders.filter((r) => r.date === selectedDate)
    }
    if (showList) {
      return allReminders.filter((r) =>
        isDateInRange(r.date, fromDate, toDate)
      )
    }
    return []
  }, [selectedDate, showList, allReminders, fromDate, toDate])

  const formattedDisplayDate = useMemo(() => {
    if (selectedDate) {
      const parsed = parseDate(selectedDate)
      return parsed ? formatDisplayDate(parsed) : selectedDate
    }
    if (fromDate === toDate) {
      const parsed = parseDate(fromDate)
      return parsed ? formatDisplayDate(parsed) : fromDate
    }
    const pFrom = parseDate(fromDate)
    const pTo = parseDate(toDate)
    const fromLabel = pFrom ? formatDisplayDate(pFrom) : fromDate
    const toLabel = pTo ? formatDisplayDate(pTo) : toDate
    return `${fromLabel} – ${toLabel}`
  }, [selectedDate, fromDate, toDate])

  const handleFromDateChange = (val: string) => {
    setFromDate(val)
    setActivePreset(null)
    const pFrom = parseDate(val)
    const pTo = parseDate(toDate)
    if (pFrom && pTo && pFrom > pTo) {
      setToDate(val)
    }
    setShowList(true)
    setSelectedDate(null)
  }

  const handleToDateChange = (val: string) => {
    setToDate(val)
    setActivePreset(null)
    const pFrom = parseDate(fromDate)
    const pTo = parseDate(val)
    if (pFrom && pTo && pTo < pFrom) {
      setFromDate(val)
    }
    setShowList(true)
    setSelectedDate(null)
  }

  const isListViewActive = showList || selectedDate !== null

  const isDefaultRange =
    fromDate === `01/01/${currentYear}` && toDate === `31/12/${currentYear}`
  const hasQuerySelected =
    !isDefaultRange || activePreset !== null || selectedDate !== null || showList

  const handleToggleView = () => {
    if (isListViewActive) {
      setShowList(false)
      setSelectedDate(null)
    } else {
      setShowList(true)
    }
  }

  const [isExportingNotion, setIsExportingNotion] = useState(false)
  const [notionExportResult, setNotionExportResult] = useState<{
    count: number
    exportedAt: string
  } | null>(null)
  const [notionExportError, setNotionExportError] = useState<string | null>(null)

  const handleExportToNotion = async () => {
    if (isExportingNotion) return
    setIsExportingNotion(true)
    setNotionExportResult(null)
    setNotionExportError(null)
    try {
      const res = await exportRemindersToNotion()
      setNotionExportResult({
        count: res.exportedCount,
        exportedAt: res.exportedAt,
      })
    } catch (err) {
      setNotionExportError(
        err instanceof Error ? err.message : 'Failed to export reminders to Notion'
      )
    } finally {
      setIsExportingNotion(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Search</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Query reminders by time period · Europe/London
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isExportingNotion}
            onClick={handleExportToNotion}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1e1d1b] border border-[#2e2c29] text-sm font-medium text-[#f0ede6] hover:bg-[#252320] hover:border-[#383531] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
          >
            {isExportingNotion ? (
              <>
                <Loader2 className="w-4 h-4 text-[#cc785c] animate-spin" />
                <span>Syncing to Notion...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4 text-[#cc785c]" />
                <span>Export to Notion</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1e1d1b] border border-[#2e2c29] text-sm font-medium text-[#f0ede6] hover:bg-[#252320] hover:border-[#383531] transition-colors cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4 text-[#cc785c]" />
            <span>Export (.md)</span>
          </button>
        </div>
      </div>

      {notionExportResult && (
        <div className="p-3.5 rounded-xl bg-[#222d22] border border-[#3e603e] text-[#c4e3c4] text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Exported{' '}
              <span className="font-semibold text-white">
                {notionExportResult.count}
              </span>{' '}
              pending {notionExportResult.count === 1 ? 'reminder' : 'reminders'} to
              your Notion <span className="font-mono text-white">Reminders</span> page.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setNotionExportResult(null)}
            className="text-[#a0c5a0] hover:text-white text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {notionExportError && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{notionExportError}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotionExportError(null)}
            className="text-red-300 hover:text-white text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Time Period Filter Card */}
      <div className="rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-6 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-4">
          TIME PERIOD
        </h2>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <DatePicker
              id="search-from"
              label="From"
              value={fromDate}
              maxDate={toDate}
              onChange={handleFromDateChange}
              placeholder="01/01/2026"
            />

            <DatePicker
              id="search-to"
              label="To"
              value={toDate}
              minDate={fromDate}
              onChange={handleToDateChange}
              placeholder="31/12/2026"
            />

            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((preset) => {
                const isSelected =
                  activePreset === preset.id ||
                  (preset.id === 'today' && isTodayActive)
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset.id)}
                    className={`h-10 px-4 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-[#353330] text-white border border-[#cc785c] shadow-xs'
                        : 'bg-[#262422] text-[#e0ded8] border border-[#353330] hover:bg-[#302e2a] hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Toggle Switch on the right, only visible when a search query is selected */}
          {hasQuerySelected && (
            <div className="flex items-center gap-3 self-end h-10 pb-0.5 ml-auto animate-in fade-in duration-150">
              <button
                type="button"
                onClick={handleToggleView}
                className="text-xs font-medium text-[#c5c2ba] hover:text-white transition-colors cursor-pointer select-none"
              >
                {isListViewActive ? 'Reminder list' : 'Heatmap'}
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={isListViewActive}
                aria-label="Toggle between heatmap and reminders list"
                onClick={handleToggleView}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  isListViewActive
                    ? 'bg-[#cc785c] border-[#b86246]'
                    : 'bg-[#282624] border-[#3d3a36]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isListViewActive ? 'translate-x-5.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content Area beneath Filter Card: Either List View or Heatmap Overview */}
      {loadError && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{loadError}</span>
        </div>
      )}

      {isListViewActive ? (
        <SearchRemindersList
          reminders={currentReminders}
          selectedDateDisplay={formattedDisplayDate}
          onBack={handleBackToPeriod}
          onDeleteReminder={handleDeleteReminder}
          onUpdateReminder={handleUpdateReminder}
          onPreviousDay={handlePreviousDay}
          onNextDay={handleNextDay}
          onToday={handleJumpToToday}
          isToday={isTodayActive}
        />
      ) : (
        <ReminderHeatmap
          year={currentYear}
          onYearChange={handleYearChange}
          reminders={allReminders}
          isLoading={isLoading}
          onSelectDate={handleHeatmapSelectDate}
          onSelectMonthRange={(from, to) => {
            setFromDate(from)
            setToDate(to)
            setActivePreset(null)
            setSelectedDate(null)
            setShowList(true)
          }}
          selectedDate={fromDate === toDate ? fromDate : undefined}
        />
      )}

      {isExportModalOpen && (
        <ExportRemindersModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          initialYear={currentYear}
        />
      )}
    </div>
  )
}
