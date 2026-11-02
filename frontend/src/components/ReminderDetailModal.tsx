import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, AlertCircle, Loader2 } from 'lucide-react'
import type { TodayReminder, SearchReminder, ReminderCategory } from '@/types/reminder'
import type { TravelReminder } from '@/types/travel'
import {
  updateReminder,
  type UpdateReminderPayload,
  type BackendRecurrenceType,
  type MonthlyMode,
} from '@/lib/api'
import { updateReminderInCache } from '@/lib/reminderCache'
import {
  formatDate,
  parseDate,
  formatDisplayDate,
  formatDayDisplay,
  formatFullDateTime,
  formatToRFC3339,
  getLondonTime,
} from '@/lib/date'
import { DatePicker } from '@/components/DatePicker'
import { TimePicker } from '@/components/TimePicker'
import { PRESET_EMOJIS } from '@/lib/emojiData'

export type ModalReminder = TodayReminder | SearchReminder | TravelReminder

interface ReminderDetailModalProps {
  reminder: ModalReminder | null
  isOpen: boolean
  onClose: () => void
  onDelete: (id: string) => void
  onUpdate?: (updated: ModalReminder) => void
}

const AVAILABLE_CHANNELS = ['WhatsApp', 'Slack'] as const

const AVAILABLE_TAGS = [
  'Culture',
  'Travel',
  'General',
] as const

const DAYS_OF_WEEK_OPTIONS = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
] as const

function normalizeChannelName(c: string): string {
  const upper = c.toUpperCase()
  if (upper === 'WHATSAPP') return 'WhatsApp'
  if (upper === 'SLACK') return 'Slack'
  if (upper === 'EMAIL') return 'Email'
  if (upper === 'SMS') return 'SMS'
  if (upper === 'PUSH') return 'Push'
  return c
}

export function ReminderDetailModal({
  reminder,
  isOpen,
  onClose,
  onDelete,
  onUpdate,
}: ReminderDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editEmoji, setEditEmoji] = useState('🔔')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('09:00')
  const [editRecipient, setEditRecipient] = useState('')
  const [editChannels, setEditChannels] = useState<string[]>(['WhatsApp'])
  const [editTag, setEditTag] = useState<string>('Culture')
  const [editRecurrence, setEditRecurrence] = useState('None')
  const [editDaysOfWeek, setEditDaysOfWeek] = useState<string[]>(['MON'])
  const [editMonthlyMode, setEditMonthlyMode] = useState<MonthlyMode>('SAME_DAY')
  const [editIntervalMonths, setEditIntervalMonths] = useState<number>(1)
  const [editImportant, setEditImportant] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleStartEdit = () => {
    if (!reminder) return
    setEditTitle(reminder.title)
    setEditEmoji(reminder.icon || '🔔')

    // Extract initial date (DD/MM/YYYY)
    const existingDate = (reminder as SearchReminder).date
    if (existingDate) {
      setEditDate(existingDate)
    } else if (reminder.firesAt) {
      const parsed = parseDate(reminder.firesAt)
      setEditDate(parsed ? formatDate(parsed) : formatDate(new Date()))
    } else {
      setEditDate(formatDate(new Date()))
    }

    setEditTime(reminder.time || '09:00')
    setEditRecipient(reminder.recipient)

    // Normalize channels strictly to WhatsApp & Slack
    const channels =
      reminder.channels && reminder.channels.length > 0
        ? reminder.channels
            .map(normalizeChannelName)
            .filter((c) => (AVAILABLE_CHANNELS as readonly string[]).includes(c))
        : ['WhatsApp']
    setEditChannels(channels.length > 0 ? channels : ['WhatsApp'])

    const rawTag =
      reminder.metadata?.tag ||
      reminder.metadata?.category ||
      (reminder as SearchReminder).category ||
      ''
    const lower = rawTag.toLowerCase()
    const normalizedTag =
      lower === 'travel' ? 'Travel' : lower === 'culture' ? 'Culture' : 'General'
    setEditTag(normalizedTag)

    const rawRec = reminder.recurrence || 'None'
    const isMonthly = rawRec.toLowerCase().includes('monthly') || rawRec.toLowerCase().includes('month')
    setEditRecurrence(
      isMonthly
        ? 'Monthly'
        : rawRec.toLowerCase().includes('weekly')
          ? 'Weekly'
          : rawRec.toLowerCase().includes('daily')
            ? 'Daily'
            : rawRec.toLowerCase().includes('yearly')
              ? 'Yearly'
              : 'None'
    )
    const isEndOfMonth = rawRec.toLowerCase().includes('end of month')
    setEditMonthlyMode(isEndOfMonth ? 'END_OF_MONTH' : 'SAME_DAY')
    const matchInterval = rawRec.match(/every (\d+) months/i)
    setEditIntervalMonths(matchInterval ? parseInt(matchInterval[1], 10) || 1 : 1)

    const matchDays = rawRec.match(/on\s+([A-Za-z,\s]+)/i)
    if (matchDays) {
      const days = matchDays[1]
        .split(',')
        .map((d) => d.trim().toUpperCase())
        .filter((d) => (DAYS_OF_WEEK_OPTIONS as readonly string[]).includes(d))
      setEditDaysOfWeek(days.length > 0 ? days : ['MON'])
    } else {
      const dateToParse = existingDate || reminder.firesAt || ''
      const parsed = dateToParse ? parseDate(dateToParse) : null
      const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
      const defaultDay = parsed ? dayNames[parsed.getDay()] : 'MON'
      setEditDaysOfWeek([defaultDay])
    }

    setEditImportant(Boolean(reminder.important))
    setSaveError(null)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setSaveError(null)
  }

  const handleModalClose = useCallback(() => {
    setIsEditing(false)
    setSaveError(null)
    onClose()
  }, [onClose])

  // Close on Escape key and lock body scroll
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleModalClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, handleModalClose])

  const isTimeInPast = useMemo(() => {
    if (!editDate.trim() || !editTime.trim()) return false
    const parsed = parseDate(editDate)
    if (!parsed) return false
    const [hoursStr = '0', minutesStr = '0'] = editTime.trim().split(':')
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
    return target.getTime() < Date.now() - 60000
  }, [editDate, editTime])

  if (!isOpen || !reminder) return null

  const isPending = reminder.status === 'PENDING'

  const handleToggleChannel = (ch: string) => {
    setEditChannels((prev) => {
      const exists = prev.some((c) => c.toUpperCase() === ch.toUpperCase())
      if (exists) {
        if (prev.length <= 1) return prev // Keep at least one channel
        return prev.filter((c) => c.toUpperCase() !== ch.toUpperCase())
      } else {
        return [...prev, ch]
      }
    })
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTitle.trim()) {
      setSaveError('Reminder title cannot be empty.')
      return
    }

    const parsedDate = parseDate(editDate)
    if (!parsedDate) {
      setSaveError('Please select a valid date.')
      return
    }

    if (isTimeInPast) {
      setSaveError(
        'The reminder time cannot be in the past. Please select a future date and time.'
      )
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const timeZone = reminder.timeZone || 'Europe/London'
      const rfc3339 = formatToRFC3339(editDate, editTime, timeZone)

      let backendRecType: BackendRecurrenceType = 'SINGLE'
      const recLower = editRecurrence.toLowerCase()
      if (recLower.includes('daily')) {
        backendRecType = 'DAILY'
      } else if (recLower.includes('weekly')) {
        backendRecType = 'WEEKLY'
      } else if (recLower.includes('monthly')) {
        backendRecType = 'MONTHLY'
      } else if (recLower.includes('yearly')) {
        backendRecType = 'YEARLY'
      }

      const upperChannels = editChannels.map((c) => c.toUpperCase())

      const payload: UpdateReminderPayload = {
        message: editTitle.trim(),
        recipient: editRecipient.trim() || reminder.recipient,
        triggerAt: rfc3339,
        channels: upperChannels,
        notificationChannels: upperChannels,
        emoji: editEmoji,
        important: editImportant,
        status: 'PENDING',
        timeZone,
        recurrence: {
          type: backendRecType,
          ...(backendRecType === 'MONTHLY'
            ? {
                monthlyMode: editMonthlyMode,
                intervalMonths: editIntervalMonths,
              }
            : {}),
          ...(backendRecType === 'WEEKLY'
            ? {
                daysOfWeek: editDaysOfWeek,
              }
            : {}),
        },
        metadata: {
          ...reminder.metadata,
          tag: editTag.toLowerCase() === 'general' ? 'general' : editTag,
        },
      }

      await updateReminder(reminder.id, payload)

      const newDateDisplay = formatDayDisplay(parsedDate)
      const newFullDateTime = formatFullDateTime(parsedDate, editTime)

      let newRecurrenceDisplay = editRecurrence
      if (editRecurrence === 'Monthly') {
        const intervalText = editIntervalMonths > 1 ? `Every ${editIntervalMonths} months` : 'Monthly'
        const modeText = editMonthlyMode === 'END_OF_MONTH' ? 'End of month' : 'Same day'
        newRecurrenceDisplay = `${intervalText} · ${modeText}`
      } else if (editRecurrence === 'Weekly') {
        newRecurrenceDisplay =
          editDaysOfWeek.length > 0
            ? `Weekly · on ${editDaysOfWeek.join(', ')}`
            : 'Weekly'
      }

      const updatedReminder: SearchReminder = {
        ...reminder,
        date: editDate,
        dateDisplay: newDateDisplay,
        time: editTime,
        icon: editEmoji,
        title: editTitle.trim(),
        recipient: editRecipient.trim() || reminder.recipient,
        channels: editChannels,
        important: editImportant,
        status: 'PENDING',
        firesAt: newFullDateTime,
        recurrence: newRecurrenceDisplay,
        timeZone,
        createdAt: reminder.createdAt || formatDisplayDate(new Date()),
        category: (editTag.toLowerCase() === 'travel'
          ? 'Travel'
          : editTag.toLowerCase() === 'culture'
            ? 'Culture'
            : 'General') as ReminderCategory,
        metadata: {
          ...reminder.metadata,
          tag: editTag.toLowerCase() === 'general' ? 'general' : editTag,
        },
      }

      // Update frontend cache
      updateReminderInCache(updatedReminder)

      if (onUpdate) {
        onUpdate(updatedReminder)
      }

      setIsEditing(false)
    } catch (err) {
      console.error('Failed to update reminder:', err)
      setSaveError(
        err instanceof Error ? err.message : 'Failed to update reminder'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleModalClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-modal-title"
    >
      <div
        className="relative w-full max-w-xl bg-[#1b1a18] border border-[#2e2c29] rounded-2xl shadow-2xl p-6 sm:p-8 text-[#f0ede6] animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header: Icon + Title + Badges & Close button */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <span
              className="text-3xl select-none shrink-0 pt-0.5"
              aria-hidden="true"
            >
              {isEditing ? editEmoji : reminder.icon}
            </span>
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8e8c87]">
                    Title / Message
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => {
                      setEditTitle(e.target.value)
                      setSaveError(null)
                    }}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#cc785c]/60 bg-[#252320] text-white text-base font-bold focus:outline-hidden focus:border-[#cc785c]"
                    placeholder="Reminder title"
                    autoFocus
                  />
                </div>
              ) : (
                <h2
                  id="reminder-modal-title"
                  className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug"
                >
                  {reminder.title}
                </h2>
              )}

              {/* Status, Category, and Important Badges */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-semibold uppercase tracking-wider ${
                    reminder.status === 'DELIVERED'
                      ? 'bg-[#22201e] text-[#a8a59f] border border-[#383531]'
                      : reminder.status === 'CANCELLED'
                        ? 'bg-[#2a1c1c] text-[#d97757] border border-[#4a2e2e]'
                        : reminder.status === 'PENDING'
                          ? 'bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c]/40'
                          : 'bg-[#262422] text-[#c2bfb8] border border-[#383531]'
                  }`}
                >
                  {reminder.status}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#262422] text-[#c2bfb8] border border-[#383531]">
                  {isEditing ? editTag : reminder.category}
                </span>
                {reminder.important && !isEditing && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c]/30">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>IMPORTANT</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Close button (X) */}
          <button
            type="button"
            onClick={handleModalClose}
            className="w-8 h-8 rounded-lg bg-[#262422] hover:bg-[#353330] flex items-center justify-center text-[#8e8c87] hover:text-white transition-colors cursor-pointer border border-[#383531] shrink-0"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Separator */}
        <div className="my-5 border-t border-[#2e2c29]" />

        {saveError && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Edit Form or Read-only Metadata Grid */}
        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            {/* Emoji Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                  Emoji ({PRESET_EMOJIS.length} choices)
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#8e8c87]">Custom:</span>
                  <input
                    type="text"
                    value={editEmoji}
                    onChange={(e) => setEditEmoji(e.target.value)}
                    maxLength={4}
                    className="w-12 text-center px-1.5 py-1 rounded-lg border border-[#2e2c29] bg-[#22201e] text-sm text-white focus:outline-hidden focus:border-[#cc785c]"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-[#161514] border border-[#2e2c29] max-h-32 overflow-y-auto custom-scrollbar">
                {PRESET_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEditEmoji(em)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-colors cursor-pointer ${
                      editEmoji === em
                        ? 'bg-[#cc785c]/25 border border-[#cc785c] scale-110'
                        : 'hover:bg-[#252320] border border-transparent'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            {/* Trigger Date and Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                  Trigger Date
                </label>
                <DatePicker
                  id="edit-trigger-date"
                  value={editDate}
                  disablePast={true}
                  onChange={(val) => {
                    setEditDate(val)
                    setSaveError(null)
                  }}
                  onTodayClick={() => {
                    setEditTime(getLondonTime())
                    setSaveError(null)
                  }}
                  placeholder="DD/MM/YYYY"
                  className="w-full"
                  inputClassName={`w-full px-3.5 py-2 rounded-xl border bg-[#22201e] text-sm text-white focus:outline-hidden transition-colors ${
                    isTimeInPast
                      ? 'border-amber-500/60 focus:border-amber-400'
                      : 'border-[#2e2c29] focus:border-[#cc785c]'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                  Trigger Time
                </label>
                <TimePicker
                  id="edit-trigger-time"
                  value={editTime}
                  selectedDate={editDate}
                  disablePast={true}
                  onChange={(val) => {
                    setEditTime(val)
                    setSaveError(null)
                  }}
                  placeholder="09:00"
                  className="w-full"
                  inputClassName={`w-full px-3.5 py-2 rounded-xl border bg-[#22201e] text-sm text-white focus:outline-hidden transition-colors ${
                    isTimeInPast
                      ? 'border-amber-500/60 focus:border-amber-400'
                      : 'border-[#2e2c29] focus:border-[#cc785c]'
                  }`}
                />
              </div>
            </div>

            {isTimeInPast && (
              <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>
                  The selected time is in the past. Reminders must be scheduled for a future time.
                </span>
              </div>
            )}

            {/* Recipient */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                Recipient
              </label>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {(['SYSTEM', 'LUKE', 'ANA'] as const).map(
                    (rec) => {
                      const isSelected = editRecipient === rec
                      return (
                        <button
                          key={rec}
                          type="button"
                          onClick={() => setEditRecipient(rec)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                            isSelected
                              ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                              : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                          }`}
                        >
                          {rec}
                        </button>
                      )
                    }
                  )}
                </div>
                <input
                  type="text"
                  value={editRecipient}
                  onChange={(e) => setEditRecipient(e.target.value)}
                  placeholder="Or enter custom recipient..."
                  className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#22201e] text-sm text-white focus:outline-hidden focus:border-[#cc785c]"
                />
              </div>
            </div>

            {/* Tag Selection (Issue #51) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                Tag
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {AVAILABLE_TAGS.map((t) => {
                  const isSelected = editTag.toLowerCase() === t.toLowerCase()
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditTag(t)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                        isSelected
                          ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                          : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Notification Channels */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                Notification Channels
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {AVAILABLE_CHANNELS.map((ch) => {
                  const isSelected = editChannels.some(
                    (c) => c.toUpperCase() === ch.toUpperCase()
                  )
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => handleToggleChannel(ch)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                        isSelected
                          ? 'bg-[#353330] border-[#484440] text-white font-semibold shadow-xs'
                          : 'bg-[#22201e] border-[#2e2c29] text-[#8e8c87] hover:text-white hover:bg-[#282623]'
                      }`}
                    >
                      {ch}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Recurrence & Important row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                  Recurrence
                </label>
                <select
                  value={editRecurrence}
                  onChange={(e) => setEditRecurrence(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#22201e] text-sm text-white focus:outline-hidden focus:border-[#cc785c] cursor-pointer"
                >
                  <option value="None">Once / None</option>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Yearly">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                  Importance
                </label>
                <button
                  type="button"
                  onClick={() => setEditImportant((prev) => !prev)}
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    editImportant
                      ? 'bg-[#cc785c]/15 border-[#cc785c] text-[#d97757]'
                      : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white'
                  }`}
                >
                  <AlertCircle
                    className="h-4 w-4 shrink-0"
                  />
                  <span>{editImportant ? 'Marked Important' : 'Standard'}</span>
                </button>
              </div>
            </div>

            {/* Weekly: Repeat on days (Issue #51) */}
            {editRecurrence === 'Weekly' && (
              <div className="p-3.5 rounded-xl border border-[#2e2c29] bg-[#161514] space-y-2 animate-in fade-in duration-150">
                <label className="block text-xs font-semibold text-[#8e8c87]">
                  Repeat on days
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {DAYS_OF_WEEK_OPTIONS.map((day) => {
                    const isSelected = editDaysOfWeek.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setEditDaysOfWeek((prev) =>
                            prev.includes(day)
                              ? prev.length > 1
                                ? prev.filter((d) => d !== day)
                                : prev
                              : [...prev, day]
                          )
                        }}
                        className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
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

            {/* Monthly: End of month & Every X months options (Issue #49) */}
            {editRecurrence === 'Monthly' && (
              <div className="p-3.5 rounded-xl border border-[#2e2c29] bg-[#161514] space-y-3 animate-in fade-in duration-150">
                <div>
                  <label className="block text-xs font-semibold text-[#8e8c87] mb-2">
                    Monthly timing
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditMonthlyMode('SAME_DAY')}
                      className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                        editMonthlyMode === 'SAME_DAY'
                          ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                          : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                      }`}
                    >
                      Same day each month
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditMonthlyMode('END_OF_MONTH')}
                      className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                        editMonthlyMode === 'END_OF_MONTH'
                          ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                          : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                      }`}
                    >
                      End of month
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8e8c87] mb-2">
                    Repeat interval
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 2, 3, 6].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setEditIntervalMonths(num)}
                        className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                          editIntervalMonths === num
                            ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                            : 'bg-[#22201e] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#2a2825]'
                        }`}
                      >
                        {num === 1 ? 'Every month' : `Every ${num} months`}
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#8e8c87]">Every</span>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={editIntervalMonths}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          if (!isNaN(val) && val >= 1) {
                            setEditIntervalMonths(Math.min(val, 24))
                          }
                        }}
                        className="w-14 h-8 text-center px-1.5 rounded-lg border border-[#2e2c29] bg-[#22201e] text-xs text-white focus:outline-hidden focus:border-[#cc785c]"
                      />
                      <span className="text-xs text-[#8e8c87]">months</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#2e2c29]">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#c2bfb8] hover:text-white bg-[#262422] hover:bg-[#353330] border border-[#383531] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !editTitle.trim() || isTimeInPast}
                className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-[#cc785c] hover:bg-[#d97757] transition-colors cursor-pointer shadow-xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* 2-Column Metadata Grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {/* Row 1 */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                  FIRES AT
                </div>
                <div className="text-base text-white mt-1 font-normal">
                  {reminder.firesAt}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                  TIME ZONE
                </div>
                <div className="text-base text-white mt-1 font-normal">
                  {reminder.timeZone}
                </div>
              </div>

              {/* Row 2 */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                  RECIPIENT
                </div>
                <div className="text-base text-white mt-1 font-normal">
                  {reminder.recipient}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                  CHANNELS
                </div>
                <div className="text-base text-white mt-1 font-normal">
                  {reminder.channels.join(', ')}
                </div>
              </div>

              {/* Row 3 */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                  CREATED
                </div>
                <div className="text-base text-white mt-1 font-normal">
                  {reminder.createdAt}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                  COMPLETED
                </div>
                <div className="text-base text-white mt-1 font-normal">
                  {reminder.completedAt || '—'}
                </div>
              </div>

              {/* Row 4 */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                  IDENTIFIER
                </div>
                <div className="text-base text-[#c2bfb8] mt-1 font-normal">
                  {reminder.id}
                </div>
              </div>
              <div />
            </div>

            {/* Separator */}
            <div className="my-6 border-t border-[#2e2c29]" />

            {/* Recurrence Section */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
                RECURRENCE
              </div>
              <div className="text-base text-white mt-1 font-normal">
                {reminder.recurrence}
              </div>
              {!isPending && (
                <p className="text-sm text-[#8e8c87] mt-3 font-normal">
                  Delivered reminders are locked — reschedule by creating a new one.
                </p>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-3 mt-8">
              <button
                type="button"
                disabled={!isPending}
                onClick={() => {
                  if (isPending) {
                    onDelete(reminder.id)
                    handleModalClose()
                  }
                }}
                className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isPending
                    ? 'text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-900/50 border border-red-800/50 cursor-pointer'
                    : 'text-[#854444] bg-[#241717] border border-[#3a2020] cursor-not-allowed opacity-60'
                }`}
                title={!isPending ? 'Delivered reminders are locked' : undefined}
              >
                Delete
              </button>
              <button
                type="button"
                disabled={!isPending}
                onClick={() => {
                  if (isPending) {
                    handleStartEdit()
                  }
                }}
                className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isPending
                    ? 'text-white bg-[#cc785c] hover:bg-[#d97757] cursor-pointer shadow-xs'
                    : 'text-[#6e6b66] bg-[#22201e] border border-[#2e2c29] cursor-not-allowed opacity-50'
                }`}
                title={!isPending ? 'Delivered reminders are locked' : undefined}
              >
                Edit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

