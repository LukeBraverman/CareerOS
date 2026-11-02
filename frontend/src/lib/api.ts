/**
 * API client for MeInc Reminder Service (v2).
 */

export type BackendRecurrenceType =
  | 'SINGLE'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'YEARLY'

export type MonthlyMode = 'SAME_DAY' | 'END_OF_MONTH'

export interface CreateReminderPayload {
  id?: string
  message: string
  recipient: string
  triggerAt: string // RFC3339 timestamp
  recurrence: {
    type: BackendRecurrenceType
    daysOfWeek?: string[]
    monthlyMode?: MonthlyMode
    intervalMonths?: number
  }
  channels?: string[]
  notificationChannels?: string[]
  emoji?: string
  important: boolean
  timeZone: string
  metadata?: Record<string, string>
}

export interface BackendReminder {
  id: string
  createdAt: string
  triggerAt: string
  completedAt?: string
  status: 'PENDING' | 'DELIVERED' | 'CANCELLED' | 'FAILED'
  channels: string[] | null
  recurrence: {
    type: string
    daysOfWeek?: string[]
    monthlyMode?: MonthlyMode
    intervalMonths?: number
  }
  emoji?: string
  message: string
  important: boolean
  recipient: string
  timeZone: string
  metadata?: Record<string, string>
}

const DEFAULT_API_BASE_URL =
  'https://qlo1o6mkkg.execute-api.eu-west-2.amazonaws.com'

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  return DEFAULT_API_BASE_URL
}

/**
 * Creates a new reminder via POST /v2/reminder.
 */
export async function createReminder(
  payload: CreateReminderPayload
): Promise<BackendReminder> {
  const baseUrl = getApiBaseUrl()
  const endpoint = `${baseUrl}/v2/reminder`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (netErr) {
    const errorMsg =
      netErr instanceof Error
        ? netErr.message
        : 'Network error communicating with reminder service'
    throw new Error(`Connection error: ${errorMsg}`)
  }

  if (!response.ok) {
    let errorDetail = ''
    try {
      const errJson = await response.json()
      if (errJson && typeof errJson === 'object') {
        if (typeof errJson.message === 'string') {
          errorDetail = errJson.message
        } else if (typeof errJson.error === 'string') {
          errorDetail = errJson.error
        } else {
          errorDetail = JSON.stringify(errJson)
        }
      }
    } catch {
      errorDetail = response.statusText || `HTTP ${response.status}`
    }

    // Enhance common validation errors for friendly UI display
    if (errorDetail.includes('triggerAt is before now')) {
      errorDetail =
        'The reminder time cannot be in the past. Please select a future date and time.'
    }

    throw new Error(
      errorDetail || `Failed to create reminder (${response.status})`
    )
  }

  return response.json() as Promise<BackendReminder>
}

export const FULL_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export type FullMonthName = (typeof FULL_MONTH_NAMES)[number]

/**
 * Fetches reminders for a specific month and year via GET /v2/reminder?year={year}&month={monthName}.
 */
export async function getRemindersForMonth(
  year: number,
  month: string
): Promise<BackendReminder[]> {
  const baseUrl = getApiBaseUrl()
  const endpoint = `${baseUrl}/v2/reminder?year=${year}&month=${encodeURIComponent(month)}`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (netErr) {
    const errorMsg =
      netErr instanceof Error
        ? netErr.message
        : 'Network error communicating with reminder service'
    throw new Error(`Connection error fetching reminders for ${month} ${year}: ${errorMsg}`)
  }

  if (!response.ok) {
    let errorDetail = ''
    try {
      const errJson = await response.json()
      errorDetail =
        errJson?.message || errJson?.error || JSON.stringify(errJson)
    } catch {
      errorDetail = response.statusText || `HTTP ${response.status}`
    }
    throw new Error(`Failed to fetch reminders for ${month} ${year}: ${errorDetail}`)
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    return []
  }
  return data as BackendReminder[]
}

/**
 * Fetches all reminders for an entire year by querying each of the 12 months sequentially.
 * Sequential querying prevents AWS API Gateway / Lambda 503 throttling caused by 12 concurrent bursts.
 */
export async function getRemindersForYear(
  year: number
): Promise<BackendReminder[]> {
  const allReminders: BackendReminder[] = []
  for (const month of FULL_MONTH_NAMES) {
    const monthlyReminders = await getRemindersForMonth(year, month)
    allReminders.push(...monthlyReminders)
  }
  return allReminders
}

/**
 * Deletes a reminder by ID via DELETE /v2/reminder/{id}.
 */
export async function deleteReminder(id: string): Promise<void> {
  const baseUrl = getApiBaseUrl()
  const endpoint = `${baseUrl}/v2/reminder/${encodeURIComponent(id)}`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'DELETE',
    })
  } catch (netErr) {
    const errorMsg =
      netErr instanceof Error
        ? netErr.message
        : 'Network error communicating with reminder service'
    throw new Error(`Connection error deleting reminder: ${errorMsg}`)
  }

  if (!response.ok && response.status !== 204 && response.status !== 404) {
    let errorDetail = ''
    try {
      const errJson = await response.json()
      errorDetail = errJson?.message || errJson?.error || JSON.stringify(errJson)
    } catch {
      errorDetail = response.statusText || `HTTP ${response.status}`
    }
    throw new Error(errorDetail || `Failed to delete reminder (${response.status})`)
  }
}

export interface UpdateReminderPayload {
  message: string
  recipient: string
  triggerAt: string // RFC3339 timestamp
  recurrence?: {
    type: BackendRecurrenceType
    daysOfWeek?: string[]
    monthlyMode?: MonthlyMode
    intervalMonths?: number
  }
  channels?: string[]
  notificationChannels?: string[]
  emoji?: string
  important?: boolean
  status?: 'PENDING' | 'DELIVERED' | 'CANCELLED' | 'FAILED'
  timeZone?: string
  metadata?: Record<string, string>
}

/**
 * Updates an existing reminder via PUT /v2/reminder/{id}.
 */
export async function updateReminder(
  id: string,
  payload: UpdateReminderPayload
): Promise<BackendReminder> {
  const baseUrl = getApiBaseUrl()
  const endpoint = `${baseUrl}/v2/reminder/${encodeURIComponent(id)}`

  const channels = payload.channels || payload.notificationChannels || []
  const body = {
    ...payload,
    channels,
    notificationChannels: channels,
  }

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (netErr) {
    const errorMsg =
      netErr instanceof Error
        ? netErr.message
        : 'Network error communicating with reminder service'
    throw new Error(`Connection error updating reminder: ${errorMsg}`)
  }

  if (!response.ok) {
    let errorDetail = ''
    try {
      const errJson = await response.json()
      errorDetail = errJson?.message || errJson?.error || JSON.stringify(errJson)
    } catch {
      errorDetail = response.statusText || `HTTP ${response.status}`
    }

    if (errorDetail.includes('triggerAt is before now') || errorDetail.includes('trigger time cannot be in the past')) {
      errorDetail =
        'The reminder time cannot be in the past. Please select a future date and time.'
    }

    throw new Error(errorDetail || `Failed to update reminder (${response.status})`)
  }

  return response.json() as Promise<BackendReminder>
}

/**
 * Fetches a single reminder by ID via GET /v2/reminder/{id}.
 */
export async function getReminderById(id: string): Promise<BackendReminder> {
  const baseUrl = getApiBaseUrl()
  const endpoint = `${baseUrl}/v2/reminder/${encodeURIComponent(id)}`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (netErr) {
    const errorMsg =
      netErr instanceof Error
        ? netErr.message
        : 'Network error communicating with reminder service'
    throw new Error(`Connection error fetching reminder: ${errorMsg}`)
  }

  if (!response.ok) {
    let errorDetail = ''
    try {
      const errJson = await response.json()
      errorDetail = errJson?.message || errJson?.error || JSON.stringify(errJson)
    } catch {
      errorDetail = response.statusText || `HTTP ${response.status}`
    }
    throw new Error(errorDetail || `Failed to fetch reminder (${response.status})`)
  }

  return response.json() as Promise<BackendReminder>
}

export interface ExportToNotionResponse {
  status: string
  exportedCount: number
  exportedAt: string
}

/**
 * Triggers a full refresh of pending reminders on the Notion Reminders page via POST /v2/reminder/export-notion.
 */
export async function exportRemindersToNotion(): Promise<ExportToNotionResponse> {
  const baseUrl = getApiBaseUrl()
  const endpoint = `${baseUrl}/v2/reminder/export-notion`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (netErr) {
    const errorMsg =
      netErr instanceof Error
        ? netErr.message
        : 'Network error communicating with reminder service'
    throw new Error(`Connection error exporting to Notion: ${errorMsg}`)
  }

  if (!response.ok) {
    let errorDetail = ''
    try {
      const errJson = await response.json()
      errorDetail =
        errJson?.message || errJson?.error || JSON.stringify(errJson)
    } catch {
      errorDetail = response.statusText || `HTTP ${response.status}`
    }
    throw new Error(
      errorDetail || `Failed to export reminders to Notion (${response.status})`
    )
  }

  return response.json() as Promise<ExportToNotionResponse>
}

