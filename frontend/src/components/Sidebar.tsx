import {
  Mic,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  X,
  Briefcase,
} from 'lucide-react'
import type { SystemStatus } from '@/types/voiceNote'

export type CareerOSTab = 'voice-notes'

interface SidebarProps {
  activeTab: CareerOSTab
  onTabChange: (tab: CareerOSTab) => void
  systemStatus: SystemStatus | null
  isMobileOpen?: boolean
  onCloseMobile?: () => void
}

export function Sidebar({
  activeTab,
  onTabChange,
  systemStatus,
  isMobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const navItems = [
    {
      id: 'voice-notes' as const,
      label: 'Voice Notes',
      icon: Mic,
      badge: 'Local AI',
    },
  ]

  const content = (
    <div className="h-full flex flex-col justify-between bg-[#1b1a18] text-[#f0ede6] select-none">
      <div>
        {/* Top Header: Terracotta rounded square + CareerOS title */}
        <div className="flex items-center justify-between px-5 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl bg-[#cc785c] shrink-0 shadow-sm flex items-center justify-center text-white"
              aria-hidden="true"
            >
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-semibold tracking-tight text-white block leading-none">
                CareerOS
              </span>
              <span className="text-[11px] font-mono text-[#8e8c87] mt-1 block">
                MeInc Desktop
              </span>
            </div>
          </div>

          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#2e2c29] md:hidden transition-colors cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Section Header: MODULES */}
        <div className="mt-7 px-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#8e8c87]">
            MODULES
          </span>
        </div>

        {/* Navigation items */}
        <nav className="mt-2.5 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTabChange(item.id)
                  if (onCloseMobile) onCloseMobile()
                }}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left cursor-pointer ${
                  isActive
                    ? 'bg-[#2e2c29] text-white shadow-xs'
                    : 'text-[#c2bfb8] hover:text-white hover:bg-[#252320]/60'
                }`}
              >
                <span className="flex items-center gap-3.5 min-w-0">
                  <Icon
                    className="h-5 w-5 text-[#cc785c] shrink-0 transition-transform duration-150"
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && (
                  <span className="px-2 py-0.5 rounded-md bg-[#cc785c]/15 border border-[#cc785c]/30 text-[10px] font-mono text-[#e2957b] shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Bottom local engine status section */}
      <div className="px-4 pb-5 space-y-3">
        {systemStatus && (
          <div className="rounded-xl border border-[#2e2c29] bg-[#141413]/80 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[#c2bfb8]">
              <span className="flex items-center gap-1.5 font-medium">
                <Cpu className="w-3.5 h-3.5 text-[#cc785c]" />
                Engine Hardware
              </span>
              <span className="font-mono text-[11px] uppercase text-white bg-[#252320] px-1.5 py-0.5 rounded">
                {systemStatus.whisperDevice} · {systemStatus.whisperCompute}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#8e8c87]">
              <span>FFmpeg</span>
              {systemStatus.ffmpegAvailable ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="w-3 h-3" /> Missing
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#8e8c87]">
              <span>PyAnnote Diarization</span>
              {systemStatus.hfTokenConfigured ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="w-3 h-3" /> No Token
                </span>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-[#2e2c29] pt-3.5 flex items-center justify-between text-xs text-[#8e8c87]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500/80 animate-pulse" />
            <span className="font-mono text-[11px]">CareerOS Local</span>
          </div>
          <span className="text-[11px] font-mono text-[#8e8c87]">127.0.0.1:8420</span>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-[#2e2c29]">
        {content}
      </aside>

      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[85vw] border-r border-[#2e2c29] shadow-2xl z-10">
            {content}
          </aside>
        </div>
      )}
    </>
  )
}
