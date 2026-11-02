import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  HardDrive,
  KeyRound,
  Loader2,
  RefreshCw,
  Terminal,
  Wrench,
} from 'lucide-react'

export interface InstallScanItem {
  id: string
  name: string
  category: 'System Tool' | 'Python Packages' | 'Hugging Face'
  installed: boolean
  version: string
  path: string
  description: string
}

export interface InstallScanResponse {
  allInstalled: boolean
  installedCount: number
  totalCount: number
  hfTokenConfigured: boolean
  hfTokenMasked: string
  setupScriptPath: string
  items: InstallScanItem[]
}

interface InstallViewProps {
  onStatusRefresh?: () => void
}

export function InstallView({ onStatusRefresh }: InstallViewProps) {
  const [scan, setScan] = useState<InstallScanResponse | null>(null)
  const [isScanning, setIsScanning] = useState(true)
  const [scanError, setScanError] = useState<string | null>(null)

  const [hfTokenInput, setHfTokenInput] = useState('')
  const [isSavingToken, setIsSavingToken] = useState(false)
  const [tokenSavedMsg, setTokenSavedMsg] = useState<string | null>(null)

  const [isRunningInstall, setIsRunningInstall] = useState(false)
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null)
  const [installPercent, setInstallPercent] = useState(0)
  const [installStage, setInstallStage] = useState('')
  const [installLogs, setInstallLogs] = useState<string[]>([])
  const [installError, setInstallError] = useState<string | null>(null)
  const [copiedCmd, setCopiedCmd] = useState(false)

  const performScan = useCallback(async () => {
    setIsScanning(true)
    setScanError(null)
    try {
      const res = await fetch('/api/install/scan', { cache: 'no-cache' })
      if (!res.ok) {
        throw new Error(`Scan failed (HTTP ${res.status})`)
      }
      const data = (await res.json()) as InstallScanResponse
      setScan(data)
      if (onStatusRefresh) onStatusRefresh()
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Failed to scan laptop tools'
      )
    } finally {
      setIsScanning(false)
    }
  }, [onStatusRefresh])

  useEffect(() => {
    void performScan()
  }, [performScan])

  const handleSaveTokenOnly = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hfTokenInput.trim() || isSavingToken) return
    setIsSavingToken(true)
    setTokenSavedMsg(null)
    setInstallError(null)
    try {
      const res = await fetch('/api/install/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hfToken: hfTokenInput.trim() }),
      })
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as {
          detail?: string
        }
        throw new Error(errData.detail || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { scan: InstallScanResponse }
      setScan(data.scan)
      setHfTokenInput('')
      setTokenSavedMsg('Saved HF_TOKEN to CareerOS/.env')
      if (onStatusRefresh) onStatusRefresh()
    } catch (err) {
      setInstallError(
        err instanceof Error ? err.message : 'Failed to save Hugging Face token'
      )
    } finally {
      setIsSavingToken(false)
    }
  }

  const handleRunInstaller = async (options?: {
    targetId?: string
    forceVerifyModels?: boolean
  }) => {
    if (isRunningInstall) return
    const targetId = options?.targetId || 'all'

    // If PyAnnote model or all is requested and no token is configured or entered, prompt user
    const hasToken = Boolean(scan?.hfTokenConfigured || hfTokenInput.trim())
    const pyannoteInstalled = scan?.items.find(
      (i) => i.id === 'pyannote_model'
    )?.installed

    if (
      !hasToken &&
      (targetId === 'pyannote_model' ||
        options?.forceVerifyModels ||
        (targetId === 'all' && !pyannoteInstalled))
    ) {
      setInstallError(
        'Please enter your Hugging Face Read Token (hf_...) below before downloading the PyAnnote speaker detection models.'
      )
      return
    }

    setIsRunningInstall(true)
    setActiveTargetId(targetId)
    setInstallPercent(5)
    setInstallStage('Starting installer...')
    setInstallLogs(['Starting CareerOS tool & model installer...'])
    setInstallError(null)
    setTokenSavedMsg(null)

    try {
      const response = await fetch('/api/install/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hfToken: hfTokenInput.trim() || undefined,
          targetId,
          forceVerifyModels: Boolean(options?.forceVerifyModels),
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Installer request failed (HTTP ${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const chunk of parts) {
          const line = chunk
            .split('\n')
            .find((l) => l.startsWith('data: '))
          if (!line) continue
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: 'progress' | 'result' | 'error'
              stage?: string
              percent?: number
              message?: string
              scan?: InstallScanResponse
            }
            if (evt.type === 'progress') {
              if (typeof evt.percent === 'number') {
                setInstallPercent(evt.percent)
              }
              if (evt.message) {
                setInstallStage(evt.message)
                setInstallLogs((prev) => [...prev, evt.message!])
              }
            } else if (evt.type === 'result') {
              setInstallPercent(100)
              setInstallStage('Installation & verification complete!')
              if (evt.scan) setScan(evt.scan)
              setHfTokenInput('')
              if (onStatusRefresh) onStatusRefresh()
            } else if (evt.type === 'error') {
              setInstallError(evt.message || 'Installation failed')
              if (evt.scan) setScan(evt.scan)
              if (evt.message) {
                setInstallLogs((prev) => [...prev, `[ERROR] ${evt.message}`])
              }
            }
          } catch {
            // ignore malformed SSE line
          }
        }
      }
    } catch (err) {
      setInstallError(
        err instanceof Error ? err.message : 'Installer connection failed'
      )
    } finally {
      setIsRunningInstall(false)
      setActiveTargetId(null)
    }
  }

  const missingCount = scan ? scan.totalCount - scan.installedCount : 0
  const needsHfAttention = Boolean(
    scan &&
      (!scan.hfTokenConfigured ||
        scan.items.some(
          (i) => i.category === 'Hugging Face' && !i.installed
        ))
  )

  const handleCopyScriptCmd = async () => {
    try {
      await navigator.clipboard.writeText('.\\setup.bat')
      setCopiedCmd(true)
      setTimeout(() => setCopiedCmd(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Install &amp; Setup
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Scans this laptop for required tools (`ffmpeg`, `yt-dlp`, `aws`,
            Python AI) and Hugging Face Whisper + PyAnnote models
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={isScanning || isRunningInstall}
            onClick={() => void performScan()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#2e2c29] bg-[#1e1d1b] hover:bg-[#252320] disabled:opacity-50 text-xs font-medium text-[#f0ede6] transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-[#cc785c]' : 'text-[#8e8c87]'}`}
            />
            <span>{isScanning ? 'Scanning Laptop…' : 'Re-Scan Laptop'}</span>
          </button>

          <button
            type="button"
            disabled={isScanning || isRunningInstall}
            onClick={() =>
              void handleRunInstaller({
                targetId: 'all',
                forceVerifyModels: missingCount === 0,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#cc785c] hover:bg-[#d9886c] disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            {isRunningInstall && activeTargetId === 'all' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Installing…</span>
              </>
            ) : missingCount > 0 ? (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Install Missing ({missingCount})</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verify All &amp; Models</span>
              </>
            )}
          </button>
        </div>
      </div>

      {scanError && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{scanError}</span>
        </div>
      )}

      {/* Overall Laptop Readiness Banner */}
      {scan && (
        <div
          className={`rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            scan.allInstalled
              ? 'border-emerald-800/50 bg-emerald-950/20'
              : 'border-amber-700/60 bg-amber-950/20'
          }`}
        >
          <div className="flex items-start gap-3.5">
            {scan.allInstalled ? (
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Wrench className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-sm font-semibold text-white">
                {scan.allInstalled
                  ? `All ${scan.totalCount} CareerOS tools & Hugging Face models are installed on this laptop`
                  : `${scan.installedCount} of ${scan.totalCount} tools & models installed (${missingCount} missing)`}
              </h2>
              <p className="text-xs text-[#c2bfb8] mt-0.5">
                {scan.allInstalled
                  ? 'Voice Notes offline transcription, speaker diarization, and S3 video link downloading are ready.'
                  : 'Enter your Hugging Face token below if needed and click "Install Missing" to set up everything automatically.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1 rounded-full text-xs font-mono border border-[#2e2c29] bg-[#141413] text-[#f0ede6]">
              {scan.installedCount}/{scan.totalCount} Ready
            </span>
          </div>
        </div>
      )}

      {/* Hugging Face Token & Whisper / PyAnnote Setup Card */}
      <div
        className={`rounded-2xl border p-5 space-y-4 ${
          needsHfAttention
            ? 'border-[#cc785c]/80 bg-[#1e1d1b] shadow-md'
            : 'border-[#2e2c29] bg-[#1e1d1b]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-[#cc785c]" />
            <h2 className="text-sm font-semibold text-white">
              Hugging Face Token &amp; Whisper / PyAnnote Model Installer
            </h2>
          </div>
          {scan && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                scan.hfTokenConfigured
                  ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-700/50 text-amber-300'
              }`}
            >
              {scan.hfTokenConfigured
                ? `Token Configured (${scan.hfTokenMasked})`
                : 'HF_TOKEN Required'}
            </span>
          )}
        </div>

        <p className="text-xs text-[#c2bfb8] leading-relaxed">
          PyAnnote speaker diarization downloads gated weights from Hugging
          Face. Before installing on a new laptop, accept the free model terms on
          Hugging Face and paste a Read token (`hf_...`):
        </p>

        <div className="flex flex-wrap gap-2 text-xs">
          <a
            href="https://huggingface.co/pyannote/speaker-diarization-3.1"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#2e2c29] bg-[#141413] hover:border-[#cc785c] text-[#f0ede6] transition-colors"
          >
            <span>1. speaker-diarization-3.1</span>
            <ExternalLink className="w-3 h-3 text-[#8e8c87]" />
          </a>
          <a
            href="https://huggingface.co/pyannote/segmentation-3.0"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#2e2c29] bg-[#141413] hover:border-[#cc785c] text-[#f0ede6] transition-colors"
          >
            <span>2. segmentation-3.0</span>
            <ExternalLink className="w-3 h-3 text-[#8e8c87]" />
          </a>
          <a
            href="https://huggingface.co/pyannote/speaker-diarization-community-1"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#2e2c29] bg-[#141413] hover:border-[#cc785c] text-[#f0ede6] transition-colors"
          >
            <span>3. speaker-diarization-community-1</span>
            <ExternalLink className="w-3 h-3 text-[#8e8c87]" />
          </a>
          <a
            href="https://huggingface.co/settings/tokens"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#cc785c]/50 bg-[#cc785c]/10 hover:bg-[#cc785c]/20 text-[#f0ede6] transition-colors"
          >
            <span>Get HF Read Token (hf_...)</span>
            <ExternalLink className="w-3 h-3 text-[#cc785c]" />
          </a>
        </div>

        <form
          onSubmit={handleSaveTokenOnly}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1"
        >
          <input
            type="password"
            value={hfTokenInput}
            disabled={isRunningInstall || isSavingToken}
            onChange={(e) => setHfTokenInput(e.target.value)}
            placeholder={
              scan?.hfTokenConfigured
                ? `Current token: ${scan.hfTokenMasked} (enter new hf_... to replace)`
                : 'Paste your Hugging Face Read Token (hf_...)'
            }
            className="flex-1 px-3.5 py-2 rounded-xl border border-[#2e2c29] bg-[#141413] text-xs font-mono text-[#f0ede6] placeholder:text-[#8e8c87] focus:outline-none focus:border-[#cc785c]"
          />
          <button
            type="submit"
            disabled={!hfTokenInput.trim() || isRunningInstall || isSavingToken}
            className="px-3.5 py-2 rounded-xl border border-[#2e2c29] bg-[#22201e] hover:bg-[#2e2c29] disabled:opacity-50 text-xs font-medium text-[#f0ede6] transition-colors cursor-pointer"
          >
            {isSavingToken ? 'Saving…' : 'Save Token'}
          </button>
          <button
            type="button"
            disabled={isRunningInstall}
            onClick={() =>
              void handleRunInstaller({
                targetId: 'pyannote_model',
                forceVerifyModels: true,
              })
            }
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#cc785c] hover:bg-[#d9886c] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            {isRunningInstall && activeTargetId === 'pyannote_model' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Downloading Models…</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download &amp; Verify HF Models</span>
              </>
            )}
          </button>
        </form>

        {tokenSavedMsg && (
          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{tokenSavedMsg}</span>
          </p>
        )}
      </div>

      {/* Live Installer Progress & Console */}
      {(isRunningInstall || installLogs.length > 0 || installError) && (
        <div className="rounded-2xl border border-[#2e2c29] bg-[#141413] p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[#f0ede6] font-medium">
              {isRunningInstall ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#cc785c]" />
              ) : installError ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              <span>{installStage || 'Installer Output'}</span>
            </div>
            <span className="font-mono text-[#8e8c87]">{installPercent}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-[#22201e] overflow-hidden">
            <div
              className="h-full bg-[#cc785c] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(4, installPercent))}%` }}
            />
          </div>

          {installError && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{installError}</span>
            </div>
          )}

          {installLogs.length > 0 && (
            <div className="rounded-xl border border-[#2e2c29] bg-black/70 p-3.5 font-mono text-[11px] text-[#c2bfb8] max-h-48 overflow-y-auto space-y-1">
              {installLogs.map((line, i) => (
                <div key={i} className="leading-relaxed">
                  <span className="text-[#8e8c87] mr-2">&gt;</span>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scanned Laptop Tools & Models Grid */}
      {isScanning && !scan ? (
        <div className="rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-10 text-center text-sm text-[#8e8c87] flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#cc785c]" />
          <span>Scanning laptop tools and Hugging Face model cache…</span>
        </div>
      ) : (
        scan && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scan.items.map((item) => {
              const isItemRunning =
                isRunningInstall && activeTargetId === item.id

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {item.category === 'Hugging Face' ? (
                          <Cpu className="w-4 h-4 text-[#cc785c] shrink-0" />
                        ) : (
                          <HardDrive className="w-4 h-4 text-[#cc785c] shrink-0" />
                        )}
                        <h3 className="text-sm font-semibold text-white leading-snug">
                          {item.name}
                        </h3>
                      </div>

                      {item.installed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/50 border border-emerald-700/50 text-emerald-300 shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          Installed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/50 border border-amber-700/50 text-amber-300 shrink-0">
                          <AlertCircle className="w-3 h-3" />
                          Missing
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#8e8c87] leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#2e2c29]/80 flex items-center justify-between gap-2 text-[11px]">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[#c2bfb8] truncate">
                        {item.version}
                      </div>
                      <div
                        className="font-mono text-[10px] text-[#8e8c87] truncate"
                        title={item.path}
                      >
                        {item.path}
                      </div>
                    </div>

                    {item.id !== 'hf_token' && (
                      <button
                        type="button"
                        disabled={isRunningInstall}
                        onClick={() =>
                          void handleRunInstaller({
                            targetId: item.id,
                            forceVerifyModels: item.category === 'Hugging Face',
                          })
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors shrink-0 cursor-pointer disabled:opacity-50 ${
                          item.installed
                            ? 'border-[#2e2c29] bg-[#22201e] hover:bg-[#2e2c29] text-[#c2bfb8]'
                            : 'border-[#cc785c] bg-[#cc785c] hover:bg-[#d9886c] text-white'
                        }`}
                      >
                        {isItemRunning ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Working…
                          </span>
                        ) : item.installed ? (
                          'Re-verify'
                        ) : (
                          'Install'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* CLI Startup Installer Script Reference */}
      <div className="rounded-2xl border border-[#2e2c29] bg-[#1e1d1b] p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#cc785c]" />
            <h2 className="text-sm font-semibold text-white">
              Standalone Startup Installer Script (`setup.bat` / `setup.ps1`)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyScriptCmd()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#2e2c29] bg-[#141413] hover:bg-[#252320] text-xs text-[#c2bfb8] transition-colors cursor-pointer"
          >
            {copiedCmd ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Command</span>
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-[#8e8c87]">
          When cloning CareerOS onto a fresh laptop before the server is running,
          double-click <code className="text-[#f0ede6]">setup.bat</code> or run{' '}
          <code className="text-[#f0ede6]">.\setup.ps1</code> in PowerShell to
          install <code className="text-[#f0ede6]">ffmpeg</code>,{' '}
          <code className="text-[#f0ede6]">yt-dlp</code>,{' '}
          <code className="text-[#f0ede6]">aws</code>,{' '}
          <code className="text-[#f0ede6]">node</code>, Python packages, and
          pre-download the Whisper &amp; PyAnnote models from Hugging Face:
        </p>

        <div className="rounded-xl border border-[#2e2c29] bg-[#141413] px-3.5 py-2.5 font-mono text-xs text-[#f0ede6] flex items-center justify-between">
          <span>.\setup.bat</span>
          <span className="text-[11px] text-[#8e8c87]">
            {scan?.setupScriptPath || 'CareerOS\\setup.ps1'}
          </span>
        </div>
      </div>
    </div>
  )
}
