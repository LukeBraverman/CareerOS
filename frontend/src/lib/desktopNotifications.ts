import type { TodayReminder } from '@/types/reminder'

const STORAGE_KEY = 'careeros_notified_reminder_ids_v1'
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export interface DesktopReminderPing {
  id: string
  reminderId: string
  icon: string
  title: string
  time: string
  important: boolean
  channels: string[]
  receivedAt: string
}

function loadNotifiedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((x): x is string => typeof x === 'string'))
    }
  } catch {
    // Ignore storage read errors
  }
  return new Set()
}

function saveNotifiedSet(ids: Set<string>): void {
  try {
    const arr = Array.from(ids).slice(-500)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Plays a pleasant two-tone notification chime using the Web Audio API.
 */
export function playNotificationChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now) // D5
    osc1.frequency.setValueAtTime(880, now + 0.12) // A5

    gain1.gain.setValueAtTime(0.001, now)
    gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.42)

    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.45)
  } catch {
    // AudioContext may be blocked before user interaction
  }
}

/**
 * Fires a native desktop OS notification via Web Notification API + local backend Windows Toast fallback.
 */
export async function fireNativeDesktopNotification(ping: DesktopReminderPing): Promise<void> {
  playNotificationChime()

  // 1. Browser / App-window native Notification API
  if ('Notification' in window) {
    try {
      if (Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      if (Notification.permission === 'granted') {
        new Notification(`${ping.icon} CareerOS Reminder (${ping.time})`, {
          body: ping.title,
          tag: `careeros-reminder-${ping.reminderId}`,
        })
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Local FastAPI Windows Toast helper (if available)
  try {
    await fetch(`${API_BASE}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `${ping.icon} CareerOS Reminder (${ping.time})`,
        message: ping.title,
      }),
    })
  } catch {
    // Optional endpoint
  }
}

/**
 * Compares the latest list of today's reminders against previously known statuses
 * and returns any newly delivered reminders that should trigger a desktop ping.
 */
export function detectNewReminderPings(
  latestReminders: TodayReminder[],
  previousStatusById: Map<string, string>,
  isFirstCheckOfSession: boolean
): DesktopReminderPing[] {
  const notifiedIds = loadNotifiedSet()
  const newPings: DesktopReminderPing[] = []
  const nowTimeStr = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

  for (const r of latestReminders) {
    const prevStatus = previousStatusById.get(r.id)
    previousStatusById.set(r.id, r.status)

    if (r.status === 'DELIVERED') {
      if (isFirstCheckOfSession && prevStatus === undefined) {
        // Seed already-delivered reminders on initial app boot so old reminders from hours ago don't spam
        notifiedIds.add(r.id)
        continue
      }

      if (!notifiedIds.has(r.id) || (prevStatus === 'PENDING' && r.status === 'DELIVERED')) {
        notifiedIds.add(r.id)
        newPings.push({
          id: `${r.id}-${Date.now()}`,
          reminderId: r.id,
          icon: r.icon || '🔔',
          title: r.title,
          time: r.time || nowTimeStr,
          important: Boolean(r.important),
          channels: r.channels || ['Slack', 'Desktop'],
          receivedAt: nowTimeStr,
        })
      }
    }
  }

  saveNotifiedSet(notifiedIds)
  return newPings
}
