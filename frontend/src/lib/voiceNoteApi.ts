import type {
  SystemStatus,
  TranscriptionProgress,
  VoiceNoteJob,
  WhisperModelSize,
} from '@/types/voiceNote'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/api/status`)
  if (!res.ok) {
    throw new Error(`Failed to fetch system status (${res.status})`)
  }
  return res.json()
}

export async function fetchVoiceNoteHistory(): Promise<VoiceNoteJob[]> {
  const res = await fetch(`${API_BASE}/api/history`)
  if (!res.ok) {
    throw new Error(`Failed to load transcription history (${res.status})`)
  }
  return res.json()
}

export async function updateVoiceNoteJob(
  jobId: string,
  payload: { title?: string; speakerNames?: Record<string, string> }
): Promise<VoiceNoteJob> {
  const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Failed to update voice note (${res.status})`)
  }
  return res.json()
}

export async function deleteVoiceNoteJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(`Failed to delete voice note (${res.status})`)
  }
}

export function getAudioUrl(jobId: string): string {
  return `${API_BASE}/api/audio/${encodeURIComponent(jobId)}`
}

export function getTranscriptDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/transcript/${encodeURIComponent(jobId)}/download`
}

export async function streamTranscribeVoiceNote(options: {
  file: File
  model: WhisperModelSize
  diarize: boolean
  onProgress: (progress: TranscriptionProgress) => void
}): Promise<VoiceNoteJob> {
  const formData = new FormData()
  formData.append('file', options.file)
  formData.append('model', options.model)
  formData.append('diarize', String(options.diarize))

  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Transcription request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalJob: VoiceNoteJob | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''

    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data:')) continue
      const jsonStr = line.replace(/^data:\s*/, '')
      if (!jsonStr) continue

      const event = JSON.parse(jsonStr) as
        | ({ type: 'progress' } & TranscriptionProgress)
        | { type: 'result'; job: VoiceNoteJob }
        | { type: 'error'; message: string }

      if (event.type === 'progress') {
        options.onProgress({
          stage: event.stage,
          message: event.message,
          percent: event.percent,
          elapsedSeconds: event.elapsedSeconds,
          durationSeconds: event.durationSeconds,
        })
      } else if (event.type === 'result') {
        finalJob = event.job
      } else if (event.type === 'error') {
        throw new Error(event.message || 'Transcription failed')
      }
    }
  }

  if (!finalJob) {
    throw new Error('Transcription stream ended without returning a result.')
  }

  return finalJob
}

export function buildAiMeetingPrompt(job: VoiceNoteJob): string {
  return `I have a meeting voice note ("${job.title}") that I have transcribed offline with speaker diarization.

Please analyze the transcript below with a focus on:
- **Executive Summary**: A concise 2–3 paragraph overview of the meeting.
- **Participant Breakdown & Stances**: Who attended, what their core perspective was, what they wanted, and what they advocated for or pushed back on.
- **What Was Agreed / Key Decisions Made**: Explicit agreements, consensus points, and resolved debates.
- **Open Questions / Disagreements**: Any unresolved points, tensions, or things deferred to future discussions.
- **Next Steps & Action Items**: Clear, bulleted action items with assigned owners and deadlines (where stated).

Also create the pages in Notion under my "Transcripts" section:
- Create a parent page titled with the meeting name/date ("${job.title}").
- Under it, create two child pages:
  a) **"Meeting Analysis & Action Items"**: Formatted cleanly with headers, tables, callout blocks, and the structured breakdown above.
  b) **"Raw Transcript"**: The full speaker-attributed transcript formatted in readable paragraphs.

---
### Transcript (${job.fileName} · ${job.durationFormatted})

\`\`\`text
${job.rawTranscript.trim()}
\`\`\`
`
}
