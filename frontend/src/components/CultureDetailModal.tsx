import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, AlertCircle, Loader2 } from 'lucide-react'
import { type CultureReminder } from '@/types/culture'
import type { SearchReminder, ReminderCategory } from '@/types/reminder'
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
  formatDayDisplay,
  formatFullDateTime,
  formatToRFC3339,
  getLondonTime,
} from '@/lib/date'
import { DatePicker } from '@/components/DatePicker'
import { TimePicker } from '@/components/TimePicker'
import { PRESET_EMOJIS } from '@/lib/emojiData'

interface CultureDetailModalProps {
  reminder: CultureReminder | null
  isOpen: boolean
  onClose: () => void
  onUpdateReminder?: (updated: CultureReminder) => void
  onDeleteReminder?: (id: string) => void
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

export function CultureDetailModal({
  reminder,
  isOpen,
  onClose,
  onUpdateReminder,
  onDeleteReminder,
}: CultureDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editEmoji, setEditEmoji] = useState('🎟️')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('09:00')
  const [editRecipient, setEditRecipient] = useState('')
  const [editChannels, setEditChannels] = useState<string[]>(['Slack'])
  const [editTag, setEditTag] = useState<string>('Culture')
  const [editRecurrence, setEditRecurrence] = useState('Once')
  const [editDaysOfWeek, setEditDaysOfWeek] = useState<string[]>(['MON'])
  const [editMonthlyMode, setEditMonthlyMode] = useState<MonthlyMode>('SAME_DAY')
  const [editIntervalMonths, setEditIntervalMonths] = useState<number>(1)
  const [editImportant, setEditImportant] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleModalClose = useCallback(() => {
    setIsEditing(false)
    setSaveError(null)
    onClose()
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleModalClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
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

  const handleStartEdit = () => {
    setEditTitle(reminder.title)
    setEditEmoji(reminder.icon || '🎟️')
    setEditDate(reminder.date || formatDate(new Date()))
    setEditTime(reminder.time || '09:00')
    setEditRecipient(reminder.recipient || 'SYSTEM')

    const channels =
      reminder.channels && reminder.channels.length > 0
        ? reminder.channels
            .map(normalizeChannelName)
            .filter((c) => (AVAILABLE_CHANNELS as readonly string[]).includes(c))
        : ['Slack']
    setEditChannels(channels.length > 0 ? channels : ['Slack'])

    const rawTag =
      reminder.metadata?.tag ||
      reminder.metadata?.category ||
      reminder.category ||
      ''
    const lower = rawTag.toLowerCase()
    const normalizedTag =
      lower === 'travel' ? 'Travel' : lower === 'culture' ? 'Culture' : 'General'
    setEditTag(normalizedTag)

    const rawRec = reminder.recurrence || 'Once'
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
              : 'Once'
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
      const parsed = parseDate(reminder.date)
      const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
      const defaultDay = parsed ? dayNames[parsed.getDay()] : 'MON'
      setEditDaysOfWeek([defaultDay])
    }

    setEditImportant(Boolean(reminder.important))
    setSaveError(null)
    setIsEditing(true)
  }

  const handleToggleChannel = (ch: string) => {
    setEditChannels((prev) => {
      const exists = prev.some((c) => c.toUpperCase() === ch.toUpperCase())
      if (exists) {
        if (prev.length <= 1) return prev
        return prev.filter((c) => c.toUpperCase() !== ch.toUpperCase())
      } else {
        return [...prev, ch]
      }
    })
  }

  const handleSaveEdit = async () => {
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

      const y = parsedDate.getFullYear()
      const m = String(parsedDate.getMonth() + 1).padStart(2, '0')
      const d = String(parsedDate.getDate()).padStart(2, '0')
      const isoDate = `${y}-${m}-${d}`
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

      const updatedCulture: CultureReminder = {
        ...reminder,
        date: editDate,
        isoDate,
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
        monthIndex: parsedDate.getMonth(),
        metadata: {
          ...reminder.metadata,
          tag: editTag.toLowerCase() === 'general' ? 'general' : editTag,
        },
      }

      // Update frontend shared cache
      const searchItem: SearchReminder = {
        ...updatedCulture,
        category: (editTag.toLowerCase() === 'travel'
          ? 'Travel'
          : editTag.toLowerCase() === 'culture'
            ? 'Culture'
            : 'General') as ReminderCategory,
      }
      updateReminderInCache(searchItem)

      if (onUpdateReminder) {
        onUpdateReminder(updatedCulture)
      }

      setIsEditing(false)
    } catch (err) {
      console.error('Failed to update culture reminder:', err)
      setSaveError(
        err instanceof Error ? err.message : 'Failed to update reminder'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = () => {
    if (!isPending) return
    if (onDeleteReminder) {
      onDeleteReminder(reminder.id)
      onClose()
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={handleModalClose}
        aria-hidden="true"
      />

      {/* Modal Card matching 19_3.png */}
      <div className="relative w-full max-w-lg rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-6 text-white shadow-2xl z-10 animate-in zoom-in-95 duration-200 space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header: Icon + Title + Badges + Close button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span className="text-2xl shrink-0 mt-0.5" role="img">
              {isEditing ? editEmoji : reminder.icon}
            </span>

            <div className="min-w-0 flex-1 space-y-2">
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
                    className="w-full text-base font-bold bg-[#161514] border border-[#cc785c] rounded-xl px-3 py-2 text-white focus:outline-hidden"
                    autoFocus
                  />
                </div>
              ) : (
                <h2 className="text-xl font-bold tracking-tight text-white leading-snug">
                  {reminder.title}
                </h2>
              )}

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Badge */}
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold font-mono tracking-wider uppercase ${
                    isPending
                      ? 'bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c]/30'
                      : 'bg-[#252320] text-[#a8a59f] border border-[#353330]'
                  }`}
                >
                  {reminder.status}
                </span>

                {/* Category Pill */}
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#252320] text-[#c2bfb8] border border-[#353330]">
                  {isEditing ? editTag : reminder.category}
                </span>

                {/* Important Badge */}
                {reminder.important && !isEditing && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#cc785c]/15 text-[#d97757] border border-[#cc785c]/30">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>IMPORTANT</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleModalClose}
            className="p-1.5 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#252320] border border-[#2e2c29] transition-colors cursor-pointer shrink-0"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {saveError && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Edit Form or Read-only metadata */}
        {isEditing ? (
          <div className="space-y-4 pt-2 border-t border-[#2e2c29]">
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
                  id="culture-edit-date"
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
                  inputClassName={`w-full px-3.5 py-2 rounded-xl border bg-[#161514] text-sm text-white focus:outline-hidden transition-colors ${
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
                  id="culture-edit-time"
                  value={editTime}
                  selectedDate={editDate}
                  disablePast={true}
                  onChange={(val) => {
                    setEditTime(val)
                    setSaveError(null)
                  }}
                  placeholder="09:00"
                  className="w-full"
                  inputClassName={`w-full px-3.5 py-2 rounded-xl border bg-[#161514] text-sm text-white focus:outline-hidden transition-colors ${
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
                  {(['SYSTEM', 'LUKE', 'ANA'] as const).map((rec) => {
                    const isSelected = editRecipient === rec
                    return (
                      <button
                        key={rec}
                        type="button"
                        onClick={() => setEditRecipient(rec)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                          isSelected
                            ? 'bg-[#cc785c] border-[#cc785c] text-white font-semibold shadow-xs'
                            : 'bg-[#161514] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#252320]'
                        }`}
                      >
                        {rec}
                      </button>
                    )
                  })}
                </div>
                <input
                  type="text"
                  value={editRecipient}
                  onChange={(e) => setEditRecipient(e.target.value)}
                  placeholder="Or enter custom recipient..."
                  className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#161514] text-sm text-white focus:outline-hidden focus:border-[#cc785c]"
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
                          : 'bg-[#161514] border-[#2e2c29] text-[#c2bfb8] hover:text-white hover:bg-[#252320]'
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
                          : 'bg-[#161514] border-[#2e2c29] text-[#8e8c87] hover:text-white hover:bg-[#252320]'
                      }`}
                    >
                      {ch}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Recurrence and Importance */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                  Recurrence
                </label>
                <select
                  value={editRecurrence}
                  onChange={(e) => setEditRecurrence(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#161514] text-sm text-white focus:outline-hidden focus:border-[#cc785c] cursor-pointer"
                >
                  <option value="Once">Once</option>
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
                      : 'bg-[#161514] border-[#2e2c29] text-[#c2bfb8] hover:text-white'
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
          </div>
        ) : (
          <>
            {/* 2-Column Metadata Grid matching 19_3.png */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-2 border-t border-[#2e2c29] text-xs">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8c87]">
                  FIRES AT
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {reminder.firesAt}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8c87]">
                  TIME ZONE
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {reminder.timeZone}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8c87]">
                  RECIPIENT
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {reminder.recipient}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8c87]">
                  CHANNELS
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {reminder.channels.join(', ')}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8c87]">
                  CREATED
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {reminder.createdAt}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8c87]">
                  COMPLETED
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {reminder.completedAt || '—'}
                </div>
              </div>
            </div>

            {/* Recurrence Section */}
            <div className="pt-2 border-t border-[#2e2c29]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8c87]">
                RECURRENCE
              </div>
              <div className="mt-1 text-sm text-white font-medium">
                {reminder.recurrence}
              </div>
            </div>

            {/* Lock note or pending note */}
            {!isPending && (
              <p className="text-xs text-[#8e8c87]">
                Delivered reminders are locked — reschedule by creating a new one.
              </p>
            )}
          </>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#2e2c29]">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl border border-[#2e2c29] bg-[#252320] text-xs font-medium text-[#c2bfb8] hover:text-white cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving || !editTitle.trim() || isTimeInPast}
                className="px-4 py-2 rounded-xl bg-[#cc785c] hover:bg-[#d97757] text-white text-xs font-medium cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save changes</span>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!isPending}
                className={`px-4 py-2 rounded-xl border text-xs font-medium transition-colors ${
                  isPending
                    ? 'border-rose-900/60 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 cursor-pointer'
                    : 'border-[#2e2c29] bg-[#252320]/50 text-[#5e5b55] cursor-not-allowed'
                }`}
              >
                Delete
              </button>

              <button
                type="button"
                onClick={handleStartEdit}
                disabled={!isPending}
                className={`px-4 py-2 rounded-xl border text-xs font-medium transition-colors ${
                  isPending
                    ? 'border-[#383531] bg-[#2e2c29] text-white hover:bg-[#383531] cursor-pointer'
                    : 'border-[#2e2c29] bg-[#252320]/50 text-[#5e5b55] cursor-not-allowed'
                }`}
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

