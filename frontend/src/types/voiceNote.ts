export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3'

export interface SystemStatus {
  platform: string
  pyannoteDevice: string
  whisperDevice: string
  whisperCompute: string
  ffmpegAvailable: boolean
  hfTokenConfigured: boolean
  cachedWhisperModels: string[]
  pyannoteCached: boolean
}

export interface TranscriptSegment {
  id: string
  start: number
  end: number
  startFormatted: string
  endFormatted: string
  speaker: string
  text: string
}

export interface VoiceNoteJob {
  id: string
  title: string
  fileName: string
  fileSizeBytes: number
  storedAudioFile?: string
  transcriptFilePath?: string
  createdAt: string
  speakerNames: Record<string, string>
  segments: TranscriptSegment[]
  rawTranscript: string
  speakers: string[]
  language: string
  languageProbability: number
  durationSeconds: number
  durationFormatted: string
  modelSize: WhisperModelSize
  diarized: boolean
  diarizationWarning?: string | null
  elapsedSeconds: number
  hardware: {
    pyannote: string
    whisper: string
    compute: string
  }
}

export interface TranscriptionProgress {
  stage: 'converting' | 'diarizing' | 'transcribing' | 'aligning' | 'complete'
  message: string
  percent: number
  elapsedSeconds: number
  durationSeconds?: number
}
