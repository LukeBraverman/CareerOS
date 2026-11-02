import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  FileText,
} from 'lucide-react'
import { FULL_MONTH_NAMES, type FullMonthName } from '@/lib/api'
import { fetchMonthRemindersWithCache } from '@/lib/reminderCache'
import { parseDate } from '@/lib/date'
import type { SearchReminder } from '@/types/reminder'

interface ExportRemindersModalProps {
  isOpen: boolean
  onClose: () => void
  initialYear?: number
}

const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

export function ExportRemindersModal({
  isOpen,
  onClose,
  initialYear = 2026,
}: ExportRemindersModalProps) {
  const [fromMonth, setFromMonth] = useState<FullMonthName>(() => {
    const now = new Date()
    return FULL_MONTH_NAMES[now.getMonth()] || 'September'
  })
  const [fromYear, setFromYear] = useState<number>(initialYear)
  const [toMonth, setToMonth] = useState<FullMonthName>(() => {
    const now = new Date()
    return FULL_MONTH_NAMES[now.getMonth()] || 'September'
  })
  const [toYear, setToYear] = useState<number>(initialYear)

  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState<{
    current: number
    total: number
    currentMonthName: string
  } | null>(null)
  const [exportSuccess, setExportSuccess] = useState<{
    count: number
    filename: string
  } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Handle ESC key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose()
      }
    },
    [onClose, isExporting]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const fromMonthIndex = FULL_MONTH_NAMES.indexOf(fromMonth)
  const toMonthIndex = FULL_MONTH_NAMES.indexOf(toMonth)

  const startValue = fromYear * 12 + fromMonthIndex
  const endValue = toYear * 12 + toMonthIndex
  const isValidRange = startValue <= endValue
  const totalMonths = isValidRange ? endValue - startValue + 1 : 0

  // Quick preset helpers
  const handlePresetThisMonth = () => {
    const now = new Date()
    const currentMonthName = FULL_MONTH_NAMES[now.getMonth()] || 'September'
    setFromMonth(currentMonthName)
    setFromYear(initialYear)
    setToMonth(currentMonthName)
    setToYear(initialYear)
    setExportSuccess(null)
    setErrorMessage(null)
  }

  const handlePresetNext3Months = () => {
    const now = new Date()
    const currIdx = now.getMonth()
    setFromMonth(FULL_MONTH_NAMES[currIdx] || 'September')
    setFromYear(initialYear)

    const endIdx = (currIdx + 2) % 12
    const addedYears = Math.floor((currIdx + 2) / 12)
    setToMonth(FULL_MONTH_NAMES[endIdx])
    setToYear(initialYear + addedYears)
    setExportSuccess(null)
    setErrorMessage(null)
  }

  const handlePresetFullYear = () => {
    setFromMonth('January')
    setFromYear(initialYear)
    setToMonth('December')
    setToYear(initialYear)
    setExportSuccess(null)
    setErrorMessage(null)
  }

  const handleExport = async () => {
    if (!isValidRange || isExporting) return

    setIsExporting(true)
    setErrorMessage(null)
    setExportSuccess(null)

    try {
      const monthsToFetch: { year: number; month: FullMonthName }[] = []
      for (let v = startValue; v <= endValue; v++) {
        const y = Math.floor(v / 12)
        const mIdx = v % 12
        monthsToFetch.push({ year: y, month: FULL_MONTH_NAMES[mIdx] })
      }

      const allReminders: SearchReminder[] = []

      for (let i = 0; i < monthsToFetch.length; i++) {
        const { year, month } = monthsToFetch[i]
        setProgress({
          current: i + 1,
          total: monthsToFetch.length,
          currentMonthName: `${month} ${year}`,
        })

        // Sequentially query month reminders with caching to prevent API throttling
        const reminders = await fetchMonthRemindersWithCache(year, month)
        allReminders.push(...reminders)
      }

      // Chronological sort: earliest date & time first
      allReminders.sort((a, b) => {
        const dateA = parseDate(a.date)
        const dateB = parseDate(b.date)
        const timeA = dateA ? dateA.getTime() : 0
        const timeB = dateB ? dateB.getTime() : 0
        if (timeA !== timeB) return timeA - timeB
        return a.time.localeCompare(b.time)
      })

      // Generate structured markdown
      const mdLines: string[] = []
      mdLines.push('# MeInc Reminders Export')
      mdLines.push('')
      mdLines.push(
        `- **Exported:** ${new Date().toLocaleString('en-GB', {
          timeZone: 'Europe/London',
          dateStyle: 'full',
          timeStyle: 'medium',
        })} (Europe/London)`
      )
      mdLines.push(
        `- **Date Range:** ${fromMonth} ${fromYear} – ${toMonth} ${toYear}`
      )
      mdLines.push(`- **Months Queried:** ${monthsToFetch.length}`)
      mdLines.push(`- **Total Reminders:** ${allReminders.length}`)
      mdLines.push('')
      mdLines.push('---')
      mdLines.push('')

      if (allReminders.length === 0) {
        mdLines.push('*No reminders found for the selected time period.*')
        mdLines.push('')
      } else {
        // Group chronologically by Month
        const grouped = new Map<string, SearchReminder[]>()
        for (const r of allReminders) {
          const parsed = parseDate(r.date)
          const key = parsed
            ? `${FULL_MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`
            : 'Other'
          if (!grouped.has(key)) {
            grouped.set(key, [])
          }
          grouped.get(key)!.push(r)
        }

        for (const [monthHeader, group] of grouped.entries()) {
          mdLines.push(
            `## ${monthHeader} (${group.length} ${
              group.length === 1 ? 'reminder' : 'reminders'
            })`
          )
          mdLines.push('')

          for (const rem of group) {
            const icon = rem.icon || '🔔'
            mdLines.push(`### ${icon} ${rem.title}`)
            mdLines.push(
              `- **Fires At:** ${rem.firesAt || `${rem.date} ${rem.time}`}`
            )
            mdLines.push(
              `- **Time Zone:** ${rem.timeZone || 'Europe/London'}`
            )
            mdLines.push(`- **Status:** ${rem.status}`)
            mdLines.push(
              `- **Important:** ${rem.important ? 'Yes (High Priority)' : 'No'}`
            )
            mdLines.push(`- **Recipient:** ${rem.recipient || 'SYSTEM'}`)
            mdLines.push(
              `- **Channels:** ${
                rem.channels && rem.channels.length > 0
                  ? rem.channels.join(', ')
                  : 'Push'
              }`
            )
            mdLines.push(`- **Category / Tag:** ${rem.category || 'General'}`)
            mdLines.push(`- **Recurrence:** ${rem.recurrence || 'Once'}`)
            if (rem.createdAt && rem.createdAt !== '—') {
              mdLines.push(`- **Created:** ${rem.createdAt}`)
            }
            if (rem.completedAt && rem.completedAt !== '—') {
              mdLines.push(`- **Completed:** ${rem.completedAt}`)
            }
            mdLines.push(`- **ID:** \`${rem.id}\``)
            if (rem.metadata && Object.keys(rem.metadata).length > 0) {
              mdLines.push(`- **Metadata:**`)
              for (const [k, v] of Object.entries(rem.metadata)) {
                mdLines.push(`  - \`${k}\`: ${v}`)
              }
            }
            mdLines.push('')
          }

          mdLines.push('---')
          mdLines.push('')
        }
      }

      const markdownContent = mdLines.join('\n')
      const blob = new Blob([markdownContent], {
        type: 'text/markdown;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const filename = `meinc-reminders_${fromYear}-${String(
        fromMonthIndex + 1
      ).padStart(2, '0')}_to_${toYear}-${String(toMonthIndex + 1).padStart(
        2,
        '0'
      )}.md`
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExportSuccess({
        count: allReminders.length,
        filename,
      })
    } catch (err) {
      console.error('Failed to export reminders:', err)
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred during export.'
      )
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={isExporting ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div
        className="relative w-full max-w-lg bg-[#1b1a18] border border-[#2e2c29] rounded-2xl shadow-2xl p-6 sm:p-7 text-[#f0ede6] animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#cc785c]/15 border border-[#cc785c]/30 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-[#cc785c]" />
            </div>
            <div>
              <h2
                id="export-modal-title"
                className="text-lg font-bold text-white tracking-tight"
              >
                Export Reminders
              </h2>
              <p className="text-xs text-[#8e8c87] mt-0.5">
                Download reminders as a Markdown (.md) document
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#252320] transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Range Presets */}
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-2">
            Quick Ranges
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={handlePresetThisMonth}
              className="px-3 py-1.5 rounded-xl text-xs font-medium border border-[#353330] bg-[#262422] text-[#e0ded8] hover:bg-[#302e2a] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              This month
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={handlePresetNext3Months}
              className="px-3 py-1.5 rounded-xl text-xs font-medium border border-[#353330] bg-[#262422] text-[#e0ded8] hover:bg-[#302e2a] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              Next 3 months
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={handlePresetFullYear}
              className="px-3 py-1.5 rounded-xl text-xs font-medium border border-[#353330] bg-[#262422] text-[#e0ded8] hover:bg-[#302e2a] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              Full year ({initialYear})
            </button>
          </div>
        </div>

        {/* Date Range Selection Card */}
        <div className="rounded-xl border border-[#2e2c29] bg-[#22201e]/60 p-4 space-y-4 mb-5">
          {/* From row */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#cc785c]" />
              <span>From Month & Year</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <select
                disabled={isExporting}
                value={fromMonth}
                onChange={(e) => {
                  setFromMonth(e.target.value as FullMonthName)
                  setExportSuccess(null)
                  setErrorMessage(null)
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#1a1917] text-sm text-white focus:outline-hidden focus:border-[#cc785c] transition-colors cursor-pointer disabled:opacity-40"
              >
                {FULL_MONTH_NAMES.map((m) => (
                  <option key={`from-${m}`} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                disabled={isExporting}
                value={fromYear}
                onChange={(e) => {
                  setFromYear(parseInt(e.target.value, 10))
                  setExportSuccess(null)
                  setErrorMessage(null)
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#1a1917] text-sm text-white focus:outline-hidden focus:border-[#cc785c] transition-colors cursor-pointer disabled:opacity-40"
              >
                {AVAILABLE_YEARS.map((y) => (
                  <option key={`from-year-${y}`} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* To row */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#cc785c]" />
              <span>To Month & Year</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <select
                disabled={isExporting}
                value={toMonth}
                onChange={(e) => {
                  setToMonth(e.target.value as FullMonthName)
                  setExportSuccess(null)
                  setErrorMessage(null)
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#1a1917] text-sm text-white focus:outline-hidden focus:border-[#cc785c] transition-colors cursor-pointer disabled:opacity-40"
              >
                {FULL_MONTH_NAMES.map((m) => (
                  <option key={`to-${m}`} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                disabled={isExporting}
                value={toYear}
                onChange={(e) => {
                  setToYear(parseInt(e.target.value, 10))
                  setExportSuccess(null)
                  setErrorMessage(null)
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#1a1917] text-sm text-white focus:outline-hidden focus:border-[#cc785c] transition-colors cursor-pointer disabled:opacity-40"
              >
                {AVAILABLE_YEARS.map((y) => (
                  <option key={`to-year-${y}`} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Range summary helper */}
          {isValidRange ? (
            <div className="text-xs text-[#8e8c87] pt-1">
              Exporting{' '}
              <span className="text-[#e0ded8] font-semibold">
                {totalMonths} {totalMonths === 1 ? 'month' : 'months'}
              </span>{' '}
              ({fromMonth} {fromYear} – {toMonth} {toYear}).
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                The "From" date must be earlier than or equal to the "To" date.
              </span>
            </div>
          )}
        </div>

        {/* Active Export Progress */}
        {isExporting && progress && (
          <div className="rounded-xl border border-[#2e2c29] bg-[#22201e] p-4 space-y-2.5 mb-5">
            <div className="flex items-center justify-between text-xs text-[#8e8c87]">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-[#cc785c] animate-spin" />
                <span>Fetching {progress.currentMonthName}...</span>
              </span>
              <span className="font-mono text-[#e0ded8]">
                {progress.current} of {progress.total}
              </span>
            </div>
            <div className="w-full h-2 bg-[#1a1917] rounded-full overflow-hidden border border-[#2e2c29]">
              <div
                className="h-full bg-[#cc785c] transition-all duration-300 rounded-full"
                style={{
                  width: `${Math.round(
                    (progress.current / progress.total) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2 mb-5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success message */}
        {exportSuccess && (
          <div className="p-3.5 rounded-xl bg-[#222d22] border border-[#3e603e] text-[#c4e3c4] text-xs space-y-1 mb-5">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Export downloaded successfully!</span>
            </div>
            <div className="text-[11px] text-[#a0c5a0] pl-6">
              Saved {exportSuccess.count}{' '}
              {exportSuccess.count === 1 ? 'reminder' : 'reminders'} to{' '}
              <span className="font-mono text-white">
                {exportSuccess.filename}
              </span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#8e8c87] hover:text-white bg-[#22201e] hover:bg-[#2a2825] border border-[#2e2c29] transition-colors cursor-pointer disabled:opacity-40"
          >
            {exportSuccess ? 'Close' : 'Cancel'}
          </button>

          <button
            type="button"
            disabled={!isValidRange || isExporting}
            onClick={handleExport}
            className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-[#cc785c] hover:bg-[#d97757] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>Export to Markdown</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
