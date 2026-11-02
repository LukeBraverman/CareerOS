# CareerOS — Local Desktop Suite

**CareerOS** is a locally hosted personal desktop application built with **FastAPI (Python)** and **React 19 + TypeScript + Tailwind CSS v4** in the MeInc dark-mode aesthetic.

## Modules

### 1. Voice Notes (`faster-whisper` + `pyannote.audio`)
100% local, offline speech-to-text and speaker diarization GUI:
- **Drag & Drop Audio**: Drop `.m4a`, `.mp3`, `.wav`, `.aac`, `.ogg`, `.flac`, or `.mp4` files directly into the app.
- **Live Pipeline Progress**: Real-time SSE progress streaming across FFmpeg 16kHz WAV conversion, PyAnnote 3.1 speaker detection, and `faster-whisper` transcription.
- **Warm Model Caching**: Keeps Whisper and PyAnnote models cached in memory across runs for zero cold-start delay on subsequent recordings.
- **Interactive Speaker Timeline & Audio Player**:
  - Click any `[MM:SS -> MM:SS]` timestamp to jump audio playback directly to that moment.
  - Rename speaker labels (e.g. `SPEAKER_00` → `Luke`) inline and automatically update the entire transcript and `.transcript.txt` file.
  - One-click **Copy Transcript**, **Copy AI Analysis Prompt** (ready for Notion + AI meeting analysis), and **Download `.transcript.txt`**.

---

## Quick Launch (Windows Desktop)

Double-click **`launch-careeros.bat`** (or the **CareerOS** shortcut on your Desktop), or run:

```powershell
.\launch-careeros.bat
```

This starts the local FastAPI backend on `http://localhost:8420` and opens CareerOS in a frameless native-style desktop window.

---

## Development

```powershell
# Start the Python backend (port 8420)
python backend/server.py

# In a second terminal, run Vite dev server with hot reload (port 5173)
cd frontend
npm run dev
```

### Build Frontend for Production
```powershell
cd frontend
npm run lint
npm run build
```
