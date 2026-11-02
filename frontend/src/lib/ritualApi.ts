import { getApiBaseUrl } from '@/lib/api'
import type {
  Ritual,
  RitualTag,
  CreateRitualPayload,
  UpdateRitualPayload,
} from '@/types/ritual'

export async function fetchRituals(tag: RitualTag): Promise<Ritual[]> {
  const baseUrl = getApiBaseUrl()
  const response = await fetch(
    `${baseUrl}/v2/ritual?tag=${encodeURIComponent(tag.toLowerCase())}`
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch rituals: HTTP ${response.status}`)
  }
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export async function createRitual(
  payload: CreateRitualPayload
): Promise<Ritual> {
  const baseUrl = getApiBaseUrl()
  const response = await fetch(`${baseUrl}/v2/ritual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      tag: payload.tag.toLowerCase(),
    }),
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Failed to create ritual: HTTP ${response.status} ${errorText}`
    )
  }
  return response.json()
}

export async function updateRitual(
  tag: string,
  id: string,
  payload: UpdateRitualPayload
): Promise<Ritual> {
  const baseUrl = getApiBaseUrl()
  const response = await fetch(
    `${baseUrl}/v2/ritual/${encodeURIComponent(tag.toLowerCase())}/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Failed to update ritual: HTTP ${response.status} ${errorText}`
    )
  }
  return response.json()
}

export async function deleteRitual(tag: string, id: string): Promise<void> {
  const baseUrl = getApiBaseUrl()
  const response = await fetch(
    `${baseUrl}/v2/ritual/${encodeURIComponent(tag.toLowerCase())}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  )
  if (!response.ok && response.status !== 204 && response.status !== 404) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Failed to delete ritual: HTTP ${response.status} ${errorText}`
    )
  }
}
