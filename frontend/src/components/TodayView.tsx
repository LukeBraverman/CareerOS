import { useState, useEffect, useMemo } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import {
  type TodayReminder,
} from '@/types/reminder'
import { ReminderDetailModal } from './ReminderDetailModal'
import { deleteReminder } from '@/lib/api'
import {
  getTodayRemindersWithCache,
  removeReminderFromCache,
} from '@/lib/reminderCache'
import { formatDate } from '@/lib/date'

export interface TodayViewProps {
  reminders?: TodayReminder[]
  onRemindersChange?: React.Dispatch<React.SetStateAction<TodayReminder[]>>
  onRefresh?: () => void
  isRefreshing?: boolean
  lastSyncedAt?: string | null
}

export function TodayView({
  reminders: externalReminders,
  onRemindersChange,
  onRefresh,
  isRefreshing = false,
  lastSyncedAt,
}: TodayViewProps = {}) {
  const [internalReminders, setInternalReminders] = useState<TodayReminder[]>([])
  const reminders = externalReminders ?? internalReminders
  const setReminders = onRemindersChange ?? setInternalReminders
  const [selectedReminder, setSelectedReminder] = useState<TodayReminder | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showImportantOnly, setShowImportantOnly] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Fetch today's reminders from backend/cache on mount
  useEffect(() => {
    let isMounted = true
    const loadTodayReminders = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const data = await getTodayRemindersWithCache()
        if (isMounted) {
          setReminders(data)
        }
      } catch (err) {
        console.error('Failed to load today reminders from backend:', err)
        if (isMounted) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to fetch today reminders'
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadTodayReminders()
    return () => {
      isMounted = false
    }
  }, [setReminders])

  const formattedTodayDate = useMemo(() => {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/London',
    }
    return `${new Intl.DateTimeFormat('en-GB', options).format(now)} · Europe/London`
  }, [])

  const handleCardClick = (reminder: TodayReminder) => {
    setSelectedReminder(reminder)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedReminder(null)
  }

  const handleDeleteReminder = async (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    removeReminderFromCache(id)
    if (selectedReminder?.id === id) {
      handleCloseModal()
    }
    try {
      await deleteReminder(id)
    } catch (err) {
      console.warn('Backend delete error:', err)
    }
  }

  const handleUpdateReminder = (updated: TodayReminder) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    )
    setSelectedReminder(updated)
  }

  const todayFormatted = useMemo(() => formatDate(new Date()), [])

  const todayReminders = useMemo(() => {
    return reminders.filter((r) => {
      if (r.date) {
        return r.date === todayFormatted
      }
      return true
    })
  }, [reminders, todayFormatted])

  const filteredReminders = showImportantOnly
    ? todayReminders.filter((r) => r.important)
    : todayReminders

  const pendingReminders = filteredReminders.filter((r) => r.status === 'PENDING')
  const deliveredReminders = filteredReminders.filter((r) => r.status !== 'PENDING')

  const pendingCount = pendingReminders.length
  const deliveredCount = deliveredReminders.length

  const pendingCounterText = `${pendingCount} ${pendingCount === 1 ? 'reminder' : 'reminders'} pending`
  const deliveredCounterText = `${deliveredCount} sent`

  return (
    <div className="w-full max-w-4xl mx-auto space-y-7">
      {/* Page Header */}
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Today
          </h1>
          <div className="flex items-center gap-2.5">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing || isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs border bg-[#262422] border-[#383531] text-[#a8a59f] hover:text-white hover:bg-[#302e2a] transition-all duration-150 cursor-pointer disabled:opacity-50"
                title={
                  lastSyncedAt
                    ? `Last synced at ${lastSyncedAt} (Auto-refreshes every 30s)`
                    : 'Refresh today’s reminders & check notifications'
                }
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isRefreshing || isLoading ? 'animate-spin text-[#cc785c]' : ''
                  }`}
                />
                <span>{isRefreshing ? 'Syncing…' : 'Refresh'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowImportantOnly((prev) => !prev)}
              aria-pressed={showImportantOnly}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs border transition-all duration-150 cursor-pointer ${
                showImportantOnly
                  ? 'bg-[#cc785c]/15 border-[#cc785c] text-[#d97757] font-semibold'
                  : 'bg-[#262422] border-[#383531] text-[#a8a59f] hover:text-white hover:bg-[#302e2a]'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Important only</span>
            </button>
            {isLoading && !isRefreshing && (
              <div className="flex items-center gap-2 text-xs text-[#cc785c] animate-in fade-in duration-200">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#cc785c] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#cc785c]"></span>
                </span>
                <span>Syncing today's reminders...</span>
              </div>
            )}
          </div>
        </div>
        <p className="text-sm text-[#8e8c87] mt-1 font-normal">
          {formattedTodayDate}
        </p>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{loadError}</span>
        </div>
      )}

      {filteredReminders.length > 0 ? (
        <div className="max-h-[600px] overflow-y-auto pr-2 py-1 space-y-7 custom-scrollbar">
          {/* Section 1: Coming up today (Pending reminders) */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-3 pt-1">
              <h2 className="text-base sm:text-lg font-semibold text-white">
                Coming up today
              </h2>
              <span className="text-sm text-[#8e8c87]">
                {pendingCounterText}
              </span>
            </div>

            {pendingReminders.length > 0 ? (
              <div className="space-y-3">
                {pendingReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    onClick={() => handleCardClick(reminder)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleCardClick(reminder)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="w-full bg-[#1b1a18] hover:bg-[#201f1c] border border-[#2e2c29] hover:border-[#383531] rounded-2xl px-5 sm:px-6 py-4.5 sm:py-5 flex items-center justify-between gap-4 transition-all duration-150 cursor-pointer text-left shadow-xs focus:outline-hidden focus:border-[#cc785c]/60"
                  >
                    {/* Left Group: Time + Icon + Text info */}
                    <div className="flex items-center min-w-0">
                      <span className="w-14 sm:w-16 shrink-0 text-base sm:text-lg font-bold text-white tracking-tight">
                        {reminder.time}
                      </span>

                      <span
                        className="text-2xl sm:text-[26px] mr-3.5 sm:mr-5 select-none shrink-0"
                        aria-hidden="true"
                      >
                        {reminder.icon}
                      </span>

                      <div className="min-w-0 pr-2">
                        <h3 className="text-sm sm:text-base font-medium text-white truncate">
                          {reminder.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-[#8e8c87] mt-0.5 truncate">
                          {reminder.channels.join(', ')} · to {reminder.recipient}
                        </p>
                      </div>
                    </div>

                    {/* Right Group: Badges */}
                    <div className="flex items-center gap-2 shrink-0">
                      {reminder.important && (
                        <span className="px-2.5 sm:px-3 py-1 rounded-md text-xs font-mono font-semibold uppercase tracking-wider bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c]/40">
                          IMPORTANT
                        </span>
                      )}
                      <span className="px-2.5 sm:px-3 py-1 rounded-md text-xs font-mono font-semibold uppercase tracking-wider bg-[#262422] text-[#d4d1cb] border border-[#383531]">
                        {reminder.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 px-5 rounded-2xl border border-[#2e2c29]/70 bg-[#1b1a18]/40 text-center">
                <p className="text-sm text-[#8e8c87]">No pending reminders for today</p>
              </div>
            )}
          </div>

          {/* Section 2: Delivered reminders */}
          <div className="space-y-3.5 pt-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base sm:text-lg font-semibold text-[#8e8c87]">
                Delivered
              </h2>
              <span className="text-sm text-[#8e8c87]">
                {deliveredCounterText}
              </span>
            </div>

            {deliveredReminders.length > 0 ? (
              <div className="space-y-3">
                {deliveredReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    onClick={() => handleCardClick(reminder)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleCardClick(reminder)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="w-full bg-[#1b1a18]/60 hover:bg-[#1f1e1b] border border-[#2e2c29]/80 hover:border-[#383531] rounded-2xl px-5 sm:px-6 py-4.5 sm:py-5 flex items-center justify-between gap-4 transition-all duration-150 cursor-pointer text-left shadow-xs focus:outline-hidden focus:border-[#cc785c]/60"
                  >
                    {/* Left Group: Time + Icon + Text info */}
                    <div className="flex items-center min-w-0">
                      <span className="w-14 sm:w-16 shrink-0 text-base sm:text-lg font-bold text-[#a8a59f] tracking-tight">
                        {reminder.time}
                      </span>

                      <span
                        className="text-2xl sm:text-[26px] mr-3.5 sm:mr-5 select-none shrink-0 opacity-85"
                        aria-hidden="true"
                      >
                        {reminder.icon}
                      </span>

                      <div className="min-w-0 pr-2">
                        <h3 className="text-sm sm:text-base font-medium text-white/90 truncate">
                          {reminder.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-[#8e8c87] mt-0.5 truncate">
                          {reminder.channels.join(', ')} · to {reminder.recipient}
                        </p>
                      </div>
                    </div>

                    {/* Right Group: Badges */}
                    <div className="flex items-center gap-2 shrink-0">
                      {reminder.important && (
                        <span className="px-2.5 sm:px-3 py-1 rounded-md text-xs font-mono font-semibold uppercase tracking-wider bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c]/40">
                          IMPORTANT
                        </span>
                      )}
                      <span className="px-2.5 sm:px-3 py-1 rounded-md text-xs font-mono font-semibold uppercase tracking-wider bg-[#22201e] text-[#8e8c87] border border-[#2e2c29]">
                        {reminder.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 px-5 rounded-2xl border border-[#2e2c29]/70 bg-[#1b1a18]/40 text-center">
                <p className="text-sm text-[#8e8c87]">No delivered reminders yet today</p>
              </div>
            )}
          </div>
        </div>
      ) : showImportantOnly && reminders.length > 0 ? (
        <div className="p-10 text-center rounded-2xl border border-dashed border-[#2e2c29] bg-[#1b1a18]/40 space-y-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#cc785c]/10 text-[#d97757] mb-1">
            <AlertCircle className="w-5 h-5" />
          </div>
          <p className="text-base text-white font-medium">
            No important reminders scheduled for today
          </p>
          <p className="text-xs text-[#8e8c87]">
            None of your reminders for today are marked as important.
          </p>
          <button
            type="button"
            onClick={() => setShowImportantOnly(false)}
            className="mt-2 px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#cc785c] hover:bg-[#d97757] transition-colors cursor-pointer"
          >
            Show all reminders
          </button>
        </div>
      ) : (
        <div className="p-10 text-center rounded-2xl border border-dashed border-[#2e2c29] bg-[#1b1a18]/40 space-y-3">
          <p className="text-base text-white font-medium">
            No reminders scheduled for today
          </p>
          <p className="text-xs text-[#8e8c87]">
            All reminders for today have been completed or cleared.
          </p>
        </div>
      )}

      {/* Detail Modal */}
      <ReminderDetailModal
        reminder={selectedReminder}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onDelete={handleDeleteReminder}
        onUpdate={(updated) => handleUpdateReminder(updated as TodayReminder)}
      />
    </div>
  )
}
