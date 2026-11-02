import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, Play, Search, Trash2, Video, X } from 'lucide-react'
import type { MotivationVideo } from '@/types/video'
import { deleteVideo, fetchVideos, videoAssetUrl } from '@/lib/videoApi'

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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('ALL')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const tags = useMemo(() => {
    const set = new Set<string>()
    for (const v of videos) {
      if (v.tag?.trim()) set.add(v.tag.trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [videos])

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return videos.filter((v) => {
      if (selectedTag !== 'ALL' && (v.tag || '') !== selectedTag) {
        return false
      }
      if (!q) return true
      const titleMatch = v.title.toLowerCase().includes(q)
      const tagMatch = (v.tag || '').toLowerCase().includes(q)
      return titleMatch || tagMatch
    })
  }, [videos, searchQuery, selectedTag])

  const handleDeleteVideo = async (video: MotivationVideo) => {
    setDeletingId(video.id)
    setLoadError(null)
    try {
      await deleteVideo(video.id)
      setVideos((prev) => prev.filter((v) => v.id !== video.id))
      setConfirmDeleteId(null)
      if (playing?.id === video.id) {
        setPlaying(null)
      }
    } catch (err) {
      console.error('Failed to delete video:', err)
      setLoadError(
        err instanceof Error ? err.message : 'Failed to delete video from backend'
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Videos
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Motivation on demand · click a card to play
          </p>
        </div>
        {!isLoading && videos.length > 0 && (
          <span className="text-xs text-[#8e8c87]">
            Showing {filteredVideos.length} of {videos.length} video
            {videos.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Search Bar & Tag Filters */}
      {!isLoading && videos.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8e8c87] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search videos by title or tag…"
              aria-label="Search videos"
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-[#2e2c29] bg-[#1e1d1b] text-sm text-[#f0eee9] placeholder:text-[#8e8c87] focus:outline-none focus:border-[#cc785c] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#2e2c29] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {tags.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTag('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  selectedTag === 'ALL'
                    ? 'bg-[#cc785c]/20 border-[#cc785c] text-[#f0eee9]'
                    : 'bg-[#1e1d1b] border-[#2e2c29] text-[#8e8c87] hover:text-[#f0eee9] hover:border-[#3e3b36]'
                }`}
              >
                All ({videos.length})
              </button>
              {tags.map((tag) => {
                const active = selectedTag === tag
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(active ? 'ALL' : tag)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#cc785c]/20 border-[#cc785c] text-[#f0eee9]'
                        : 'bg-[#1e1d1b] border-[#2e2c29] text-[#8e8c87] hover:text-[#f0eee9] hover:border-[#3e3b36]'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

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
      ) : filteredVideos.length === 0 ? (
        <div className="rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-10 text-center text-sm text-[#8e8c87]">
          <Search className="w-7 h-7 mx-auto mb-2.5 text-[#8e8c87]" />
          No videos match &ldquo;{searchQuery}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {filteredVideos.map((video) => {
            const isConfirming = confirmDeleteId === video.id
            const isDeleting = deletingId === video.id

            return (
              <div
                key={video.id}
                className="group relative flex flex-col rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] overflow-hidden shadow-sm hover:border-[#cc785c]/60 hover:bg-[#252320] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setPlaying(video)}
                  className="text-left flex-1 cursor-pointer"
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
                  <div className="p-4 pb-2">
                    <h2 className="text-sm font-semibold text-white leading-snug">
                      {video.title}
                    </h2>
                  </div>
                </button>

                <div className="px-4 pb-3.5 pt-1 flex items-center justify-between gap-2">
                  <div>
                    {video.tag && (
                      <span className="inline-block px-2 py-0.5 rounded-lg border border-[#2e2c29] bg-[#22201e] text-[11px] font-medium text-[#c2bfb8]">
                        {video.tag}
                      </span>
                    )}
                  </div>

                  {isConfirming ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteVideo(video)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          'Confirm Delete'
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded-lg border border-[#2e2c29] bg-[#22201e] hover:bg-[#2e2c29] text-xs text-[#c2bfb8] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(video.id)}
                      title="Delete video from backend"
                      aria-label={`Delete ${video.title}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[#8e8c87] hover:text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-800/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
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
              <div className="flex items-center gap-2 shrink-0">
                {confirmDeleteId === playing.id ? (
                  <>
                    <button
                      type="button"
                      disabled={deletingId === playing.id}
                      onClick={() => handleDeleteVideo(playing)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
                    >
                      {deletingId === playing.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Deleting…
                        </>
                      ) : (
                        'Confirm Delete'
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === playing.id}
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded-lg border border-[#2e2c29] bg-[#22201e] hover:bg-[#2e2c29] text-xs text-[#c2bfb8] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(playing.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-[#8e8c87] hover:text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-800/40 transition-colors cursor-pointer"
                    title="Delete video from backend"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPlaying(null)}
                  className="p-1.5 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#2e2c29] transition-colors cursor-pointer"
                  aria-label="Close player"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
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

