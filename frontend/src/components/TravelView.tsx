import { useState, useMemo, useEffect } from 'react'
import { AlertCircle, Plane } from 'lucide-react'
import { TravelHeatmap } from '@/components/TravelHeatmap'
import { RitualsSidebar } from '@/components/RitualsSidebar'
import type { Ritual } from '@/types/ritual'
import { fetchRituals } from '@/lib/ritualApi'
import {
  ReminderDetailModal,
  type ModalReminder,
} from '@/components/ReminderDetailModal'
import {
  MONTH_NAMES,
  type TravelReminder,
} from '@/types/travel'
import type { SearchReminder } from '@/types/reminder'
import {
  fetchYearRemindersWithCache,
  getCachedYearReminders,
  removeReminderFromCache,
} from '@/lib/reminderCache'
import { deleteReminder } from '@/lib/api'
import { parseDate } from '@/lib/date'

function searchToTravel(r: SearchReminder): TravelReminder {
  const parsed = parseDate(r.date)
  const y = parsed ? parsed.getFullYear() : new Date().getFullYear()
  const m = parsed ? String(parsed.getMonth() + 1).padStart(2, '0') : '01'
  const d = parsed ? String(parsed.getDate()).padStart(2, '0') : '01'
  const isoDate = `${y}-${m}-${d}`
  const monthIndex = parsed ? parsed.getMonth() : 0

  return {
    id: r.id,
    date: r.date,
    isoDate,
    dateDisplay: r.dateDisplay,
    time: r.time,
    icon: r.icon,
    title: r.title,
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

function backendToTravel(backend: SearchReminder[]): TravelReminder[] {
  return backend
    .filter(
      (r) =>
        r.category === 'Travel' ||
        r.metadata?.tag?.toLowerCase() === 'travel'
    )
    .map(searchToTravel)
}

export function TravelView() {
  const [currentYear, setCurrentYear] = useState<number>(() =>
    new Date().getFullYear()
  )
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [selectedReminder, setSelectedReminder] =
    useState<TravelReminder | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [reminders, setReminders] = useState<TravelReminder[]>(() => {
    const cached = getCachedYearReminders(new Date().getFullYear())
    return cached ? backendToTravel(cached) : []
  })
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return getCachedYearReminders(new Date().getFullYear()) === undefined
  })
  const [loadError, setLoadError] = useState<string | null>(null)

  // Load reminders for currentYear via shared year cache
  useEffect(() => {
    let isMounted = true
    const loadTravelReminders = async () => {
      const cached = getCachedYearReminders(currentYear)
      if (cached !== undefined) {
        setReminders(backendToTravel(cached))
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setLoadError(null)
      try {
        const yearReminders = await fetchYearRemindersWithCache(currentYear)
        if (isMounted) {
          setReminders(backendToTravel(yearReminders))
        }
      } catch (err) {
        console.error(`Failed to load travel reminders for ${currentYear}:`, err)
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

    loadTravelReminders()
    return () => {
      isMounted = false
    }
  }, [currentYear])

  const [rituals, setRituals] = useState<Ritual[]>([])
  const [isRitualsLoading, setIsRitualsLoading] = useState(true)
  const [ritualsError, setRitualsError] = useState<string | null>(null)
  const [isRitualsSidebarOpen, setIsRitualsSidebarOpen] = useState(false)

  // Load rituals for travel tag on page load
  useEffect(() => {
    let isMounted = true
    const loadRituals = async () => {
      setIsRitualsLoading(true)
      setRitualsError(null)
      try {
        const data = await fetchRituals('travel')
        if (isMounted) {
          setRituals(data)
        }
      } catch (err) {
        console.error('Failed to load travel rituals:', err)
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

  const handleDeleteReminder = async (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    removeReminderFromCache(id)
    if (selectedReminder?.id === id) {
      setIsModalOpen(false)
      setSelectedReminder(null)
    }
    try {
      await deleteReminder(id)
    } catch (err) {
      console.warn('Backend delete error:', err)
    }
  }

  const handleUpdateReminder = (updated: ModalReminder) => {
    setReminders((prev) =>
      prev.map((r) =>
        r.id === updated.id ? ({ ...r, ...updated } as TravelReminder) : r
      )
    )
    setSelectedReminder((prev) =>
      prev && prev.id === updated.id
        ? ({ ...prev, ...updated } as TravelReminder)
        : prev
    )
  }

  const handleSelectMonth = (m: number | null) => {
    setSelectedMonth(m)
  }

  // Filter reminders for selected month
  const monthReminders = useMemo(() => {
    if (selectedMonth === null) return []
    return reminders.filter((r) => r.monthIndex === selectedMonth)
  }, [selectedMonth, reminders])

  return (
    <div className="space-y-8">
      {/* Top Header Row matching 18_1.png */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Travel
          </h1>
          <p className="text-sm text-[#8e8c87] mt-1">
            Travel-tagged reminders against UK bank holiday weekends · Europe/London
          </p>
        </div>

        {/* Rituals Sidebar Button */}
        <button
          type="button"
          onClick={() => setIsRitualsSidebarOpen(true)}
          className="h-9 px-3.5 rounded-xl border border-[#2e2c29] bg-[#1e1d1b] hover:bg-[#252320] hover:border-[#3d3a36] text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs shrink-0 self-start"
        >
          <Plane className="w-4 h-4 text-[#cc785c]" />
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

      {/* GitHub-style Heatmap */}
      <TravelHeatmap
        selectedMonth={selectedMonth}
        onSelectMonth={handleSelectMonth}
        reminders={reminders}
        isLoading={isLoading}
        year={currentYear}
        onYearChange={setCurrentYear}
      />

      {/* Underneath Heatmap: Either Placeholder card or Month Detail sections */}
      {selectedMonth === null ? (
        <div className="rounded-2xl border border-dashed border-[#2e2c29] bg-[#161514]/40 p-12 text-center">
          <p className="text-sm text-[#8e8c87]">
            Pick a month in the heatmap to see its travel reminders.
          </p>
        </div>
      ) : (
        /* Month Selected View */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Month Title & Clear Month Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {MONTH_NAMES[selectedMonth]} {currentYear}
              </h2>
              <span className="text-sm text-[#8e8c87]">
                {monthReminders.length} travel reminder
                {monthReminders.length === 1 ? '' : 's'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleSelectMonth(null)}
              className="text-sm font-medium text-[#cc785c] hover:text-[#d97757] transition-colors cursor-pointer"
            >
              Clear month
            </button>
          </div>

          {/* Month Reminders List matching 18_2.png */}
          <div className="space-y-2.5">
            {monthReminders.length === 0 ? (
              <div className="rounded-xl border border-[#2e2c29] bg-[#1e1d1b] p-6 text-center text-sm text-[#8e8c87]">
                No travel reminders scheduled for {MONTH_NAMES[selectedMonth]} {currentYear}.
              </div>
            ) : (
              monthReminders.map((reminder) => (
                <div
                  key={reminder.id}
                  onClick={() => {
                    setSelectedReminder(reminder)
                    setIsModalOpen(true)
                  }}
                  className="rounded-xl border border-[#2e2c29] bg-[#1e1d1b] hover:border-[#383531] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors cursor-pointer"
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

                    {/* Airplane Emoji Icon */}
                    <div className="text-xl shrink-0">
                      {reminder.icon || '✈️'}
                    </div>

                    {/* Title & Delivery Subtext */}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {reminder.title}
                      </div>
                      <div className="text-xs text-[#8e8c87] mt-0.5 truncate">
                        {reminder.channels.join(', ')} · {reminder.recurrence} · to{' '}
                        {reminder.recipient}
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

      {/* Reminder Detail & Edit Modal */}
      <ReminderDetailModal
        reminder={selectedReminder}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedReminder(null)
        }}
        onDelete={handleDeleteReminder}
        onUpdate={handleUpdateReminder}
      />

      {/* Rituals Sidebar */}
      <RitualsSidebar
        isOpen={isRitualsSidebarOpen}
        onClose={() => setIsRitualsSidebarOpen(false)}
        tag="travel"
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
