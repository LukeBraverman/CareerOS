export type RitualTag = 'travel' | 'culture'

export interface Ritual {
  id: string
  tag: 'TRAVEL' | 'CULTURE' | string
  title: string
  description?: string
  emoji: string
  createdAt?: string
}

export interface CreateRitualPayload {
  id?: string
  tag: string
  title: string
  description?: string
  emoji: string
}

export interface UpdateRitualPayload {
  title: string
  description?: string
  emoji: string
}
