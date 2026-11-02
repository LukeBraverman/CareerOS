import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Link2,
  Loader2,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import type { MotivationVideo } from '@/types/video'
import {
  addVideoFromUrl,
  deleteVideo,
  fetchVideos,
  toggleFavouriteVideo,
  videoAssetUrl,
} from '@/lib/videoApi'

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

const DEFAULT_TAGS = ['Motivation', 'Mindset', 'Business', 'Discipline', 'Speech']

export function VideosView() {
  const [videos, setVideos] = useState<MotivationVideo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<MotivationVideo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('ALL')
  const [onlyFavourites, setOnlyFavourites] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingFavId, setTogglingFavId] = useState<string | null>(null)

  // Add Video Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [videoTag, setVideoTag] = useState('Motivation')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [isAddingVideo, setIsAddingVideo] = useState(false)
  const [addVideoError, setAddVideoError] = useState<string | null>(null)

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
    if (!playing && !showAddModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (playing) setPlaying(null)
        else if (showAddModal && !isAddingVideo) setShowAddModal(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playing, showAddModal, isAddingVideo])

  const tags = useMemo(() => {
    const set = new Set<string>()
    for (const v of videos) {
      if (v.tag?.trim()) set.add(v.tag.trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [videos])

  const allTagSuggestions = useMemo(() => {
    const set = new Set<string>(DEFAULT_TAGS)
    for (const t of tags) set.add(t)
    return Array.from(set)
  }, [tags])

  const favouritesCount = useMemo(
    () => videos.filter((v) => Boolean(v.favourite)).length,
    [videos]
  )

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return videos.filter((v) => {
      if (onlyFavourites && !v.favourite) {
        return false
      }
      if (selectedTag !== 'ALL' && (v.tag || '') !== selectedTag) {
        return false
      }
      if (!q) return true
      const titleMatch = v.title.toLowerCase().includes(q)
      const tagMatch = (v.tag || '').toLowerCase().includes(q)
      return titleMatch || tagMatch
    })
  }, [videos, searchQuery, selectedTag, onlyFavourites])

  const handleToggleFavourite = async (video: MotivationVideo) => {
    const nextFav = !video.favourite
    setTogglingFavId(video.id)
    setVideos((prev) =>
      prev.map((v) => (v.id === video.id ? { ...v, favourite: nextFav } : v))
    )
    if (playing?.id === video.id) {
      setPlaying((prev) => (prev ? { ...prev, favourite: nextFav } : prev))
    }
    try {
      const updated = await toggleFavouriteVideo(video.id, nextFav)
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, ...updated } : v))
      )
    } catch (err) {
      console.error('Failed to update favourite:', err)
      // Roll back optimistic state
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { ...v, favourite: !nextFav } : v
        )
      )
      if (playing?.id === video.id) {
        setPlaying((prev) => (prev ? { ...prev, favourite: !nextFav } : prev))
      }
      setLoadError(
        err instanceof Error ? err.message : 'Failed to update favourite'
      )
    } finally {
      setTogglingFavId(null)
    }
  }

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

  const handleAddVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!videoUrl.trim() || isAddingVideo) return
    setIsAddingVideo(true)
    setAddVideoError(null)
    try {
      const created = await addVideoFromUrl({
        url: videoUrl.trim(),
        title: customTitle.trim() || undefined,
        tag: videoTag.trim() || undefined,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
      })
      setVideos((prev) => [
        created,
        ...prev.filter((v) => v.id !== created.id),
      ])
      setVideoUrl('')
      setCustomTitle('')
      setStartTime('')
      setEndTime('')
      setShowAddModal(false)
    } catch (err) {
      console.error('Failed to add video:', err)
      setAddVideoError(
        err instanceof Error ? err.message : 'Failed to download and add video'
      )
    } finally {
      setIsAddingVideo(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Videos
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Motivation on demand · click a card to play
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isLoading && videos.length > 0 && (
            <span className="text-xs text-[#8e8c87]">
              Showing {filteredVideos.length} of {videos.length} video
              {videos.length === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setAddVideoError(null)
              setShowAddModal(true)
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#cc785c] hover:bg-[#d9886c] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Video Link</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Tag / Favourites Filters */}
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

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedTag('ALL')
                setOnlyFavourites(false)
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                selectedTag === 'ALL' && !onlyFavourites
                  ? 'bg-[#cc785c]/20 border-[#cc785c] text-[#f0eee9]'
                  : 'bg-[#1e1d1b] border-[#2e2c29] text-[#8e8c87] hover:text-[#f0eee9] hover:border-[#3e3b36]'
              }`}
            >
              All ({videos.length})
            </button>

            <button
              type="button"
              onClick={() => setOnlyFavourites((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                onlyFavourites
                  ? 'bg-amber-500/20 border-amber-500/80 text-amber-200'
                  : 'bg-[#1e1d1b] border-[#2e2c29] text-[#8e8c87] hover:text-amber-300 hover:border-[#3e3b36]'
              }`}
            >
              <Star
                className="w-3.5 h-3.5 text-amber-400"
                fill={onlyFavourites ? 'currentColor' : 'none'}
              />
              <span>Favourites ({favouritesCount})</span>
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
          No videos yet. Click &ldquo;Add Video Link&rdquo; above to add one.
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-10 text-center text-sm text-[#8e8c87]">
          <Search className="w-7 h-7 mx-auto mb-2.5 text-[#8e8c87]" />
          {onlyFavourites && !searchQuery
            ? 'No favourite videos yet. Click the star on any video to favourite it.'
            : `No videos match "${searchQuery}".`}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {filteredVideos.map((video) => {
            const isConfirming = confirmDeleteId === video.id
            const isDeleting = deletingId === video.id
            const isFav = Boolean(video.favourite)

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
                    {isFav && (
                      <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-500/40">
                        <Star className="w-3 h-3 text-amber-400" fill="currentColor" />
                        Fav
                      </span>
                    )}
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

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={togglingFavId === video.id}
                      onClick={() => handleToggleFavourite(video)}
                      title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                      aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors cursor-pointer ${
                        isFav
                          ? 'text-amber-300 bg-amber-500/15 border-amber-500/40 hover:bg-amber-500/25'
                          : 'text-[#8e8c87] border-transparent hover:text-amber-300 hover:bg-[#2e2c29]/60'
                      }`}
                    >
                      <Star
                        className="w-3.5 h-3.5"
                        fill={isFav ? 'currentColor' : 'none'}
                      />
                      <span>{isFav ? 'Saved' : 'Favourite'}</span>
                    </button>

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
              </div>
            )
          })}
        </div>
      )}

      {/* Add Video From Link Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add Video Link"
        >
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            onClick={() => {
              if (!isAddingVideo) setShowAddModal(false)
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[#2e2c29] bg-[#1b1a18] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2c29]">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[#cc785c]" />
                <h2 className="text-sm font-semibold text-white">
                  Add Video from Link
                </h2>
              </div>
              <button
                type="button"
                disabled={isAddingVideo}
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#2e2c29] disabled:opacity-50 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddVideoSubmit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#c2bfb8]">
                  Video Link (YouTube, LinkedIn, etc.) *
                </label>
                <input
                  type="url"
                  required
                  disabled={isAddingVideo}
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#2e2c29] bg-[#141413] text-sm text-[#f0eee9] placeholder:text-[#8e8c87] focus:outline-none focus:border-[#cc785c] disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#c2bfb8]">
                  Custom Title{' '}
                  <span className="text-[#8e8c87] font-normal">
                    (optional — auto-detected from link if blank)
                  </span>
                </label>
                <input
                  type="text"
                  disabled={isAddingVideo}
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Leave blank to use video title…"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#2e2c29] bg-[#141413] text-sm text-[#f0eee9] placeholder:text-[#8e8c87] focus:outline-none focus:border-[#cc785c] disabled:opacity-60"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#c2bfb8]">
                  Tag
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {allTagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      disabled={isAddingVideo}
                      onClick={() => setVideoTag(tag)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        videoTag === tag
                          ? 'bg-[#cc785c]/20 border-[#cc785c] text-[#f0eee9]'
                          : 'bg-[#141413] border-[#2e2c29] text-[#8e8c87] hover:text-[#f0eee9]'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  disabled={isAddingVideo}
                  value={videoTag}
                  onChange={(e) => setVideoTag(e.target.value)}
                  placeholder="Or type a custom tag…"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#2e2c29] bg-[#141413] text-xs text-[#f0eee9] placeholder:text-[#8e8c87] focus:outline-none focus:border-[#cc785c] disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#c2bfb8]">
                    Clip Start{' '}
                    <span className="text-[#8e8c87] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    disabled={isAddingVideo}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    placeholder="e.g. 01:00 or 45:28"
                    className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#141413] text-xs text-[#f0eee9] placeholder:text-[#8e8c87] focus:outline-none focus:border-[#cc785c] disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#c2bfb8]">
                    Clip End{' '}
                    <span className="text-[#8e8c87] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    disabled={isAddingVideo}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    placeholder="e.g. 06:00 or 49:36"
                    className="w-full px-3 py-2 rounded-xl border border-[#2e2c29] bg-[#141413] text-xs text-[#f0eee9] placeholder:text-[#8e8c87] focus:outline-none focus:border-[#cc785c] disabled:opacity-60"
                  />
                </div>
              </div>

              {addVideoError && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{addVideoError}</span>
                </div>
              )}

              {isAddingVideo && (
                <div className="p-3 rounded-xl bg-[#22201e] border border-[#2e2c29] text-xs text-[#c2bfb8] flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-[#cc785c] shrink-0" />
                  <span>
                    Downloading video &amp; thumbnail with yt-dlp + ffmpeg and
                    uploading to S3… This may take 15–60 seconds.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isAddingVideo}
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-[#2e2c29] bg-[#22201e] hover:bg-[#2e2c29] disabled:opacity-50 text-xs font-medium text-[#c2bfb8] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingVideo || !videoUrl.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#cc785c] hover:bg-[#d9886c] disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  {isAddingVideo ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Processing with ffmpeg…
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      Download &amp; Add Video
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
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
                <button
                  type="button"
                  disabled={togglingFavId === playing.id}
                  onClick={() => handleToggleFavourite(playing)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer ${
                    playing.favourite
                      ? 'text-amber-300 bg-amber-500/15 border-amber-500/40 hover:bg-amber-500/25'
                      : 'text-[#8e8c87] border-transparent hover:text-amber-300 hover:bg-[#2e2c29]'
                  }`}
                >
                  <Star
                    className="w-3.5 h-3.5"
                    fill={playing.favourite ? 'currentColor' : 'none'}
                  />
                  <span>{playing.favourite ? 'Saved' : 'Favourite'}</span>
                </button>

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


