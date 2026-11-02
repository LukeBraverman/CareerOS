import type { TodayReminder } from '@/types/reminder'

const STORAGE_KEY = 'careeros_notified_reminder_ids_v1'
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const DEFAULT_TITLE = 'CareerOS — Desktop Suite'

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
 * Dynamically draws the CareerOS app icon (64x64) with an optional red unread notification badge
 * and updates the window/taskbar icon, Web Badging API, and document title.
 */
export function updateDesktopAppBadge(unreadCount: number): void {
  try {
    // 1. Update document title
    if (unreadCount > 0) {
      document.title = `🔴 (${unreadCount}) Reminder — CareerOS`
    } else {
      document.title = DEFAULT_TITLE
    }

    // 2. Web App Badging API (supported by Edge/Chrome --app mode on Windows)
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (unreadCount > 0 && typeof nav.setAppBadge === 'function') {
      void nav.setAppBadge(unreadCount).catch(() => {})
    } else if (unreadCount === 0 && typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge().catch(() => {})
    }

    // 3. Draw dynamic 64x64 Canvas icon with red unread badge dot/count
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Base terracotta rounded square (#cc785c)
    ctx.fillStyle = '#cc785c'
    ctx.beginPath()
    ctx.roundRect(4, 4, 56, 56, 14)
    ctx.fill()

    // Inner subtle glyph ("C")
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 34px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('C', 32, 34)

    // If unread reminders exist, draw a prominent red notification badge in top-right corner
    if (unreadCount > 0) {
      const badgeRadius = 15
      const cx = 48
      const cy = 16

      // Dark outer ring for contrast
      ctx.fillStyle = '#141413'
      ctx.beginPath()
      ctx.arc(cx, cy, badgeRadius + 3, 0, Math.PI * 2)
      ctx.fill()

      // Bright red badge circle
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(cx, cy, badgeRadius, 0, Math.PI * 2)
      ctx.fill()

      // Badge count number
      const label = unreadCount > 9 ? '9+' : String(unreadCount)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, cx, cy + 1)
    }

    const dataUrl = canvas.toDataURL('image/png')
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.type = 'image/png'
    link.href = dataUrl
  } catch {
    // Ignore canvas/DOM errors
  }
}

/**
 * Plays a pleasant two-tone notification chime using the Web Audio API.
 */
export function playNotificationChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
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
 * Fires a native desktop OS notification + flashes the Windows Taskbar icon until clicked.
 */
export async function fireNativeDesktopNotification(
  ping: DesktopReminderPing
): Promise<void> {
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

  // 2. Local FastAPI Windows Toast + Taskbar Flash (FLASHW_TIMERNOFG highlights taskbar icon until clicked)
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

      if (
        !notifiedIds.has(r.id) ||
        (prevStatus === 'PENDING' && r.status === 'DELIVERED')
      ) {
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
