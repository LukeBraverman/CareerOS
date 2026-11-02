import { useState, useMemo } from 'react'
import {
  Search,
  ChevronsUpDown,
  Star,
  Circle,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type {
  SearchReminder,
  ReminderCategory,
  ReminderStatus,
} from '@/types/reminder'
import { parseDate } from '@/lib/date'
import { ReminderDetailModal } from './ReminderDetailModal'

function getReminderTimestamp(r: SearchReminder): number {
  const d = parseDate(r.date)
  if (!d) return 0
  const [h = 0, m = 0] = (r.time || '00:00')
    .split(':')
    .map((val) => parseInt(val, 10) || 0)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0).getTime()
}

interface SearchRemindersListProps {
  reminders: SearchReminder[]
  selectedDateDisplay: string
  onBack: () => void
  onDeleteReminder: (id: string) => void
  onUpdateReminder?: (updated: SearchReminder) => void
  onPreviousDay?: () => void
  onNextDay?: () => void
  onToday?: () => void
  isToday?: boolean
}

const CATEGORIES: ReminderCategory[] = ['Travel', 'Culture']

export function SearchRemindersList({
  reminders,
  selectedDateDisplay,
  onBack,
  onDeleteReminder,
  onUpdateReminder,
  onPreviousDay,
  onNextDay,
  onToday,
  isToday,
}: SearchRemindersListProps) {
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRecurrence, setSelectedRecurrence] = useState('ALL')
  const [selectedRecipient, setSelectedRecipient] = useState('ALL')
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState('ALL')
  const [sortBy, setSortBy] = useState<'soonest' | 'latest'>('soonest')
  const [filterImportant, setFilterImportant] = useState(false)
  const [filterPending, setFilterPending] = useState(false)
  const [selectedCategory, setSelectedCategory] =
    useState<ReminderCategory | null>(null)

  // Detail Modal State
  const [selectedReminder, setSelectedReminder] =
    useState<SearchReminder | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Unique list of recipients for the dropdown
  const recipientOptions = useMemo(() => {
    const set = new Set<string>()
    reminders.forEach((r) => {
      if (r.recipient) set.add(r.recipient)
    })
    return Array.from(set)
  }, [reminders])

  // Filtered and Sorted Reminders
  const filteredReminders = useMemo(() => {
    return reminders
      .filter((reminder) => {
        // Search text filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const matchesTitle = reminder.title.toLowerCase().includes(q)
          const matchesRecipient = reminder.recipient.toLowerCase().includes(q)
          const matchesCategory = reminder.category.toLowerCase().includes(q)
          const matchesChannels = reminder.channels.some((c) =>
            c.toLowerCase().includes(q)
          )
          if (
            !matchesTitle &&
            !matchesRecipient &&
            !matchesCategory &&
            !matchesChannels
          ) {
            return false
          }
        }

        // Recurrence filter
        if (selectedRecurrence !== 'ALL') {
          if (
            reminder.recurrence.toLowerCase() !==
            selectedRecurrence.toLowerCase()
          ) {
            return false
          }
        }

        // Recipient filter
        if (selectedRecipient !== 'ALL') {
          if (
            reminder.recipient.toLowerCase() !==
            selectedRecipient.toLowerCase()
          ) {
            return false
          }
        }

        // Time of day filter
        if (selectedTimeOfDay !== 'ALL') {
          const hour = parseInt(reminder.time.split(':')[0], 10)
          if (selectedTimeOfDay === 'morning' && !(hour >= 6 && hour < 12)) {
            return false
          }
          if (selectedTimeOfDay === 'afternoon' && !(hour >= 12 && hour < 18)) {
            return false
          }
          if (selectedTimeOfDay === 'evening' && !(hour >= 18 && hour < 24)) {
            return false
          }
          if (selectedTimeOfDay === 'night' && !(hour >= 0 && hour < 6)) {
            return false
          }
        }

        // Important toggle filter
        if (filterImportant && !reminder.important) {
          return false
        }

        // Pending toggle filter
        if (filterPending && reminder.status !== 'PENDING') {
          return false
        }

        // Category filter
        if (selectedCategory && reminder.category !== selectedCategory) {
          return false
        }

        return true
      })
      .sort((a, b) => {
        const tsA = getReminderTimestamp(a)
        const tsB = getReminderTimestamp(b)
        if (tsA !== tsB) {
          return sortBy === 'soonest' ? tsA - tsB : tsB - tsA
        }
        return a.title.localeCompare(b.title)
      })
  }, [
    reminders,
    searchQuery,
    selectedRecurrence,
    selectedRecipient,
    selectedTimeOfDay,
    filterImportant,
    filterPending,
    selectedCategory,
    sortBy,
  ])

  const handleCardClick = (reminder: SearchReminder) => {
    setSelectedReminder(reminder)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedReminder(null)
  }

  const handleDelete = (id: string) => {
    onDeleteReminder(id)
    if (selectedReminder?.id === id) {
      handleCloseModal()
    }
  }

  const handleUpdate = (updated: SearchReminder) => {
    if (onUpdateReminder) {
      onUpdateReminder(updated)
    }
    setSelectedReminder(updated)
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedRecurrence('ALL')
    setSelectedRecipient('ALL')
    setSelectedTimeOfDay('ALL')
    setSortBy('soonest')
    setFilterImportant(false)
    setFilterPending(false)
    setSelectedCategory(null)
  }

  const isFiltered =
    searchQuery.trim() !== '' ||
    selectedRecurrence !== 'ALL' ||
    selectedRecipient !== 'ALL' ||
    selectedTimeOfDay !== 'ALL' ||
    filterImportant ||
    filterPending ||
    selectedCategory !== null

  const getStatusBadgeStyle = (status: ReminderStatus) => {
    switch (status) {
      case 'DELIVERED':
        return 'bg-[#22201e] text-[#a8a59f] border border-[#383531]'
      case 'CANCELLED':
        return 'bg-[#2a1c1c] text-[#d97757] border border-[#4a2e2e]'
      case 'PENDING':
        return 'bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c]/40'
      default:
        return 'bg-[#262422] text-[#c2bfb8] border border-[#383531]'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header: count + date with prev/next arrows + Back to period */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {filteredReminders.length}{' '}
              {filteredReminders.length === 1 ? 'reminder' : 'reminders'} ·{' '}
              {selectedDateDisplay}
            </h2>

            {/* Previous day / Today / Next day arrows */}
            {(onPreviousDay || onNextDay) && (
              <div className="flex items-center gap-0.5 bg-[#22201e] border border-[#2e2c29] rounded-xl p-0.5 shadow-xs">
                {onPreviousDay && (
                  <button
                    type="button"
                    onClick={onPreviousDay}
                    title="Previous day"
                    aria-label="Previous day"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#a8a59f] hover:text-white hover:bg-[#2c2a26] transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                {onToday && (
                  <button
                    type="button"
                    onClick={onToday}
                    title="Jump to today"
                    aria-label="Jump to today"
                    className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      isToday
                        ? 'bg-[#cc785c] text-white'
                        : 'text-[#a8a59f] hover:text-white hover:bg-[#2c2a26]'
                    }`}
                  >
                    Today
                  </button>
                )}
                {onNextDay && (
                  <button
                    type="button"
                    onClick={onNextDay}
                    title="Tomorrow / Next day"
                    aria-label="Tomorrow / Next day"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#a8a59f] hover:text-white hover:bg-[#2c2a26] transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#d97757] hover:text-[#e0896b] transition-colors cursor-pointer group"
          >
            <span className="w-6 h-6 rounded-md bg-[#262422] group-hover:bg-[#302e2a] border border-[#383531] flex items-center justify-center text-[#8e8c87] group-hover:text-white transition-colors">
              <X className="h-3.5 w-3.5" />
            </span>
            <span>Back to period</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar Card (Anthropic dark theme: bg #1b1a18, border #2e2c29, rounded-2xl p-4) */}
      <div className="rounded-2xl border border-[#2e2c29] bg-[#1b1a18] p-4 sm:p-5 space-y-3.5 shadow-sm">
        {/* Row 1: Search input + 3 Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8e8c87] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reminder text"
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-[#252320] border border-[#2e2c29] text-sm text-white placeholder-[#8e8c87] focus:outline-hidden focus:border-[#cc785c] transition-colors"
            />
          </div>

          {/* Any recurrence dropdown */}
          <div className="relative shrink-0">
            <select
              value={selectedRecurrence}
              onChange={(e) => setSelectedRecurrence(e.target.value)}
              className="h-10 pl-3.5 pr-8 rounded-xl bg-[#252320] border border-[#2e2c29] text-sm text-[#e0ded8] focus:outline-hidden focus:border-[#cc785c] appearance-none cursor-pointer hover:bg-[#2c2a26] transition-colors"
            >
              <option value="ALL">Any recurrence</option>
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Yearly">Yearly</option>
              <option value="None">None</option>
            </select>
            <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8e8c87] pointer-events-none" />
          </div>

          {/* Any recipient dropdown */}
          <div className="relative shrink-0">
            <select
              value={selectedRecipient}
              onChange={(e) => setSelectedRecipient(e.target.value)}
              className="h-10 pl-3.5 pr-8 rounded-xl bg-[#252320] border border-[#2e2c29] text-sm text-[#e0ded8] focus:outline-hidden focus:border-[#cc785c] appearance-none cursor-pointer hover:bg-[#2c2a26] transition-colors"
            >
              <option value="ALL">Any recipient</option>
              {recipientOptions.map((recipient) => (
                <option key={recipient} value={recipient}>
                  {recipient}
                </option>
              ))}
            </select>
            <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8e8c87] pointer-events-none" />
          </div>

          {/* Any time of day dropdown */}
          <div className="relative shrink-0">
            <select
              value={selectedTimeOfDay}
              onChange={(e) => setSelectedTimeOfDay(e.target.value)}
              className="h-10 pl-3.5 pr-8 rounded-xl bg-[#252320] border border-[#2e2c29] text-sm text-[#e0ded8] focus:outline-hidden focus:border-[#cc785c] appearance-none cursor-pointer hover:bg-[#2c2a26] transition-colors"
            >
              <option value="ALL">Any time of day</option>
              <option value="morning">Morning (06:00 - 12:00)</option>
              <option value="afternoon">Afternoon (12:00 - 18:00)</option>
              <option value="evening">Evening (18:00 - 24:00)</option>
              <option value="night">Night (00:00 - 06:00)</option>
            </select>
            <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8e8c87] pointer-events-none" />
          </div>
        </div>

        {/* Row 2: Sort dropdown + Filter toggle pills + Category pills */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 pt-0.5">
          {/* Sort dropdown */}
          <div className="relative shrink-0">
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'soonest' | 'latest')
              }
              className="h-9 pl-3 pr-7 rounded-xl bg-[#252320] border border-[#2e2c29] text-xs sm:text-sm text-[#e0ded8] focus:outline-hidden focus:border-[#cc785c] appearance-none cursor-pointer hover:bg-[#2c2a26] transition-colors"
            >
              <option value="soonest">Soonest first</option>
              <option value="latest">Latest first</option>
            </select>
            <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8e8c87] pointer-events-none" />
          </div>

          {/* Separator */}
          <div className="h-5 w-px bg-[#2e2c29] hidden sm:block self-center mx-0.5" />

          {/* Important Pill */}
          <button
            type="button"
            onClick={() => setFilterImportant((prev) => !prev)}
            aria-pressed={filterImportant}
            className={`h-9 px-3 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              filterImportant
                ? 'bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c] shadow-xs'
                : 'bg-[#262422] text-[#c2bfb8] border border-[#353330] hover:bg-[#302e2a] hover:text-white'
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 shrink-0 ${
                filterImportant ? 'fill-current' : ''
              }`}
            />
            <span>Important</span>
          </button>

          {/* Pending Pill */}
          <button
            type="button"
            onClick={() => setFilterPending((prev) => !prev)}
            aria-pressed={filterPending}
            className={`h-9 px-3 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              filterPending
                ? 'bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c] shadow-xs'
                : 'bg-[#262422] text-[#c2bfb8] border border-[#353330] hover:bg-[#302e2a] hover:text-white'
            }`}
          >
            <Circle
              className={`w-2 h-2 shrink-0 ${
                filterPending ? 'fill-current' : 'fill-[#8e8c87]'
              }`}
            />
            <span>Pending</span>
          </button>

          {/* Separator */}
          <div className="h-5 w-px bg-[#2e2c29] hidden sm:block self-center mx-0.5" />

          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {CATEGORIES.map((category) => {
              const isSelected = selectedCategory === category
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() =>
                    setSelectedCategory(isSelected ? null : category)
                  }
                  className={`h-9 px-3 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-[#353330] text-white border border-[#cc785c] shadow-xs'
                      : 'bg-[#262422] text-[#c2bfb8] border border-[#353330] hover:bg-[#302e2a] hover:text-white'
                  }`}
                >
                  {category}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Reminder Cards List */}
      {filteredReminders.length > 0 ? (
        <div className="space-y-3">
          {filteredReminders.map((reminder) => (
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
              className="w-full bg-[#1b1a18] hover:bg-[#201f1c] border border-[#2e2c29] hover:border-[#383531] rounded-2xl px-5 sm:px-6 py-4 flex items-center justify-between gap-4 transition-all duration-150 cursor-pointer text-left shadow-xs focus:outline-hidden focus:border-[#cc785c]/60"
            >
              {/* Left Section: Date & Time + Emoji + Title & Subtext */}
              <div className="flex items-center min-w-0">
                {/* Date & Time block */}
                <div className="w-24 sm:w-28 shrink-0">
                  <div className="text-sm font-bold text-white tracking-tight">
                    {reminder.dateDisplay}
                  </div>
                  <div className="text-xs text-[#8e8c87] mt-0.5 font-normal">
                    {reminder.time}
                  </div>
                </div>

                {/* Emoji Icon */}
                <span
                  className="text-2xl sm:text-[26px] mr-3 sm:mr-4 select-none shrink-0"
                  aria-hidden="true"
                >
                  {reminder.icon}
                </span>

                {/* Title & Subtext */}
                <div className="min-w-0 pr-2">
                  <h3 className="text-sm sm:text-base font-medium text-white truncate">
                    {reminder.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#8e8c87] mt-0.5 truncate">
                    {reminder.channels.join(', ')} · {reminder.recurrence} · to{' '}
                    {reminder.recipient}
                  </p>
                </div>
              </div>

              {/* Right Section: Category pill + Status badge */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium bg-[#262422] text-[#c2bfb8] border border-[#383531]">
                  {reminder.category}
                </span>
                <span
                  className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-mono font-semibold uppercase tracking-wider ${getStatusBadgeStyle(
                    reminder.status
                  )}`}
                >
                  {reminder.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="p-10 text-center rounded-2xl border border-dashed border-[#2e2c29] bg-[#1b1a18]/40 space-y-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#cc785c]/10 text-[#d97757] mb-1">
            <AlertCircle className="w-5 h-5" />
          </div>
          <p className="text-base text-white font-medium">
            {isFiltered
              ? 'No reminders match your search filters'
              : 'No reminders found for this period'}
          </p>
          <p className="text-xs text-[#8e8c87]">
            {isFiltered
              ? 'Try adjusting your search query, recurrence, or status filters.'
              : 'There are no reminders scheduled for this period.'}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-2 px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#cc785c] hover:bg-[#d97757] transition-colors cursor-pointer"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Detail Modal (Pending-only Delete) */}
      <ReminderDetailModal
        reminder={selectedReminder}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onDelete={handleDelete}
        onUpdate={(updated) => handleUpdate(updated as SearchReminder)}
      />
    </div>
  )
}
