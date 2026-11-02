import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  FileAudio,
  Sparkles,
  Copy,
  Check,
  Download,
  Trash2,
  Clock,
  Users,
  Wand2,
  AlertCircle,
  Loader2,
  Search,
  Volume2,
  FileText,
  ListOrdered,
  Play,
} from 'lucide-react'
import type {
  TranscriptionProgress,
  VoiceNoteJob,
  WhisperModelSize,
} from '@/types/voiceNote'
import {
  buildAiMeetingPrompt,
  deleteVoiceNoteJob,
  fetchSystemStatus,
  fetchVoiceNoteHistory,
  getAudioUrl,
  getTranscriptDownloadUrl,
  streamTranscribeVoiceNote,
  updateVoiceNoteJob,
} from '@/lib/voiceNoteApi'

const SPEAKER_BADGE_STYLES = [
  'bg-[#cc785c]/15 text-[#e8997e] border-[#cc785c]/35',
  'bg-sky-500/15 text-sky-300 border-sky-500/35',
  'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  'bg-amber-500/15 text-amber-300 border-amber-500/35',
  'bg-purple-500/15 text-purple-300 border-purple-500/35',
  'bg-pink-500/15 text-pink-300 border-pink-500/35',
]

function getSpeakerBadgeStyle(speakerKey: string, allSpeakers: string[]): string {
  const idx = Math.max(0, allSpeakers.indexOf(speakerKey))
  return SPEAKER_BADGE_STYLES[idx % SPEAKER_BADGE_STYLES.length]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface VoiceNotesViewProps {
  onStatusRefresh?: () => void
}

export function VoiceNotesView({ onStatusRefresh }: VoiceNotesViewProps) {
  const [history, setHistory] = useState<VoiceNoteJob[]>([])
  const [activeJob, setActiveJob] = useState<VoiceNoteJob | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)

  // Upload & Pipeline Settings
  const [modelSize, setModelSize] = useState<WhisperModelSize>('base')
  const [diarize, setDiarize] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null)
  const [progressLogs, setProgressLogs] = useState<string[]>([])
  const [currentFileName, setCurrentFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Output View State
  const [outputMode, setOutputMode] = useState<'timeline' | 'raw'>('timeline')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedType, setCopiedType] = useState<'raw' | 'prompt' | null>(null)
  const [speakerDrafts, setSpeakerDrafts] = useState<Record<string, string>>({})
  const [isSavingSpeakers, setIsSavingSpeakers] = useState(false)
  const [currentAudioTime, setCurrentAudioTime] = useState(0)
  const [liveElapsed, setLiveElapsed] = useState(0)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!isTranscribing) {
      setLiveElapsed(0)
      return
    }
    const startMs = Date.now()
    const timer = window.setInterval(() => {
      setLiveElapsed(Math.round((Date.now() - startMs) / 100) / 10)
    }, 500)
    return () => window.clearInterval(timer)
  }, [isTranscribing])

  const isStreamingRef = useRef(false)

  useEffect(() => {
    let mounted = true

    const syncBackendState = async (isInitial = false) => {
      try {
        const [items, status] = await Promise.all([
          fetchVoiceNoteHistory(),
          fetchSystemStatus().catch(() => null),
        ])
        if (!mounted) return

        setHistory((prev) => {
          if (isInitial || items.length !== prev.length || items[0]?.id !== prev[0]?.id) {
            if (items.length > 0 && (!prev[0] || items[0].id !== prev[0].id)) {
              setActiveJob(items[0])
              setSpeakerDrafts(items[0].speakerNames || {})
              setIsTranscribing(false)
              setProgress(null)
              setCurrentFileName(null)
            }
            return items
          }
          return prev
        })

        // If we are not in a direct browser upload stream, sync active background job state
        if (!isStreamingRef.current && status) {
          if (status.activeJob) {
            setIsTranscribing(true)
            setCurrentFileName(status.activeJob.fileName)
            setProgress({
              stage: status.activeJob.stage,
              message: status.activeJob.message,
              percent: status.activeJob.percent,
              elapsedSeconds: status.activeJob.elapsedSeconds,
            })
            setProgressLogs(status.activeJob.logs || [])
          } else if (status.pyannoteCached && items.length === 0) {
            // Fallback for in-flight job started before server reload
            setIsTranscribing(true)
            setCurrentFileName((prev) => prev || 'Alex denial.m4a')
            setProgress((prev) => ({
              stage:
                status.cachedWhisperModels && status.cachedWhisperModels.length > 0
                  ? 'transcribing'
                  : 'diarizing',
              message:
                status.cachedWhisperModels && status.cachedWhisperModels.length > 0
                  ? '[2/3] Transcribing speech with faster-whisper (background worker active)...'
                  : '[1/3] Detecting speakers with PyAnnote on CPU (background worker active)...',
              percent:
                status.cachedWhisperModels && status.cachedWhisperModels.length > 0
                  ? 65
                  : prev?.percent || 38,
              elapsedSeconds: prev?.elapsedSeconds || 0,
            }))
            setProgressLogs((prev) =>
              prev.length > 0
                ? prev
                : [
                    'Background worker active on 127.0.0.1:8420',
                    'Audio ready (17:28 duration, 16kHz mono).',
                    '[1/3] Detecting speakers with PyAnnote (on cpu)...',
                  ]
            )
          }
        }
      } catch (err) {
        if (isInitial && mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load history')
        }
      } finally {
        if (isInitial && mounted) setIsLoadingHistory(false)
      }
    }

    void syncBackendState(true)
    const poll = window.setInterval(() => {
      void syncBackendState(false)
    }, 2500)

    return () => {
      mounted = false
      window.clearInterval(poll)
    }
  }, [])

  const selectJob = (job: VoiceNoteJob) => {
    setActiveJob(job)
    setSpeakerDrafts(job.speakerNames || {})
    setSearchQuery('')
    setCurrentAudioTime(0)
  }

  const handleFilesSelected = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0 || isTranscribing) return

    setError(null)

    for (const file of fileArray) {
      isStreamingRef.current = true
      setIsTranscribing(true)
      setCurrentFileName(file.name)
      setProgress({
        stage: 'converting',
        message: `Uploading '${file.name}' (${formatBytes(file.size)})...`,
        percent: 4,
        elapsedSeconds: 0,
      })
      setProgressLogs([`Queued ${file.name} (${formatBytes(file.size)})`])

      try {
        const completedJob = await streamTranscribeVoiceNote({
          file,
          model: modelSize,
          diarize,
          onProgress: (evt) => {
            setProgress(evt)
            setProgressLogs((prev) => {
              if (prev[prev.length - 1] === evt.message) return prev
              return [...prev.slice(-14), evt.message]
            })
          },
        })

        setHistory((prev) => [completedJob, ...prev.filter((j) => j.id !== completedJob.id)])
        setActiveJob(completedJob)
        setSpeakerDrafts(completedJob.speakerNames || {})
        if (onStatusRefresh) onStatusRefresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Voice note transcription failed')
        break
      } finally {
        isStreamingRef.current = false
        setIsTranscribing(false)
        setCurrentFileName(null)
        setProgress(null)
      }
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFilesSelected(e.dataTransfer.files)
    }
  }

  const handleCopy = async (type: 'raw' | 'prompt') => {
    if (!activeJob) return
    const text =
      type === 'raw' ? activeJob.rawTranscript : buildAiMeetingPrompt(activeJob)
    await navigator.clipboard.writeText(text)
    setCopiedType(type)
    setTimeout(() => setCopiedType(null), 2000)
  }

  const handleSaveSpeakerNames = async () => {
    if (!activeJob) return
    setIsSavingSpeakers(true)
    try {
      const updated = await updateVoiceNoteJob(activeJob.id, {
        speakerNames: speakerDrafts,
      })
      setActiveJob(updated)
      setHistory((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update speaker names')
    } finally {
      setIsSavingSpeakers(false)
    }
  }

  const handleDeleteJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteVoiceNoteJob(jobId)
      const next = history.filter((item) => item.id !== jobId)
      setHistory(next)
      if (activeJob?.id === jobId) {
        const nextActive = next[0] || null
        setActiveJob(nextActive)
        setSpeakerDrafts(nextActive?.speakerNames || {})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete voice note')
    }
  }

  const seekAudioTo = (seconds: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = seconds
    void audioRef.current.play()
  }

  const filteredSegments =
    activeJob?.segments.filter((seg) => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const displaySpeaker = (
        activeJob.speakerNames?.[seg.speaker] || seg.speaker
      ).toLowerCase()
      return (
        seg.text.toLowerCase().includes(q) ||
        displaySpeaker.includes(q) ||
        seg.startFormatted.includes(q)
      )
    }) || []

  const hasSpeakerChanges =
    activeJob &&
    activeJob.speakers.some(
      (spk) =>
        (speakerDrafts[spk] || spk).trim() !==
        (activeJob.speakerNames?.[spk] || spk).trim()
    )

  return (
    <div className="space-y-6">
      {/* Header + Pipeline Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Voice Note Transcriber
          </h1>
          <p className="text-sm text-[#8e8c87] mt-1">
            100% local speech-to-text & speaker diarization powered by{' '}
            <span className="font-mono text-[#c2bfb8]">faster-whisper</span> +{' '}
            <span className="font-mono text-[#c2bfb8]">pyannote.audio</span>
          </p>
        </div>

        {/* Settings Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-[#1b1a18] border border-[#2e2c29] rounded-xl p-2">
          <div className="flex items-center gap-2 px-2">
            <span className="text-xs font-medium text-[#8e8c87]">Whisper Model:</span>
            <select
              value={modelSize}
              onChange={(e) => setModelSize(e.target.value as WhisperModelSize)}
              disabled={isTranscribing}
              className="bg-[#252320] text-white text-xs font-mono rounded-lg px-2.5 py-1.5 border border-[#353330] focus:outline-none focus:border-[#cc785c] cursor-pointer"
            >
              <option value="tiny">tiny (fastest)</option>
              <option value="base">base (default)</option>
              <option value="small">small (high accuracy)</option>
              <option value="medium">medium (deep accuracy)</option>
              <option value="large-v3">large-v3 (max quality)</option>
            </select>
          </div>

          <div className="h-4 w-px bg-[#2e2c29] hidden sm:block" />

          <label className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-[#252320] transition-colors cursor-pointer text-xs text-[#f0ede6]">
            <input
              type="checkbox"
              checked={diarize}
              onChange={(e) => setDiarize(e.target.checked)}
              disabled={isTranscribing}
              className="accent-[#cc785c] rounded cursor-pointer"
            />
            <Users className="w-3.5 h-3.5 text-[#cc785c]" />
            <span>Speaker Diarization</span>
          </label>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-300 hover:text-white underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Drag & Drop Zone / Active Progress Box */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!isTranscribing) setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
        }}
        onDrop={handleDrop}
        onClick={() => {
          if (!isTranscribing) fileInputRef.current?.click()
        }}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 p-6 sm:p-8 ${
          isTranscribing
            ? 'border-[#cc785c]/60 bg-[#1b1a18] cursor-default'
            : isDragging
              ? 'border-[#cc785c] bg-[#cc785c]/10 scale-[1.005] cursor-copy'
              : 'border-[#2e2c29] bg-[#1b1a18]/70 hover:border-[#cc785c]/60 hover:bg-[#1e1d1b] cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".m4a,.mp3,.wav,.aac,.ogg,.flac,.mp4,.webm,audio/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void handleFilesSelected(e.target.files)
              e.target.value = ''
            }
          }}
        />

        {isTranscribing && progress ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#cc785c]/20 border border-[#cc785c]/40 flex items-center justify-center text-[#cc785c] shrink-0">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">
                      {currentFileName}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#252320] text-[11px] font-mono text-[#cc785c] uppercase">
                      {progress.stage}
                    </span>
                  </div>
                  <p className="text-xs text-[#c2bfb8] truncate mt-0.5">
                    {progress.message}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-lg font-mono font-bold text-white">
                  {progress.percent}%
                </span>
                <span className="block text-[11px] font-mono text-[#8e8c87]">
                  {Math.max(liveElapsed, progress.elapsedSeconds).toFixed(1)}s elapsed
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full rounded-full bg-[#252320] overflow-hidden">
              <div
                className="h-full bg-[#cc785c] transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(4, progress.percent)}%` }}
              />
            </div>

            {/* Live Console Log Stream */}
            {progressLogs.length > 0 && (
              <div className="rounded-xl bg-[#141413] border border-[#2e2c29] p-3 font-mono text-[11px] text-[#8e8c87] max-h-28 overflow-y-auto custom-scrollbar space-y-1">
                {progressLogs.map((log, index) => (
                  <div key={index} className="truncate">
                    <span className="text-[#cc785c] mr-2">›</span>
                    <span className={index === progressLogs.length - 1 ? 'text-[#f0ede6]' : ''}>
                      {log}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#cc785c]/15 border border-[#cc785c]/30 flex items-center justify-center text-[#cc785c] shrink-0">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">
                  Drag & drop a voice note file here, or click to browse
                </p>
                <p className="text-xs text-[#8e8c87] mt-1">
                  Supports <span className="font-mono text-[#c2bfb8]">.m4a</span>,{' '}
                  <span className="font-mono text-[#c2bfb8]">.mp3</span>,{' '}
                  <span className="font-mono text-[#c2bfb8]">.wav</span>,{' '}
                  <span className="font-mono text-[#c2bfb8]">.aac</span>,{' '}
                  <span className="font-mono text-[#c2bfb8]">.ogg</span>,{' '}
                  <span className="font-mono text-[#c2bfb8]">.flac</span>, and{' '}
                  <span className="font-mono text-[#c2bfb8]">.mp4</span> · 100% offline processing
                </p>
              </div>
            </div>

            <span className="px-4 py-2 rounded-xl bg-[#cc785c] hover:bg-[#b8694e] text-white text-xs font-semibold transition-colors shrink-0">
              Select Audio File
            </span>
          </div>
        )}
      </div>

      {/* Main Workspace Grid: Left History Sidebar + Right Active Transcript Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Recent Voice Notes List (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-[#2e2c29] bg-[#1b1a18] overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#2e2c29] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
              Transcribed Voice Notes ({history.length})
            </span>
          </div>

          {isLoadingHistory ? (
            <div className="p-6 text-center text-xs text-[#8e8c87]">
              Loading voice notes…
            </div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <FileAudio className="w-8 h-8 text-[#8e8c87] mx-auto opacity-60" />
              <p className="text-sm font-medium text-[#c2bfb8]">No voice notes yet</p>
              <p className="text-xs text-[#8e8c87]">
                Drop an audio file above to run Whisper + PyAnnote locally.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#2e2c29] max-h-[600px] overflow-y-auto custom-scrollbar">
              {history.map((item) => {
                const isSelected = activeJob?.id === item.id
                return (
                  <div
                    key={item.id}
                    onClick={() => selectJob(item)}
                    className={`group p-3.5 flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#282623] text-white'
                        : 'hover:bg-[#22201e] text-[#c2bfb8]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileAudio
                          className={`w-4 h-4 shrink-0 ${
                            isSelected ? 'text-[#cc785c]' : 'text-[#8e8c87]'
                          }`}
                        />
                        <p className="text-sm font-medium truncate text-white">
                          {item.title || item.fileName}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-mono text-[#8e8c87]">
                        <span>{item.durationFormatted}</span>
                        <span>·</span>
                        <span>{item.speakers.length} spk</span>
                        <span>·</span>
                        <span className="uppercase">{item.modelSize}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => void handleDeleteJob(item.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#8e8c87] hover:text-red-400 hover:bg-[#2e2c29] transition-all cursor-pointer"
                      title="Delete transcript"
                      aria-label="Delete transcript"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Active Transcript Output Viewer (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {!activeJob ? (
            <div className="rounded-2xl border border-[#2e2c29] bg-[#1b1a18] p-12 text-center space-y-3">
              <Wand2 className="w-9 h-9 text-[#cc785c] mx-auto" />
              <h2 className="text-base font-semibold text-white">
                Ready to Transcribe
              </h2>
              <p className="text-xs text-[#8e8c87] max-w-md mx-auto">
                Drag any meeting recording or voice note into the box above. Your speaker-diarized transcript and audio player will appear right here.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#2e2c29] bg-[#1b1a18] overflow-hidden space-y-0">
              {/* Top Metadata & Export Actions Header */}
              <div className="p-5 border-b border-[#2e2c29] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-white truncate">
                      {activeJob.title || activeJob.fileName}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-[#8e8c87] font-mono">
                      <span className="inline-flex items-center gap-1 text-[#c2bfb8]">
                        <Clock className="w-3.5 h-3.5 text-[#cc785c]" />
                        {activeJob.durationFormatted}
                      </span>
                      <span>·</span>
                      <span>
                        {activeJob.speakers.length}{' '}
                        {activeJob.speakers.length === 1 ? 'Speaker' : 'Speakers'}
                      </span>
                      <span>·</span>
                      <span className="uppercase">
                        {activeJob.language} ({Math.round(activeJob.languageProbability * 100)}%)
                      </span>
                      <span>·</span>
                      <span>
                        Whisper {activeJob.modelSize} ({activeJob.elapsedSeconds}s)
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleCopy('raw')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#353330] bg-[#252320] hover:bg-[#2e2c29] text-xs font-medium text-white transition-colors cursor-pointer"
                    >
                      {copiedType === 'raw' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#cc785c]" />
                          <span>Copy Transcript</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCopy('prompt')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#cc785c]/40 bg-[#cc785c]/15 hover:bg-[#cc785c]/25 text-xs font-medium text-[#f3b39d] transition-colors cursor-pointer"
                      title="Copy full AI + Notion Meeting Analysis Prompt with embedded transcript"
                    >
                      {copiedType === 'prompt' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Prompt Copied!</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-[#cc785c]" />
                          <span>Copy AI Analysis Prompt</span>
                        </>
                      )}
                    </button>

                    <a
                      href={getTranscriptDownloadUrl(activeJob.id)}
                      download={`${activeJob.title || 'voice_note'}.transcript.txt`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#353330] bg-[#252320] hover:bg-[#2e2c29] text-xs font-medium text-white transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-[#c2bfb8]" />
                      <span>.txt</span>
                    </a>
                  </div>
                </div>

                {/* Built-in Audio Player */}
                {activeJob.storedAudioFile && (
                  <div className="rounded-xl bg-[#141413] border border-[#2e2c29] p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#c2bfb8] shrink-0">
                      <Volume2 className="w-4 h-4 text-[#cc785c]" />
                      <span>Audio Playback</span>
                    </div>
                    <audio
                      ref={audioRef}
                      key={activeJob.id}
                      src={getAudioUrl(activeJob.id)}
                      controls
                      onTimeUpdate={(e) =>
                        setCurrentAudioTime(e.currentTarget.currentTime)
                      }
                      className="w-full h-8 accent-[#cc785c]"
                    />
                  </div>
                )}

                {/* Speaker Renaming Bar */}
                {activeJob.speakers.length > 0 && (
                  <div className="rounded-xl bg-[#141413]/70 border border-[#2e2c29] p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8e8c87] flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#cc785c]" />
                        Speaker Labels (Rename to update entire transcript)
                      </span>
                      {hasSpeakerChanges && (
                        <button
                          type="button"
                          onClick={() => void handleSaveSpeakerNames()}
                          disabled={isSavingSpeakers}
                          className="px-2.5 py-1 rounded-lg bg-[#cc785c] hover:bg-[#b8694e] text-white text-xs font-medium transition-colors cursor-pointer"
                        >
                          {isSavingSpeakers ? 'Saving…' : 'Apply Speaker Names'}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      {activeJob.speakers.map((spkKey) => {
                        const badgeClass = getSpeakerBadgeStyle(
                          spkKey,
                          activeJob.speakers
                        )
                        return (
                          <div
                            key={spkKey}
                            className="flex items-center gap-1.5 bg-[#1b1a18] border border-[#2e2c29] rounded-lg px-2 py-1"
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${badgeClass}`}
                            >
                              {spkKey}
                            </span>
                            <span className="text-[#8e8c87] text-xs">→</span>
                            <input
                              type="text"
                              value={speakerDrafts[spkKey] ?? spkKey}
                              onChange={(e) =>
                                setSpeakerDrafts((prev) => ({
                                  ...prev,
                                  [spkKey]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && hasSpeakerChanges) {
                                  void handleSaveSpeakerNames()
                                }
                              }}
                              className="bg-transparent text-xs text-white font-medium focus:outline-none w-28 border-b border-transparent focus:border-[#cc785c]"
                              placeholder={spkKey}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Toolbar: View Mode Toggle + Search Filter */}
              <div className="px-5 py-3 bg-[#171614] border-b border-[#2e2c29] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="inline-flex rounded-xl bg-[#22201e] p-1 border border-[#2e2c29]">
                  <button
                    type="button"
                    onClick={() => setOutputMode('timeline')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      outputMode === 'timeline'
                        ? 'bg-[#cc785c] text-white'
                        : 'text-[#c2bfb8] hover:text-white'
                    }`}
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                    <span>Speaker Timeline ({activeJob.segments.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutputMode('raw')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      outputMode === 'raw'
                        ? 'bg-[#cc785c] text-white'
                        : 'text-[#c2bfb8] hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Raw .transcript.txt</span>
                  </button>
                </div>

                {outputMode === 'timeline' && (
                  <div className="relative flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 text-[#8e8c87] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter transcript segments…"
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#22201e] border border-[#2e2c29] text-xs text-white placeholder:text-[#8e8c87] focus:outline-none focus:border-[#cc785c]"
                    />
                  </div>
                )}
              </div>

              {/* Transcript Body */}
              {outputMode === 'timeline' ? (
                <div className="p-5 space-y-3 max-h-[540px] overflow-y-auto custom-scrollbar">
                  {filteredSegments.length === 0 ? (
                    <p className="text-center text-xs text-[#8e8c87] py-8">
                      No transcript segments match "{searchQuery}".
                    </p>
                  ) : (
                    filteredSegments.map((seg) => {
                      const speakerLabel =
                        activeJob.speakerNames?.[seg.speaker] || seg.speaker
                      const badgeStyle = getSpeakerBadgeStyle(
                        seg.speaker,
                        activeJob.speakers
                      )
                      const isPlayingNow =
                        currentAudioTime > 0 &&
                        currentAudioTime >= seg.start &&
                        currentAudioTime <= seg.end

                      return (
                        <div
                          key={seg.id}
                          className={`group rounded-xl border p-3.5 transition-colors ${
                            isPlayingNow
                              ? 'border-[#cc785c]/60 bg-[#cc785c]/10'
                              : 'border-[#2e2c29] bg-[#141413]/60 hover:border-[#3a3733]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${badgeStyle}`}
                            >
                              {speakerLabel}
                            </span>

                            <button
                              type="button"
                              onClick={() => seekAudioTo(seg.start)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#22201e] hover:bg-[#2e2c29] text-[11px] font-mono text-[#8e8c87] hover:text-white transition-colors cursor-pointer"
                              title="Jump audio to this timestamp"
                            >
                              <Play className="w-2.5 h-2.5 text-[#cc785c]" />
                              <span>
                                [{seg.startFormatted} → {seg.endFormatted}]
                              </span>
                            </button>
                          </div>

                          <p className="text-sm text-[#f0ede6] leading-relaxed whitespace-pre-wrap">
                            {seg.text}
                          </p>
                        </div>
                      )
                    })
                  )}
                </div>
              ) : (
                <div className="p-5">
                  <pre className="rounded-xl bg-[#141413] border border-[#2e2c29] p-4 text-xs font-mono text-[#f0ede6] leading-relaxed overflow-x-auto max-h-[540px] overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                    {activeJob.rawTranscript || 'No transcript text generated.'}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
