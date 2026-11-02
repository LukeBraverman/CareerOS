import { useCallback, useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar, type CareerOSTab } from '@/components/Sidebar'
import { VoiceNotesView } from '@/components/VoiceNotesView'
import { fetchSystemStatus } from '@/lib/voiceNoteApi'
import type { SystemStatus } from '@/types/voiceNote'

export function App() {
  const [activeTab, setActiveTab] = useState<CareerOSTab>('voice-notes')
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)

  const refreshStatus = useCallback(() => {
    fetchSystemStatus()
      .then(setSystemStatus)
      .catch(() => {
        // Backend may still be starting
      })
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  return (
    <div className="min-h-screen flex bg-[#141413] text-[#f0ede6] selection:bg-[#cc785c]/30 selection:text-[#f0ede6]">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        systemStatus={systemStatus}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top App Bar (Mobile only) */}
        <header className="md:hidden h-14 shrink-0 border-b border-[#2e2c29] bg-[#141413]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="p-1.5 -ml-2 rounded-lg text-[#8e8c87] hover:text-white hover:bg-[#252320] transition-colors cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-[#8e8c87]">
              <span>CareerOS</span>
              <span>/</span>
              <span className="text-[#f0ede6] capitalize font-medium">
                {activeTab.replace('-', ' ')}
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#2e2c29] bg-[#1b1a18] text-xs font-mono text-[#8e8c87]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Local Desktop</span>
          </div>
        </header>

        {/* Scrollable Content View */}
        <main className="flex-1 p-6 sm:p-8 md:p-10 max-w-6xl w-full min-w-0 space-y-8">
          {activeTab === 'voice-notes' && (
            <VoiceNotesView onStatusRefresh={refreshStatus} />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
