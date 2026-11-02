import { useEffect, useState } from 'react'
import { AlertCircle, Play, Video, X } from 'lucide-react'
import type { MotivationVideo } from '@/types/video'
import { fetchVideos, videoAssetUrl } from '@/lib/videoApi'

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

export function VideosView() {
  const [videos, setVideos] = useState<MotivationVideo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<MotivationVideo | null>(null)

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const list = await fetchVideos()
        if (isMounted) setVideos(list)
      } catch (err) {
        console.error('Failed to load videos:', err)
        if (isMounted) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to fetch videos'
          )
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }
    load()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!playing) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlaying(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playing])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Videos
        </h1>
        <p className="text-sm text-neutral-400 mt-1">
          Motivation on demand · click a card to play
        </p>
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{loadError}</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[#8e8c87]">Loading videos…</p>
      ) : videos.length === 0 && !loadError ? (
        <div className="rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-10 text-center text-sm text-[#8e8c87]">
          <Video className="w-8 h-8 mx-auto mb-3 text-[#cc785c]" />
          No videos yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => setPlaying(video)}
              className="group text-left rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] overflow-hidden shadow-sm hover:border-[#cc785c]/60 hover:bg-[#252320] transition-colors cursor-pointer"
            >
              <div className="relative aspect-video bg-black">
                <img
                  src={videoAssetUrl(video.thumbnailKey)}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#cc785c]/90 text-white shadow-lg group-hover:scale-105 transition-transform">
                    <Play className="h-6 w-6 translate-x-0.5" fill="currentColor" />
                  </span>
                </div>
                <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-mono text-white">
                  {formatDuration(video.durationSeconds)}
                </span>
              </div>
              <div className="p-4 space-y-1.5">
                <h2 className="text-sm font-semibold text-white leading-snug">
                  {video.title}
                </h2>
                {video.tag && (
                  <span className="inline-block px-2 py-0.5 rounded-lg border border-[#2e2c29] bg-[#22201e] text-[11px] font-medium text-[#c2bfb8]">
                    {video.tag}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Player Modal */}
      {playing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={playing.title}
        >
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            onClick={() => setPlaying(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-[#2e2c29] bg-[#1b1a18] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[#2e2c29]">
              <h2 className="text-sm font-semibold text-white truncate">
                {playing.title}
              </h2>
              <button
                type="button"
                onClick={() => setPlaying(null)}
                className="p-1.5 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#2e2c29] transition-colors cursor-pointer"
                aria-label="Close player"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <video
              key={playing.id}
              src={videoAssetUrl(playing.videoKey)}
              poster={videoAssetUrl(playing.thumbnailKey)}
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-black"
            />
          </div>
        </div>
      )}
    </div>
  )
}
