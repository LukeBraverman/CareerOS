import { useState, useMemo, useEffect } from 'react'
import { Filter, AlertCircle, Sparkles } from 'lucide-react'
import { CultureHeatmap } from '@/components/CultureHeatmap'
import { CultureDetailModal } from '@/components/CultureDetailModal'
import { RitualsSidebar } from '@/components/RitualsSidebar'
import type { Ritual } from '@/types/ritual'
import { fetchRituals } from '@/lib/ritualApi'
import {
  type CultureReminder,
  type DeadSpot,
} from '@/types/culture'
import { calculateNextDeadSpot } from '@/lib/cultureDeadSpot'
import { MONTH_NAMES } from '@/types/travel'
import type { SearchReminder } from '@/types/reminder'
import {
  fetchYearRemindersWithCache,
  getCachedYearReminders,
  removeReminderFromCache,
} from '@/lib/reminderCache'
import { parseDate } from '@/lib/date'
import { deleteReminder } from '@/lib/api'

function searchToCulture(r: SearchReminder): CultureReminder {
  const parsed = parseDate(r.date)
  const y = parsed ? parsed.getFullYear() : 2026
  const m = parsed ? String(parsed.getMonth() + 1).padStart(2, '0') : '01'
  const d = parsed ? String(parsed.getDate()).padStart(2, '0') : '01'
  const isoDate = `${y}-${m}-${d}`
  const monthIndex = parsed ? parsed.getMonth() : 0
  const isTravel =
    r.category === 'Travel' ||
    r.metadata?.tag?.toLowerCase() === 'travel'

  return {
    id: r.id,
    date: r.date,
    isoDate,
    dateDisplay: r.dateDisplay,
    time: r.time,
    icon: r.icon,
    title: r.title,
    category: isTravel ? 'Travel' : 'Culture',
    channels: r.channels,
    recipient: r.recipient,
    recurrence: r.recurrence,
    status: r.status === 'DELIVERED' ? 'DELIVERED' : 'PENDING',
    important: r.important,
    monthIndex,
    firesAt: r.firesAt,
    timeZone: r.timeZone,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    metadata: r.metadata,
  }
}

function backendToCulture(backend: SearchReminder[]): CultureReminder[] {
  return backend
    .filter(
      (r) =>
        r.category === 'Culture' ||
        r.category === 'Travel' ||
        r.metadata?.tag?.toLowerCase() === 'culture' ||
        r.metadata?.tag?.toLowerCase() === 'travel'
    )
    .map(searchToCulture)
}

export function CultureView() {
  const [currentYear, setCurrentYear] = useState<number>(() =>
    new Date().getFullYear()
  )
  const [reminders, setReminders] = useState<CultureReminder[]>(() => {
    const cached = getCachedYearReminders(new Date().getFullYear())
    return cached ? backendToCulture(cached) : []
  })
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return getCachedYearReminders(new Date().getFullYear()) === undefined
  })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    () => new Date().getMonth()
  ) // Default to current month
  const [activeDeadSpot, setActiveDeadSpot] = useState<DeadSpot | null>(null)
  const [filterCultureOnly, setFilterCultureOnly] = useState(false)
  const [selectedReminder, setSelectedReminder] =
    useState<CultureReminder | null>(null)

  // Load reminders for currentYear via shared year cache
  useEffect(() => {
    let isMounted = true
    const loadCultureReminders = async () => {
      const cached = getCachedYearReminders(currentYear)
      if (cached !== undefined) {
        setReminders(backendToCulture(cached))
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setLoadError(null)
      try {
        const yearReminders = await fetchYearRemindersWithCache(currentYear)
        if (isMounted) {
          setReminders(backendToCulture(yearReminders))
        }
      } catch (err) {
        console.error(`Failed to load culture reminders for ${currentYear}:`, err)
        if (isMounted) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to fetch reminders'
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadCultureReminders()
    return () => {
      isMounted = false
    }
  }, [currentYear])

  const [rituals, setRituals] = useState<Ritual[]>([])
  const [isRitualsLoading, setIsRitualsLoading] = useState(true)
  const [ritualsError, setRitualsError] = useState<string | null>(null)
  const [isRitualsSidebarOpen, setIsRitualsSidebarOpen] = useState(false)

  // Load rituals for culture tag on page load
  useEffect(() => {
    let isMounted = true
    const loadRituals = async () => {
      setIsRitualsLoading(true)
      setRitualsError(null)
      try {
        const data = await fetchRituals('culture')
        if (isMounted) {
          setRituals(data)
        }
      } catch (err) {
        console.error('Failed to load culture rituals:', err)
        if (isMounted) {
          setRitualsError(
            err instanceof Error ? err.message : 'Failed to load rituals'
          )
        }
      } finally {
        if (isMounted) {
          setIsRitualsLoading(false)
        }
      }
    }
    loadRituals()
    return () => {
      isMounted = false
    }
  }, [])

  const handleRitualCreated = (ritual: Ritual) => {
    setRituals((prev) => [ritual, ...prev])
  }

  const handleRitualUpdated = (updated: Ritual) => {
    setRituals((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    )
  }

  const handleRitualDeleted = (id: string) => {
    setRituals((prev) => prev.filter((r) => r.id !== id))
  }

  // Next dead spot calculation strictly for currentYear
  const nextDeadSpot = useMemo(() => {
    return calculateNextDeadSpot(reminders, currentYear, filterCultureOnly)
  }, [reminders, currentYear, filterCultureOnly])

  const handleNextDeadSpot = () => {
    if (nextDeadSpot) {
      setActiveDeadSpot(nextDeadSpot)
      setSelectedMonth(nextDeadSpot.targetMonthIndex)
    }
  }

  // Reminders for selected month
  const monthReminders = useMemo(() => {
    if (selectedMonth === null) return []
    let list = reminders.filter((r) => r.monthIndex === selectedMonth)
    if (filterCultureOnly) {
      list = list.filter((r) => r.category === 'Culture')
    }
    return list
  }, [selectedMonth, reminders, filterCultureOnly])

  const cultureCount = useMemo(() => {
    if (selectedMonth === null) return 0
    return reminders.filter(
      (r) => r.monthIndex === selectedMonth && r.category === 'Culture'
    ).length
  }, [selectedMonth, reminders])

  const travelCount = useMemo(() => {
    if (selectedMonth === null) return 0
    return reminders.filter(
      (r) => r.monthIndex === selectedMonth && r.category === 'Travel'
    ).length
  }, [selectedMonth, reminders])

  const handleUpdateReminder = (updated: CultureReminder) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    )
    setSelectedReminder(updated)
  }

  const handleDeleteReminder = async (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    setSelectedReminder(null)
    removeReminderFromCache(id)
    try {
      await deleteReminder(id)
    } catch (err) {
      console.warn('Backend delete error:', err)
    }
  }

  return (
    <div className="space-y-8">
      {/* Page Header matching 19_1.png */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Culture</h1>
          <p className="text-sm text-[#8e8c87] mt-1">
            Culture and travel reminders · Europe/London
          </p>
        </div>

        {/* Rituals Sidebar Button */}
        <button
          type="button"
          onClick={() => setIsRitualsSidebarOpen(true)}
          className="h-9 px-3.5 rounded-xl border border-[#2e2c29] bg-[#1e1d1b] hover:bg-[#252320] hover:border-[#3d3a36] text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs shrink-0 self-start"
        >
          <Sparkles className="w-4 h-4 text-[#cc785c]" />
          <span>Rituals</span>
          {rituals.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#2e2c29] text-[#d97757] border border-[#3d3a36]">
              {rituals.length}
            </span>
          )}
        </button>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Culture & Travel Heatmap */}
      <CultureHeatmap
        selectedMonth={selectedMonth}
        onSelectMonth={(m) => {
          setSelectedMonth(m)
          // If manually selecting a month, clear active dead spot if it doesn't match
          if (m !== activeDeadSpot?.targetMonthIndex) {
            setActiveDeadSpot(null)
          }
        }}
        activeDeadSpot={activeDeadSpot}
        onCycleDeadSpot={handleNextDeadSpot}
        reminders={reminders}
        isLoading={isLoading}
        filterCultureOnly={filterCultureOnly}
        year={currentYear}
        onYearChange={setCurrentYear}
      />

      {/* Month Section */}
      {selectedMonth === null ? (
        <div className="rounded-2xl border border-dashed border-[#2e2c29] bg-[#161514]/40 p-12 text-center">
          <p className="text-sm text-[#8e8c87]">
            Pick a month in the heatmap to view culture and travel events, or click &quot;Next dead spot&quot; to locate empty schedules.
          </p>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header Row matching 19_1.png and 19_2.png */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {MONTH_NAMES[selectedMonth]} {currentYear}
              </h2>
              <span className="text-sm text-[#8e8c87]">
                {cultureCount} culture · {travelCount} travel
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Filter toggle: culture only */}
              <button
                type="button"
                onClick={() => setFilterCultureOnly((prev) => !prev)}
                className={`h-9 px-3.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  filterCultureOnly
                    ? 'border-[#cc785c] bg-[#cc785c]/15 text-[#d97757]'
                    : 'border-[#2e2c29] bg-[#1e1d1b] text-[#c2bfb8] hover:text-white hover:bg-[#252320]'
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                <span>{filterCultureOnly ? 'Showing culture only' : 'Filter: culture only'}</span>
              </button>

              {/* Clear Month Button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(null)
                  setActiveDeadSpot(null)
                }}
                className="text-sm font-medium text-[#cc785c] hover:text-[#d97757] transition-colors cursor-pointer"
              >
                Clear month
              </button>
            </div>
          </div>

          {/* Reminders List */}
          <div className="space-y-2.5">
            {monthReminders.length === 0 ? (
              <div className="rounded-xl border border-[#2e2c29] bg-[#1e1d1b] p-6 text-center text-sm text-[#8e8c87]">
                No reminders found for {MONTH_NAMES[selectedMonth]} {currentYear} matching current filters.
              </div>
            ) : (
              monthReminders.map((reminder) => (
                <div
                  key={reminder.id}
                  onClick={() => setSelectedReminder(reminder)}
                  className={`rounded-xl border border-[#2e2c29] bg-[#1e1d1b] hover:border-[#383531] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors cursor-pointer ${
                    reminder.category === 'Culture'
                      ? 'border-l-4 border-l-[#cc785c]'
                      : 'border-l-4 border-l-[#38bdf8]'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    {/* Date Column */}
                    <div className="w-24 shrink-0">
                      <div className="text-sm font-semibold text-white">
                        {reminder.dateDisplay}
                      </div>
                      <div className="text-xs text-[#8e8c87] font-mono">
                        {reminder.time}
                      </div>
                    </div>

                    {/* Emoji */}
                    <div className="text-xl shrink-0" role="img">
                      {reminder.icon}
                    </div>

                    {/* Title & Subtext */}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {reminder.title}
                      </div>
                      <div className="text-xs text-[#8e8c87] mt-0.5 truncate">
                        {reminder.category} · {reminder.channels.join(', ')} ·{' '}
                        {reminder.recurrence} · to {reminder.recipient}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0 self-start sm:self-auto">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold font-mono tracking-wider uppercase ${
                        reminder.status === 'PENDING'
                          ? 'bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c]/30'
                          : 'bg-[#252320] text-[#a8a59f] border border-[#353330]'
                      }`}
                    >
                      {reminder.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Reminder Detail & Edit Modal matching 19_3.png */}
      <CultureDetailModal
        reminder={selectedReminder}
        isOpen={selectedReminder !== null}
        onClose={() => setSelectedReminder(null)}
        onUpdateReminder={handleUpdateReminder}
        onDeleteReminder={handleDeleteReminder}
      />

      {/* Rituals Sidebar */}
      <RitualsSidebar
        isOpen={isRitualsSidebarOpen}
        onClose={() => setIsRitualsSidebarOpen(false)}
        tag="culture"
        rituals={rituals}
        isLoading={isRitualsLoading}
        error={ritualsError}
        onCreated={handleRitualCreated}
        onUpdated={handleRitualUpdated}
        onDeleted={handleRitualDeleted}
      />
    </div>
  )
}
