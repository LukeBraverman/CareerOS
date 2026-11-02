import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { X, Loader2, AlertCircle, Bell } from 'lucide-react'
import {
  parseDate,
  formatDate,
  formatDisplayDate,
  formatFullDateTime,
  formatToRFC3339,
  getLondonTime,
} from '@/lib/date'
import { DatePicker } from '@/components/DatePicker'
import { TimePicker } from '@/components/TimePicker'
import {
  createReminder,
  type BackendRecurrenceType,
  type CreateReminderPayload,
  type MonthlyMode,
} from '@/lib/api'
import {
  addReminderToCache,
  backendReminderToSearchReminder,
} from '@/lib/reminderCache'
import { ALL_EMOJIS, EMOJI_CATEGORIES } from '@/lib/emojiData'
import type { TodayReminder, ReminderCategory } from '@/types/reminder'

export interface CreateReminderModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (reminder: TodayReminder) => void
}

const DAYS_OF_WEEK_OPTIONS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const
type DayOfWeekOption = (typeof DAYS_OF_WEEK_OPTIONS)[number]

const DAY_TO_BACKEND: Record<DayOfWeekOption, string> = {
  Mon: 'MON',
  Tue: 'TUE',
  Wed: 'WED',
  Thu: 'THU',
  Fri: 'FRI',
  Sat: 'SAT',
  Sun: 'SUN',
}

const AVAILABLE_TAGS: readonly ReminderCategory[] = [
  'General',
  'Culture',
  'Travel',
] as const

function getTomorrowDateString(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return formatDate(tomorrow)
}

export function CreateReminderModal({
  isOpen,
  onClose,
  onCreated,
}: CreateReminderModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // Step 1 states
  const [message, setMessage] = useState('')
  const [emoji, setEmoji] = useState('🔔')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiSearch, setEmojiSearch] = useState('')
  const [triggerDate, setTriggerDate] = useState(() => getTomorrowDateString())
  const [triggerTime, setTriggerTime] = useState('09:00')
  const [modalOpenedTimestamp, setModalOpenedTimestamp] = useState(() =>
    typeof Date !== 'undefined' ? Date.now() : 0
  )
  const timeZone = 'Europe/London'
  const [tag, setTag] = useState<ReminderCategory>('General')
  const [isImportant, setIsImportant] = useState(false)

  // Step 2 states
  const [recurrence, setRecurrence] = useState<
    'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly'
  >('Once')
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>('SAME_DAY')
  const [intervalMonths, setIntervalMonths] = useState<number>(1)
  const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState<DayOfWeekOption[]>([
    'Mon',
  ])
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['Slack'])
  const [selectedRecipient, setSelectedRecipient] = useState<'SYSTEM' | 'LUKE' | 'ANA'>('SYSTEM')
  const [remindOneWeekBefore, setRemindOneWeekBefore] = useState(false)

  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const emojiPickerContainerRef = useRef<HTMLDivElement>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('All')

  const resetForm = useCallback(() => {
    setStep(1)
    setIsSubmitting(false)
    setApiError(null)
    setMessage('')
    setEmoji('🔔')
    setShowEmojiPicker(false)
    setEmojiSearch('')
    setSelectedCategory('All')
    setTriggerDate(getTomorrowDateString())
    setTriggerTime('09:00')
    setModalOpenedTimestamp(Date.now())
    setTag('General')
    setIsImportant(false)
    setRecurrence('Once')
    setMonthlyMode('SAME_DAY')
    setIntervalMonths(1)
    setRemindOneWeekBefore(false)
    setSelectedDaysOfWeek(['Mon'])
    setSelectedChannels(['Slack'])
    setSelectedRecipient('SYSTEM')
  }, [])

  const handleClose = useCallback(() => {
    if (isSubmitting) return
    resetForm()
    onClose()
  }, [isSubmitting, onClose, resetForm])

  // Close on Escape and lock body scroll
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showEmojiPicker) {
          setShowEmojiPicker(false)
        } else {
          handleClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, showEmojiPicker, handleClose])

  // Close emoji picker on click outside
  useEffect(() => {
    if (!showEmojiPicker) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        emojiPickerContainerRef.current &&
        !emojiPickerContainerRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEmojiPicker])

  // Filtered emojis
  const filteredEmojis = useMemo(() => {
    const q = emojiSearch.toLowerCase().trim()
    let list = ALL_EMOJIS
    if (selectedCategory !== 'All') {
      list = list.filter((item) => item.category === selectedCategory)
    }
    if (!q) return list
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.char.includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
    )
  }, [emojiSearch, selectedCategory])

  // Frontend past time validation
  const isTimeInPast = useMemo(() => {
    if (!triggerDate.trim() || !triggerTime.trim()) return false
    const parsed = parseDate(triggerDate)
    if (!parsed) return false
    const [hoursStr = '0', minutesStr = '0'] = triggerTime.trim().split(':')
    const h = parseInt(hoursStr, 10) || 0
    const m = parseInt(minutesStr, 10) || 0
    const target = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      h,
      m,
      0
    )
    const modalOpenedMinute = Math.floor(modalOpenedTimestamp / 60000) * 60000
    return target.getTime() < modalOpenedMinute
  }, [triggerDate, triggerTime, modalOpenedTimestamp])

  // Eligibility for 1 week before advance duplicate reminder (must be at least 7 days in the future)
  const isEligibleForWeekBefore = useMemo(() => {
    if (!triggerDate.trim() || !triggerTime.trim()) return false
    const parsed = parseDate(triggerDate)
    if (!parsed) return false
    const [hoursStr = '0', minutesStr = '0'] = triggerTime.trim().split(':')
    const h = parseInt(hoursStr, 10) || 0
    const m = parseInt(minutesStr, 10) || 0
    const target = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      h,
      m,
      0
    )
    const oneWeekBeforeMs = target.getTime() - 7 * 24 * 60 * 60 * 1000
    return oneWeekBeforeMs > modalOpenedTimestamp
  }, [triggerDate, triggerTime, modalOpenedTimestamp])

  const oneWeekBeforeFormatted = useMemo(() => {
    const parsed = parseDate(triggerDate)
    if (!parsed) return ''
    const target = new Date(parsed)
    target.setDate(target.getDate() - 7)
    const cleanTime = triggerTime.trim() || '09:00'
    return formatFullDateTime(target, cleanTime)
  }, [triggerDate, triggerTime])

  // Step 1 validity
  const canProceedStep1 =
    message.trim().length > 0 &&
    triggerDate.trim().length > 0 &&
    triggerTime.trim().length > 0 &&
    !isTimeInPast

  // Formatted date for Step 3
  const formattedReviewDate = useMemo(() => {
    const parsed = parseDate(triggerDate)
    if (parsed) {
      return `${formatDisplayDate(parsed)} at ${triggerTime} · Europe/London`
    }
    return `${triggerDate} at ${triggerTime} · Europe/London`
  }, [triggerDate, triggerTime])

  const recurrenceDisplay = useMemo(() => {
    if (recurrence === 'Once') return 'Once — does not repeat'
    if (recurrence === 'Weekly') {
      return `Weekly · on ${selectedDaysOfWeek.join(', ')}`
    }
    if (recurrence === 'Monthly') {
      const modeText =
        monthlyMode === 'END_OF_MONTH' ? 'End of month' : 'Same day each month'
      return intervalMonths === 1
        ? `Monthly · ${modeText}`
        : `Every ${intervalMonths} months · ${modeText}`
    }
    return recurrence
  }, [recurrence, selectedDaysOfWeek, monthlyMode, intervalMonths])

  // Toggle channel
  const handleToggleChannel = (channel: string) => {
    setSelectedChannels((prev) => {
      if (prev.includes(channel)) {
        if (prev.length === 1) return prev // keep at least one
        return prev.filter((c) => c !== channel)
      }
      return [...prev, channel]
    })
  }

  // Toggle day of week for weekly recurrence
  const handleToggleDay = (day: DayOfWeekOption) => {
    setSelectedDaysOfWeek((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev // keep at least one day
        return prev.filter((d) => d !== day)
      }
      return [...prev, day]
    })
  }

  // Handle final reminder creation
  const handleCreateReminder = async () => {
    if (isSubmitting) return

    setIsSubmitting(true)
    setApiError(null)

    const parsed = parseDate(triggerDate) || new Date()
    const category: ReminderCategory = tag
    const cleanTime = triggerTime.trim() || '09:00'
    const fullDate = formatFullDateTime(parsed, cleanTime)

    const recurrenceTypeMap: Record<
      'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly',
      BackendRecurrenceType
    > = {
      Once: 'SINGLE',
      Daily: 'DAILY',
      Weekly: 'WEEKLY',
      Monthly: 'MONTHLY',
      Yearly: 'YEARLY',
    }

    const recipientMap: Record<'SYSTEM' | 'LUKE' | 'ANA', string> = {
      SYSTEM: 'SYSTEM',
      LUKE: 'Luke',
      ANA: 'Ana',
    }

    const rfc3339TriggerAt = formatToRFC3339(triggerDate, cleanTime, timeZone)

    const payload: CreateReminderPayload = {
      message: message.trim(),
      recipient: recipientMap[selectedRecipient],
      triggerAt: rfc3339TriggerAt,
      recurrence: {
        type: recurrenceTypeMap[recurrence],
        ...(recurrence === 'Weekly'
          ? {
              daysOfWeek: selectedDaysOfWeek.map((d) => DAY_TO_BACKEND[d]),
            }
          : {}),
        ...(recurrence === 'Monthly'
          ? {
              monthlyMode,
              intervalMonths: Math.max(1, intervalMonths),
            }
          : {}),
      },
      channels: selectedChannels.map((c) => c.toUpperCase()),
      notificationChannels: selectedChannels.map((c) => c.toUpperCase()),
      emoji,
      important: isImportant,
      timeZone,
      metadata: {
        tag,
      },
    }

    try {
      const backendRes = await createReminder(payload)
      const searchReminder = backendReminderToSearchReminder(backendRes)
      addReminderToCache(searchReminder)

      const newReminder: TodayReminder = {
        id: backendRes.id,
        time: cleanTime,
        icon: backendRes.emoji || emoji,
        title: backendRes.message || message.trim(),
        channels: selectedChannels,
        recipient:
          selectedRecipient === 'SYSTEM'
            ? '@me'
            : selectedRecipient === 'LUKE'
              ? 'luke@meinc.app'
              : 'ana@meinc.app',
        status: backendRes.status || 'PENDING',
        important: backendRes.important ?? isImportant,
        category,
        firesAt: fullDate,
        timeZone: backendRes.timeZone || timeZone,
        createdAt: formatDisplayDate(
          backendRes.createdAt ? new Date(backendRes.createdAt) : new Date()
        ),
        completedAt:
          backendRes.completedAt && !backendRes.completedAt.startsWith('0001')
            ? backendRes.completedAt
            : '—',
        recurrence:
          recurrence === 'Once'
            ? 'None'
            : recurrence === 'Weekly'
              ? `Weekly (${selectedDaysOfWeek.join(', ')})`
              : recurrence === 'Monthly'
                ? monthlyMode === 'END_OF_MONTH'
                  ? 'Monthly (End of month)'
                  : 'Monthly'
                : recurrence,
        date: searchReminder.date,
        dateDisplay: searchReminder.dateDisplay,
        metadata: {
          tag,
        },
      }

      if (onCreated) {
        onCreated(newReminder)
      }

      // If remindOneWeekBefore is requested, create duplicate reminder 1 week before
      if (recurrence === 'Once' && remindOneWeekBefore && isEligibleForWeekBefore) {
        const parsedOneWeekBefore = new Date(parsed)
        parsedOneWeekBefore.setDate(parsedOneWeekBefore.getDate() - 7)
        const oneWeekBeforeRFC3339 = formatToRFC3339(
          formatDate(parsedOneWeekBefore),
          cleanTime,
          timeZone
        )
        // The advance reminder is always tagged General, even when the main
        // reminder is Travel/Culture, so it doesn't show up under those tabs.
        const advanceTag: ReminderCategory = 'General'
        const duplicatePayload: CreateReminderPayload = {
          ...payload,
          triggerAt: oneWeekBeforeRFC3339,
          metadata: {
            ...payload.metadata,
            tag: advanceTag,
          },
        }
        try {
          const dupRes = await createReminder(duplicatePayload)
          const dupSearchReminder = backendReminderToSearchReminder(dupRes)
          addReminderToCache(dupSearchReminder)
          const duplicateReminder: TodayReminder = {
            ...newReminder,
            id: dupRes.id,
            category: advanceTag,
            metadata: {
              ...newReminder.metadata,
              tag: advanceTag,
            },
            firesAt: formatFullDateTime(parsedOneWeekBefore, cleanTime),
            createdAt: formatDisplayDate(
              dupRes.createdAt ? new Date(dupRes.createdAt) : new Date()
            ),
            date: dupSearchReminder.date,
            dateDisplay: dupSearchReminder.dateDisplay,
          }
          if (onCreated) {
            onCreated(duplicateReminder)
          }
        } catch (dupErr) {
          console.error('Failed to create advance duplicate reminder:', dupErr)
        }
      }

      resetForm()
      onClose()
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 flex items-center justify-center bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-reminder-modal-title"
    >
      <div
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto my-auto bg-[#1e1d1b] border border-[#2e2c29] rounded-2xl shadow-2xl p-6 sm:p-7 text-white animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Close button */}
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="create-reminder-modal-title"
              className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug"
            >
              {step === 1 && 'What and when'}
              {step === 2 && 'Repeat and delivery'}
              {step === 3 && 'Review'}
            </h2>
            <p className="text-sm text-[#8e8c87] mt-0.5 font-normal">
              Step {step} of 3
            </p>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-[#262422] hover:bg-[#353330] flex items-center justify-center text-[#8e8c87] hover:text-white transition-colors cursor-pointer border border-[#383531] disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Separator */}
        <div className="my-5 border-t border-[#2e2c29]" />

        {/* STEP 1: What and when */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Message */}
            <div>
              <label className="block text-xs font-semibold text-[#8e8c87] mb-2">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter reminder here..."
                rows={3}
                className="w-full px-3.5 py-3 rounded-xl border border-[#2e2c29] bg-[#22201e] text-sm text-white placeholder-[#8e8c87] focus:outline-hidden focus:border-[#cc785c] resize-y"
              />
            </div>

            {/* Emoji */}
            <div ref={emojiPickerContainerRef} className="relative">
              <label className="block text-xs font-semibold text-[#8e8c87] mb-2">
                Emoji
              </label>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-[#2e2c29] bg-[#22201e] hover:bg-[#2c2a27] text-sm text-[#f0ede6] transition-colors cursor-pointer"
              >
                <span className="text-xl select-none" aria-hidden="true">
                  {emoji}
                </span>
                <span>Change emoji</span>
              </button>

              {/* Emoji Picker Popover */}
              {showEmojiPicker && (
                <div
                  ref={emojiPickerRef}
                  className="mt-2.5 p-3.5 rounded-xl border border-[#2e2c29] bg-[#1a1917] shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-100 max-w-lg w-full"
                >
                  <input
                    type="text"
                    value={emojiSearch}
                    onChange={(e) => setEmojiSearch(e.target.value)}
                    placeholder="Search 200+ emojis, e.g. flight, dentist, tax..."
                    className="w-full px-3 py-2 rounded-lg border border-[#2e2c29] bg-[#22201e] text-sm text-white placeholder-[#8e8c87] focus:outline-hidden focus:border-[#cc785c]"
                    autoFocus
                  />

                  {/* Category Filter Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    {EMOJI_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          selectedCategory === cat
                            ? 'bg-[#cc785c] text-white'
                            : 'bg-[#22201e] text-[#a8a59f] hover:bg-[#2c2a27] hover:text-white border border-[#2e2c29]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-2">
                      <span>
                        {emojiSearch.trim()
                          ? 'Search Results'
                          : selectedCategory === 'All'
                          ? 'All Emojis'
                          : selectedCategory}
                      </span>
                      <span className="text-[10px] lowercase text-[#66635e] font-normal">
                        {filteredEmojis.length} {filteredEmojis.length === 1 ? 'choice' : 'choices'}
                      </span>
                    </div>
                    <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 max-h-52 overflow-y-auto custom-scrollbar p-1">
                      {filteredEmojis.map((item) => (
                        <button
                          key={item.char}
                          type="button"
                          onClick={() => {
                            setEmoji(item.char)
                            setShowEmojiPicker(false)
                          }}
                          className={`h-9 w-9 text-xl flex items-center justify-center rounded-lg transition-colors cursor-pointer select-none ${
                            emoji === item.char
                              ? 'bg-[#cc785c]/25 border border-[#cc785c] scale-105'
                              : 'hover:bg-[#2e2c29] border border-transparent'
                          }`}
                          title={`${item.name} (${item.category})`}
                        >
                          {item.char}
                        </button>
                      ))}
                      {filteredEmojis.length === 0 && (
                        <div className="col-span-full py-6 text-center text-xs text-[#8e8c87]">
                          No emojis found for &ldquo;{emojiSearch}&rdquo;
                          {selectedCategory !== 'All' && ` in ${selectedCategory}`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Trigger Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#8e8c87] mb-1.5">
                  Trigger date
                </label>
                <DatePicker
                  id="trigger-date"
                  value={triggerDate}
                  disablePast={true}
                  onChange={(val) => {
                    setTriggerDate(val)
                    setApiError(null)
                  }}
                  onTodayClick={() => {
                    setTriggerTime(getLondonTime())
                    setApiError(null)
                  }}
                  placeholder="DD/MM/YYYY"
                  className="w-full"
                  inputClassName={`w-full px-3.5 py-2.5 rounded-xl border bg-[#22201e] text-sm text-white focus:outline-hidden transition-colors ${
                    isTimeInPast
                      ? 'border-amber-500/60 focus:border-amber-400'
                      : 'border-[#2e2c29] focus:border-[#cc785c]'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8e8c87] mb-1.5">
                  Time
                </label>
                <TimePicker
                  id="trigger-time"
                  value={triggerTime}
                  selectedDate={triggerDate}
                  disablePast={true}
                  onChange={(val) => {
                    setTriggerTime(val)
                    setApiError(null)
                  }}
                  placeholder="09:00"
                  className="w-full"
                  inputClassName={`w-full px-3.5 py-2.5 rounded-xl border bg-[#22201e] text-sm text-white focus:outline-hidden transition-colors ${
                    isTimeInPast
                      ? 'border-amber-500/60 focus:border-amber-400'
                      : 'border-[#2e2c29] focus:border-[#cc785c]'
                  }`}
                />
              </div>
            </div>

            {/* Past time warning feedback */}
            {isTimeInPast && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs flex items-center gap-2 animate-in fade-in duration-100">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  The selected time is in the past. Reminders must be scheduled for a future time.
                </span>
              </div>
            )}

            {/* Tag */}
            <div>
              <label className="block text-xs font-semibold text-[#8e8c87] mb-2">
                Tag
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                {AVAILABLE_TAGS.map((t) => {
                  const isSelected = tag === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTag(t)}
                      className={`px-4 py-2 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#353330] border-[#484440] text-white'
                          : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setIsImportant((prev) => !prev)}
                  className={`px-4 py-2 rounded-full text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isImportant
                      ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs ring-1 ring-[#cc785c]/50'
                      : 'bg-[#241f1a] border-amber-600/40 text-amber-300 hover:text-white hover:border-amber-500/70 hover:bg-[#2c241e]'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{isImportant ? 'Marked!' : 'Mark important!'}</span>
                </button>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between pt-6 border-t border-[#2e2c29]">
              <span className="text-xs text-[#8e8c87]">
                {!message.trim() || !triggerDate.trim() || !triggerTime.trim()
                  ? 'Add a message, date and time to continue.'
                  : isTimeInPast
                    ? 'Scheduled time must be in the future.'
                    : ''}
              </span>
              <button
                type="button"
                disabled={!canProceedStep1}
                onClick={() => {
                  setApiError(null)
                  setStep(2)
                }}
                className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
                  canProceedStep1
                    ? 'bg-[#2e2c29] hover:bg-[#383531] border border-[#403d39] text-white cursor-pointer'
                    : 'bg-[#242220] border border-[#2e2c29] text-[#6e6b66] cursor-not-allowed'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Repeat and delivery */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Recurrence */}
            <div>
              <label className="block text-xs font-semibold text-[#8e8c87] mb-2.5">
                Recurrence
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                {(['Once', 'Daily', 'Weekly', 'Monthly', 'Yearly'] as const).map(
                  (r) => {
                    const isSelected = recurrence === r
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRecurrence(r)}
                        className={`px-4 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                          isSelected
                            ? 'bg-[#cc785c] border-[#cc785c] text-white'
                            : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                        }`}
                      >
                        {r}
                      </button>
                    )
                  }
                )}
              </div>

              {/* Weekly Days of Week Selection */}
              {recurrence === 'Weekly' && (
                <div className="mt-4 pt-4 border-t border-[#2e2c29]/70 animate-in fade-in duration-150">
                  <label className="block text-xs font-semibold text-[#8e8c87] mb-2.5">
                    Repeat on days
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {DAYS_OF_WEEK_OPTIONS.map((day) => {
                      const isSelected = selectedDaysOfWeek.includes(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => handleToggleDay(day)}
                          className={`h-9 px-3.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                            isSelected
                              ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                              : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                          }`}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Once: Remind one week before option (Issue #26) */}
              {recurrence === 'Once' && (
                <div className="mt-4 pt-4 border-t border-[#2e2c29]/70 animate-in fade-in duration-150">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#8e8c87] mb-1">
                        Remind one week before
                      </label>
                      <p className="text-xs text-[#a8a59f]">
                        {isEligibleForWeekBefore ? (
                          <>
                            Send a duplicate reminder that pings one week before on{' '}
                            <span className="text-white font-medium">
                              {oneWeekBeforeFormatted}
                            </span>
                            .
                          </>
                        ) : (
                          'Scheduled time must be at least 1 week in the future to enable a 1-week advance reminder.'
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setRemindOneWeekBefore(false)}
                      className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                        !remindOneWeekBefore
                          ? 'bg-[#2e2c29] border-[#403d39] text-white font-semibold shadow-xs'
                          : 'bg-[#22201e] border-[#2e2c29] text-[#8e8c87] hover:text-white hover:bg-[#282623]'
                      }`}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      disabled={!isEligibleForWeekBefore}
                      onClick={() => setRemindOneWeekBefore(true)}
                      className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors border flex items-center gap-1.5 ${
                        !isEligibleForWeekBefore
                          ? 'bg-[#1a1918] border-[#252320] text-[#55524d] cursor-not-allowed'
                          : remindOneWeekBefore
                            ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs cursor-pointer'
                            : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825] cursor-pointer'
                      }`}
                    >
                      <Bell className="w-3.5 h-3.5 shrink-0" />
                      <span>Yes, remind 1 week before</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Monthly: End of month vs Same day & Repeat interval (Issue #32, Issue #49) */}
              {recurrence === 'Monthly' && (
                <div className="mt-4 pt-4 border-t border-[#2e2c29]/70 space-y-4 animate-in fade-in duration-150">
                  {/* Monthly timing */}
                  <div>
                    <label className="block text-xs font-semibold text-[#8e8c87] mb-2.5">
                      Monthly timing
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMonthlyMode('SAME_DAY')}
                        className={`h-9 px-3.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                          monthlyMode === 'SAME_DAY'
                            ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                            : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                        }`}
                      >
                        Same day each month
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonthlyMode('END_OF_MONTH')}
                        className={`h-9 px-3.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                          monthlyMode === 'END_OF_MONTH'
                            ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                            : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                        }`}
                      >
                        End of month
                      </button>
                    </div>
                  </div>

                  {/* Repeat Interval (Every X months) */}
                  <div>
                    <label className="block text-xs font-semibold text-[#8e8c87] mb-2.5">
                      Repeat interval
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[1, 2, 3, 6].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setIntervalMonths(num)}
                          className={`h-9 px-3.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                            intervalMonths === num
                              ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                              : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                          }`}
                        >
                          {num === 1 ? 'Every month' : `Every ${num} months`}
                        </button>
                      ))}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#8e8c87]">Every</span>
                        <input
                          type="number"
                          min={1}
                          max={24}
                          value={intervalMonths}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10)
                            if (!isNaN(val) && val >= 1) {
                              setIntervalMonths(Math.min(val, 24))
                            }
                          }}
                          className="w-16 h-9 text-center px-2 rounded-xl border border-[#2e2c29] bg-[#161514] text-xs text-white focus:outline-hidden focus:border-[#cc785c]"
                        />
                        <span className="text-xs text-[#8e8c87]">months</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[#a8a59f]">
                    {monthlyMode === 'END_OF_MONTH'
                      ? intervalMonths === 1
                        ? 'This reminder will fire on the last calendar day of every month.'
                        : `This reminder will fire on the last calendar day every ${intervalMonths} months.`
                      : intervalMonths === 1
                        ? 'This reminder will fire on the same numerical day each month.'
                        : `This reminder will fire on the same numerical day every ${intervalMonths} months.`}
                  </p>
                </div>
              )}
            </div>

            {/* Channels */}
            <div>
              <label className="block text-xs font-semibold text-[#8e8c87] mb-2.5">
                Channels
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                {['Slack'].map((c) => {
                  const isSelected = selectedChannels.includes(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleToggleChannel(c)}
                      className={`px-4 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                        isSelected
                          ? 'bg-[#353330] border-[#484440] text-white'
                          : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                      }`}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Recipient */}
            <div>
              <label className="block text-xs font-semibold text-[#8e8c87] mb-2.5">
                Recipient
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                {(['SYSTEM', 'LUKE', 'ANA'] as const).map((rec) => {
                  const isSelected = selectedRecipient === rec
                  return (
                    <button
                      key={rec}
                      type="button"
                      onClick={() => setSelectedRecipient(rec)}
                      className={`px-4 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                        isSelected
                          ? 'bg-[#353330] border-[#484440] text-white'
                          : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                      }`}
                    >
                      {rec}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between pt-6 border-t border-[#2e2c29]">
              <button
                type="button"
                onClick={() => {
                  setApiError(null)
                  setStep(1)
                }}
                className="px-5 py-2 rounded-xl text-sm font-medium text-[#c2bfb8] hover:text-white bg-[#22201e] border border-[#2e2c29] hover:bg-[#2c2a27] transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setApiError(null)
                  setStep(3)
                }}
                className="px-6 py-2 rounded-xl text-sm font-medium text-white bg-[#cc785c] hover:bg-[#d97757] transition-colors cursor-pointer shadow-xs"
              >
                Review
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Review */}
        {step === 3 && (
          <div>
            {/* Emoji + Title Header Line */}
            <div className="flex items-center gap-3 text-lg sm:text-xl font-medium text-white mb-6">
              <span className="text-2xl sm:text-3xl select-none shrink-0" aria-hidden="true">
                {emoji}
              </span>
              <span className="truncate">{message}</span>
            </div>

            {/* 2-Column Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 mb-8">
              {/* Col 1 */}
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                    TRIGGER AT
                  </div>
                  <div className="text-sm sm:text-base text-white mt-1 font-normal">
                    {formattedReviewDate}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                    CHANNELS
                  </div>
                  <div className="text-sm sm:text-base text-white mt-1 font-normal">
                    {selectedChannels.join(', ')}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                    TAG
                  </div>
                  <div className="text-sm sm:text-base text-white mt-1 font-normal">
                    {tag}
                    {isImportant ? ' · Important' : ''}
                  </div>
                </div>
              </div>

              {/* Col 2 */}
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                    RECURRENCE
                  </div>
                  <div className="text-sm sm:text-base text-white mt-1 font-normal">
                    {recurrenceDisplay}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                    RECIPIENT
                  </div>
                  <div className="text-sm sm:text-base text-white mt-1 font-normal">
                    {selectedRecipient}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                    STATUS ON SAVE
                  </div>
                  <div className="text-sm sm:text-base text-white mt-1 font-normal">
                    PENDING
                  </div>
                </div>
              </div>
            </div>

            {/* Advance reminder notice (Issue #26) */}
            {recurrence === 'Once' && remindOneWeekBefore && isEligibleForWeekBefore && (
              <div className="mb-6 p-4 rounded-xl bg-[#cc785c]/10 border border-[#cc785c]/30 text-xs text-[#f0ede6] flex items-start gap-3 animate-in fade-in duration-150">
                <Bell className="w-4 h-4 shrink-0 text-[#cc785c] mt-0.5" />
                <div>
                  <div className="font-semibold text-white">
                    Advance reminder scheduled
                  </div>
                  <div className="text-[#c2bfb8] mt-0.5">
                    A duplicate reminder will also be created to ping 1 week before on{' '}
                    <span className="text-white font-medium">{oneWeekBeforeFormatted}</span>.
                  </div>
                </div>
              </div>
            )}

            {/* API Error Feedback */}
            {apiError && (
              <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-3 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-red-300">
                    Failed to create reminder
                  </p>
                  <p className="text-red-200/90 leading-relaxed break-words">
                    {apiError}
                  </p>
                </div>
              </div>
            )}

            {/* Bottom bar */}
            <div className="flex items-center justify-between pt-6 border-t border-[#2e2c29]">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setApiError(null)
                  setStep(2)
                }}
                className="px-5 py-2 rounded-xl text-sm font-medium text-[#c2bfb8] hover:text-white bg-[#22201e] border border-[#2e2c29] hover:bg-[#2c2a27] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Back
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCreateReminder}
                className="px-6 py-2 rounded-xl text-sm font-medium text-white bg-[#cc785c] hover:bg-[#d97757] transition-colors cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                )}
                <span>
                  {isSubmitting ? 'Creating reminder...' : 'Create reminder'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
