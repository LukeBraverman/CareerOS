import { Bell, X, AlertCircle, Clock } from 'lucide-react'
import type { DesktopReminderPing } from '@/lib/desktopNotifications'

interface DesktopNotificationToastsProps {
  pings: DesktopReminderPing[]
  onDismiss: (id: string) => void
  onDismissAll: () => void
}

export function DesktopNotificationToasts({
  pings,
  onDismiss,
  onDismissAll,
}: DesktopNotificationToastsProps) {
  if (pings.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 z-50 w-full max-w-sm space-y-2.5 pointer-events-none"
      role="region"
      aria-label="Desktop reminder notifications"
    >
      {pings.length > 1 && (
        <div className="flex justify-end pointer-events-auto">
          <button
            type="button"
            onClick={onDismissAll}
            className="px-2.5 py-1 rounded-lg bg-[#1b1a18]/95 border border-[#2e2c29] text-[11px] font-medium text-[#8e8c87] hover:text-white transition-colors shadow-lg cursor-pointer"
          >
            Clear all ({pings.length})
          </button>
        </div>
      )}

      {pings.map((ping) => (
        <div
          key={ping.id}
          className={`pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-md transition-all animate-in slide-in-from-right duration-200 ${
            ping.important
              ? 'bg-[#221916]/95 border-[#cc785c]'
              : 'bg-[#1b1a18]/95 border-[#383531]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#262422] border border-[#383531] flex items-center justify-center text-xl shrink-0">
                {ping.icon}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#cc785c]">
                    <Bell className="w-3 h-3" />
                    Reminder Ping
                  </span>
                  {ping.important && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#cc785c]/20 text-[10px] font-semibold text-[#e69a80]">
                      <AlertCircle className="w-2.5 h-2.5" />
                      Important
                    </span>
                  )}
                </div>

                <p className="text-sm font-semibold text-white mt-1 leading-snug break-words">
                  {ping.title}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-mono text-[#8e8c87]">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#cc785c]" />
                    {ping.time}
                  </span>
                  <span>·</span>
                  <span>Sent to Slack & Desktop</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(ping.id)}
              className="p-1 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#2e2c29] transition-colors cursor-pointer shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
