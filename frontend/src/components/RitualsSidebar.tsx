import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  Plane,
  Search,
  Check,
  AlertCircle,
  Loader2,
  Calendar,
} from 'lucide-react'
import type { Ritual, RitualTag } from '@/types/ritual'
import {
  createRitual,
  updateRitual,
  deleteRitual,
} from '@/lib/ritualApi'
import {
  EMOJI_CATEGORIES,
  ALL_EMOJIS,
  type EmojiItem,
} from '@/lib/emojiData'

interface RitualsSidebarProps {
  isOpen: boolean
  onClose: () => void
  tag: RitualTag
  rituals: Ritual[]
  isLoading?: boolean
  error?: string | null
  onCreated: (ritual: Ritual) => void
  onUpdated: (ritual: Ritual) => void
  onDeleted: (id: string) => void
}

export function RitualsSidebar({
  isOpen,
  onClose,
  tag,
  rituals,
  isLoading = false,
  error = null,
  onCreated,
  onUpdated,
  onDeleted,
}: RitualsSidebarProps) {
  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRitual, setEditingRitual] = useState<Ritual | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formEmoji, setFormEmoji] = useState(() =>
    tag === 'travel' ? '✈️' : '🎭'
  )
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Deletion State
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Emoji Picker Popover State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiSearch, setEmojiSearch] = useState('')
  const [selectedEmojiCategory, setSelectedEmojiCategory] =
    useState<string>('All')
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showEmojiPicker) {
          setShowEmojiPicker(false)
          return
        }
        if (isFormOpen) {
          setIsFormOpen(false)
          setEditingRitual(null)
          return
        }
        onClose()
      }
    },
    [showEmojiPicker, isFormOpen, onClose]
  )

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  // Click outside emoji picker
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false)
      }
    }
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () =>
        document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEmojiPicker])

  // Filtered Emojis
  const filteredEmojis = useMemo(() => {
    const q = emojiSearch.trim().toLowerCase()
    return ALL_EMOJIS.filter((item: EmojiItem) => {
      if (selectedEmojiCategory !== 'All' && item.category !== selectedEmojiCategory) {
        return false
      }
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.keywords.some((k: string) => k.toLowerCase().includes(q))
      )
    })
  }, [emojiSearch, selectedEmojiCategory])

  const openCreateForm = () => {
    setEditingRitual(null)
    setFormTitle('')
    setFormDescription('')
    setFormEmoji(tag === 'travel' ? '✈️' : '🎭')
    setFormError(null)
    setIsFormOpen(true)
  }

  const openEditForm = (ritual: Ritual) => {
    setEditingRitual(ritual)
    setFormTitle(ritual.title)
    setFormDescription(ritual.description || '')
    setFormEmoji(ritual.emoji || (tag === 'travel' ? '✈️' : '🎭'))
    setFormError(null)
    setIsFormOpen(true)
  }

  const closeForm = () => {
    setIsFormOpen(false)
    setEditingRitual(null)
    setFormError(null)
    setShowEmojiPicker(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedTitle = formTitle.trim()
    if (!trimmedTitle) {
      setFormError('Please enter a title for the ritual.')
      return
    }

    setIsSaving(true)
    setFormError(null)

    try {
      if (editingRitual) {
        const updated = await updateRitual(editingRitual.tag || tag, editingRitual.id, {
          title: trimmedTitle,
          description: formDescription.trim(),
          emoji: formEmoji,
        })
        onUpdated(updated)
      } else {
        const created = await createRitual({
          tag: tag.toLowerCase(),
          title: trimmedTitle,
          description: formDescription.trim(),
          emoji: formEmoji,
        })
        onCreated(created)
      }
      closeForm()
    } catch (err) {
      console.error('Failed to save ritual:', err)
      setFormError(
        err instanceof Error ? err.message : 'Failed to save ritual'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (ritual: Ritual) => {
    if (deletingId) return
    setDeletingId(ritual.id)
    try {
      await deleteRitual(ritual.tag || tag, ritual.id)
      onDeleted(ritual.id)
    } catch (err) {
      console.error('Failed to delete ritual:', err)
      alert(
        err instanceof Error
          ? err.message
          : 'Failed to delete ritual. Please try again.'
      )
    } finally {
      setDeletingId(null)
    }
  }

  const formatCreatedAt = (iso?: string) => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return ''
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Right Sidebar Panel */}
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-[#1a1917] border-l border-[#2e2c29] shadow-2xl flex flex-col transform transition-transform duration-200 ease-out animate-in slide-in-from-right"
        role="dialog"
        aria-modal="true"
        aria-label={`${tag} rituals sidebar`}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#2e2c29] flex items-start justify-between gap-4 bg-[#1e1d1b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#cc785c]/10 border border-[#cc785c]/25 flex items-center justify-center text-lg text-[#d97757]">
              {tag === 'travel' ? (
                <Plane className="w-5 h-5 text-[#cc785c]" />
              ) : (
                <Sparkles className="w-5 h-5 text-[#cc785c]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight capitalize">
                  {tag} Rituals
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#2e2c29] text-[#cc785c] border border-[#3d3a35]">
                  {tag}
                </span>
              </div>
              <p className="text-xs text-[#8e8c87] mt-0.5">
                {tag === 'travel'
                  ? 'Favorite travel destinations to return to'
                  : 'Cultural moments and events to revisit'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#2e2c29] transition-colors cursor-pointer"
            aria-label="Close rituals sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action / Add Bar */}
        <div className="px-5 py-3 border-b border-[#2e2c29] bg-[#161514] flex items-center justify-between">
          <span className="text-xs font-medium text-[#8e8c87]">
            {rituals.length} {rituals.length === 1 ? 'ritual' : 'rituals'} saved
          </span>

          {!isFormOpen && (
            <button
              type="button"
              onClick={openCreateForm}
              className="h-8 px-3 rounded-lg bg-[#cc785c] hover:bg-[#d97757] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add ritual</span>
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Form (Add or Edit) */}
          {isFormOpen && (
            <div className="p-4 rounded-2xl border border-[#cc785c]/40 bg-[#1e1d1b] shadow-lg animate-in fade-in duration-150 relative">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#2e2c29]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="text-base">{formEmoji}</span>
                  <span>{editingRitual ? 'Edit Ritual' : 'New Ritual'}</span>
                </h3>
                <button
                  type="button"
                  onClick={closeForm}
                  className="p-1 rounded-md text-[#8e8c87] hover:text-white hover:bg-[#2a2825]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && (
                <div className="mb-3 p-2.5 rounded-lg bg-red-950/50 border border-red-800/60 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Emoji & Title */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                    Emoji & Title
                  </label>
                  <div className="flex items-center gap-2 relative">
                    {/* Emoji Selector Button */}
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker((prev) => !prev)}
                      className="w-10 h-10 rounded-xl bg-[#161514] border border-[#2e2c29] hover:border-[#cc785c] flex items-center justify-center text-xl transition-colors cursor-pointer shrink-0"
                      title="Choose emoji"
                    >
                      {formEmoji}
                    </button>

                    {/* Title Input */}
                    <input
                      type="text"
                      required
                      placeholder={
                        tag === 'travel'
                          ? 'e.g. Lisbon in spring'
                          : 'e.g. Proms at Royal Albert Hall'
                      }
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="flex-1 h-10 px-3 rounded-xl bg-[#161514] border border-[#2e2c29] focus:border-[#cc785c] focus:outline-hidden text-sm text-white placeholder-[#63615b] transition-colors"
                      autoFocus
                    />
                  </div>

                  {/* Emoji Picker Popover */}
                  {showEmojiPicker && (
                    <div
                      ref={emojiPickerRef}
                      className="absolute z-60 left-0 right-0 mt-2 p-3 rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] shadow-2xl space-y-2.5 animate-in fade-in zoom-in-95 duration-150"
                    >
                      {/* Search */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#8e8c87] absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search emoji, e.g. flight, art..."
                          value={emojiSearch}
                          onChange={(e) => setEmojiSearch(e.target.value)}
                          className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-[#161514] border border-[#2e2c29] text-xs text-white placeholder-[#63615b] focus:border-[#cc785c] focus:outline-hidden"
                        />
                      </div>

                      {/* Categories */}
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] custom-scrollbar">
                        {EMOJI_CATEGORIES.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedEmojiCategory(cat)}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                              selectedEmojiCategory === cat
                                ? 'bg-[#cc785c] text-white'
                                : 'bg-[#252320] text-[#a8a59f] hover:text-white'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* Emoji Grid */}
                      <div className="grid grid-cols-7 gap-1 max-h-44 overflow-y-auto custom-scrollbar p-1">
                        {filteredEmojis.map((item) => (
                          <button
                            key={item.char}
                            type="button"
                            onClick={() => {
                              setFormEmoji(item.char)
                              setShowEmojiPicker(false)
                            }}
                            className={`h-8 w-8 text-lg flex items-center justify-center rounded-lg transition-colors cursor-pointer select-none ${
                              formEmoji === item.char
                                ? 'bg-[#cc785c]/30 border border-[#cc785c]'
                                : 'hover:bg-[#2e2c29]'
                            }`}
                            title={item.name}
                          >
                            {item.char}
                          </button>
                        ))}
                        {filteredEmojis.length === 0 && (
                          <div className="col-span-full py-4 text-center text-xs text-[#8e8c87]">
                            No emojis found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8e8c87] mb-1.5">
                    Description <span className="text-[#63615b] font-normal lowercase">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder={
                      tag === 'travel'
                        ? 'e.g. Pastéis de nata at Manteigaria, then the 28 tram'
                        : 'e.g. Book arena standing tickets in July'
                    }
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-[#161514] border border-[#2e2c29] focus:border-[#cc785c] focus:outline-hidden text-xs text-white placeholder-[#63615b] transition-colors resize-none"
                  />
                </div>

                {/* Auto-tag Banner */}
                <div className="px-3 py-2 rounded-xl bg-[#161514] border border-[#2e2c29] flex items-center justify-between text-xs">
                  <span className="text-[#8e8c87]">Tag assignment</span>
                  <span className="font-semibold text-[#cc785c] uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full bg-[#cc785c]/10 border border-[#cc785c]/20">
                    Auto-tagged: {tag}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={isSaving}
                    className="h-8 px-3 rounded-lg border border-[#2e2c29] bg-[#22201e] hover:bg-[#2a2825] text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="h-8 px-4 rounded-lg bg-[#cc785c] hover:bg-[#d97757] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{editingRitual ? 'Update ritual' : 'Save ritual'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Skeletons while loading */}
          {isLoading && rituals.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] animate-pulse flex items-start gap-3.5"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#252320]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-[#252320] rounded-sm w-3/4" />
                    <div className="h-3 bg-[#252320] rounded-sm w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && rituals.length === 0 && !isFormOpen && (
            <div className="p-8 rounded-2xl border border-dashed border-[#2e2c29] bg-[#161514]/40 text-center space-y-3 my-6">
              <div className="w-12 h-12 rounded-2xl bg-[#22201e] border border-[#2e2c29] mx-auto flex items-center justify-center text-2xl text-[#8e8c87]">
                {tag === 'travel' ? '🗺️' : '🎭'}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">
                  No {tag} rituals yet
                </h4>
                <p className="text-xs text-[#8e8c87] mt-1 max-w-xs mx-auto leading-relaxed">
                  {tag === 'travel'
                    ? 'Save your favorite destinations, memorable spots, or recurring getaways to revisit.'
                    : 'Save cultural moments, annual festivals, or theatre events to experience again.'}
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateForm}
                className="h-8 px-3.5 rounded-lg bg-[#252320] hover:bg-[#302e2a] border border-[#2e2c29] hover:border-[#cc785c] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#cc785c]" />
                <span>Add first ritual</span>
              </button>
            </div>
          )}

          {/* Ritual Cards List */}
          <div className="space-y-3">
            {rituals.map((ritual) => {
              const isDeleting = deletingId === ritual.id
              const createdDisplay = formatCreatedAt(ritual.createdAt)

              return (
                <div
                  key={ritual.id}
                  className={`p-4 rounded-2xl border transition-all duration-150 ${
                    editingRitual?.id === ritual.id
                      ? 'border-[#cc785c] bg-[#22201e] shadow-md'
                      : 'border-[#2e2c29] bg-[#1e1d1b] hover:border-[#3d3a36] hover:bg-[#22201e]'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Ritual Emoji */}
                    <div className="w-10 h-10 rounded-xl bg-[#252320] border border-[#353330] flex items-center justify-center text-2xl shrink-0 select-none shadow-xs">
                      {ritual.emoji || (tag === 'travel' ? '✈️' : '🎭')}
                    </div>

                    {/* Ritual Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-white tracking-tight break-words">
                          {ritual.title}
                        </h4>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditForm(ritual)}
                            className="p-1 rounded-md text-[#8e8c87] hover:text-white hover:bg-[#2e2c29] transition-colors cursor-pointer"
                            title="Edit ritual"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(ritual)}
                            disabled={isDeleting}
                            className="p-1 rounded-md text-[#8e8c87] hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete ritual"
                          >
                            {isDeleting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {ritual.description && (
                        <p className="text-xs text-[#a8a59f] mt-1.5 leading-relaxed break-words">
                          {ritual.description}
                        </p>
                      )}

                      {/* Card Footer */}
                      <div className="mt-2.5 flex items-center gap-2 text-[10px] text-[#8e8c87]">
                        <span className="px-1.5 py-0.5 rounded-md bg-[#161514] border border-[#2e2c29] uppercase font-semibold tracking-wider text-[#cc785c]">
                          {ritual.tag}
                        </span>
                        {createdDisplay && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[#63615b]" />
                            <span>Added {createdDisplay}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </aside>
    </>
  )
}
