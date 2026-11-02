#!/usr/bin/env python3
"""
CareerOS Local Desktop Backend Server (FastAPI)
Serves the CareerOS React frontend and provides APIs for local Voice Note transcription,
real-time SSE progress streaming, audio playback, speaker renaming, and history persistence.
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from transcriber import format_timestamp, get_system_status, transcribe_audio

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(__file__).resolve().parent / "data"
AUDIO_DIR = DATA_DIR / "audio"
TRANSCRIPTS_DIR = DATA_DIR / "transcripts"
HISTORY_FILE = DATA_DIR / "history.json"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

AUDIO_DIR.mkdir(parents=True, exist_ok=True)
TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

_HISTORY_LOCK = threading.Lock()


def _load_history() -> list[dict[str, Any]]:
    if not HISTORY_FILE.exists():
        return []
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_history(items: list[dict[str, Any]]) -> None:
    HISTORY_FILE.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")


def _rebuild_raw_transcript(segments: list[dict[str, Any]], speaker_names: dict[str, str]) -> str:
    lines: list[str] = []
    for seg in segments:
        raw_spk = seg.get("speaker", "SPEAKER_00")
        display_spk = speaker_names.get(raw_spk, raw_spk).strip() or raw_spk
        start_fmt = seg.get("startFormatted") or format_timestamp(float(seg.get("start", 0.0)))
        end_fmt = seg.get("endFormatted") or format_timestamp(float(seg.get("end", 0.0)))
        lines.append(f"[{start_fmt} -> {end_fmt}] {display_spk}: {seg.get('text', '')}\n")
    return "".join(lines)


app = FastAPI(title="CareerOS Local Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status")
def api_status() -> dict[str, Any]:
    return get_system_status()


@app.get("/api/history")
def api_get_history() -> list[dict[str, Any]]:
    with _HISTORY_LOCK:
        return _load_history()


class UpdateHistoryPayload(BaseModel):
    title: str | None = None
    speakerNames: dict[str, str] | None = None


@app.patch("/api/history/{job_id}")
def api_update_history(job_id: str, payload: UpdateHistoryPayload) -> dict[str, Any]:
    with _HISTORY_LOCK:
        items = _load_history()
        for item in items:
            if item.get("id") == job_id:
                if payload.title is not None:
                    item["title"] = payload.title.strip() or item["fileName"]
                if payload.speakerNames is not None:
                    item["speakerNames"] = payload.speakerNames
                    item["rawTranscript"] = _rebuild_raw_transcript(
                        item.get("segments", []),
                        item["speakerNames"],
                    )
                    transcript_path = TRANSCRIPTS_DIR / f"{job_id}.transcript.txt"
                    transcript_path.write_text(item["rawTranscript"], encoding="utf-8")
                _save_history(items)
                return item
    raise HTTPException(status_code=404, detail="Voice note record not found")


@app.delete("/api/history/{job_id}")
def api_delete_history(job_id: str) -> dict[str, bool]:
    with _HISTORY_LOCK:
        items = _load_history()
        target = next((x for x in items if x.get("id") == job_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="Voice note record not found")
        remaining = [x for x in items if x.get("id") != job_id]
        _save_history(remaining)

    audio_file = target.get("storedAudioFile")
    if audio_file:
        (AUDIO_DIR / audio_file).unlink(missing_ok=True)
    (TRANSCRIPTS_DIR / f"{job_id}.transcript.txt").unlink(missing_ok=True)
    return {"deleted": True}


@app.get("/api/audio/{job_id}")
def api_get_audio(job_id: str):
    with _HISTORY_LOCK:
        items = _load_history()
        target = next((x for x in items if x.get("id") == job_id), None)
    if not target or not target.get("storedAudioFile"):
        raise HTTPException(status_code=404, detail="Audio file not found")
    audio_path = AUDIO_DIR / target["storedAudioFile"]
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file missing on disk")
    return FileResponse(audio_path, filename=target.get("fileName", audio_path.name))


@app.get("/api/transcript/{job_id}/download")
def api_download_transcript(job_id: str):
    with _HISTORY_LOCK:
        items = _load_history()
        target = next((x for x in items if x.get("id") == job_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Transcript not found")
    transcript_path = TRANSCRIPTS_DIR / f"{job_id}.transcript.txt"
    if not transcript_path.exists():
        transcript_path.write_text(target.get("rawTranscript", ""), encoding="utf-8")
    stem = Path(target.get("fileName", "voice_note")).stem
    return FileResponse(
        transcript_path,
        media_type="text/plain; charset=utf-8",
        filename=f"{stem}.transcript.txt",
    )


@app.post("/api/transcribe")
async def api_transcribe(
    file: UploadFile = File(...),
    model: str = Form("base"),
    diarize: str = Form("true"),
    token: str = Form(""),
):
    allowed_models = {"tiny", "base", "small", "medium", "large-v3"}
    model_size = model if model in allowed_models else "base"
    do_diarize = diarize.lower() in ("true", "1", "yes", "on")
    custom_token = token.strip() or None

    job_id = str(uuid.uuid4())
    original_name = file.filename or "voice_note.m4a"
    safe_ext = Path(original_name).suffix.lower() or ".m4a"
    stored_audio_name = f"{job_id}{safe_ext}"
    stored_audio_path = AUDIO_DIR / stored_audio_name

    with stored_audio_path.open("wb") as out_f:
        shutil.copyfileobj(file.file, out_f)

    file_size_bytes = stored_audio_path.stat().st_size
    event_queue: queue.Queue[dict[str, Any] | None] = queue.Queue()

    def progress_callback(evt: dict[str, Any]):
        event_queue.put(evt)

    def worker():
        try:
            result = transcribe_audio(
                audio_path=stored_audio_path,
                model_size=model_size,
                token=custom_token,
                diarize=do_diarize,
                on_progress=progress_callback,
            )
            transcript_file = TRANSCRIPTS_DIR / f"{job_id}.transcript.txt"
            transcript_file.write_text(result["rawTranscript"], encoding="utf-8")

            speaker_names = {spk: spk for spk in result["speakers"]}
            job_record = {
                "id": job_id,
                "title": Path(original_name).stem,
                "fileName": original_name,
                "fileSizeBytes": file_size_bytes,
                "storedAudioFile": stored_audio_name,
                "transcriptFilePath": str(transcript_file.resolve()),
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "speakerNames": speaker_names,
                **result,
            }

            with _HISTORY_LOCK:
                history = _load_history()
                history.insert(0, job_record)
                _save_history(history[:50])

            event_queue.put({"type": "result", "job": job_record})
        except Exception as exc:
            stored_audio_path.unlink(missing_ok=True)
            event_queue.put({"type": "error", "message": str(exc)})
        finally:
            event_queue.put(None)

    threading.Thread(target=worker, daemon=True).start()

    async def event_generator():
        while True:
            try:
                item = await asyncio.to_thread(event_queue.get, True, 0.5)
            except queue.Empty:
                yield ": keep-alive\n\n"
                continue
            if item is None:
                break
            yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# Serve built React frontend if available
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("CAREEROS_PORT", "8420"))
    print(f"Starting CareerOS Local Desktop Server on http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
