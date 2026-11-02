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
_ACTIVE_JOB: dict[str, Any] | None = None


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
    status = get_system_status()
    status["activeJob"] = _ACTIVE_JOB
    return status


@app.get("/api/active-job")
def api_active_job() -> dict[str, Any]:
    return {"activeJob": _ACTIVE_JOB}


_VIDEOS_BUCKET = "meinc-motivation-videos-027939434555"
_VIDEOS_REGION = "eu-west-2"
_VIDEOS_MANIFEST_URL = f"https://{_VIDEOS_BUCKET}.s3.{_VIDEOS_REGION}.amazonaws.com/manifest.json"
_VIDEOS_LOCK = threading.Lock()


def _resolve_video_tools() -> tuple[str, str, str]:
    yt_dlp = shutil.which("yt-dlp") or r"C:\Users\User\Documents\SOVHQDawnload\Ytdlp\yt-dlp.exe"
    ffmpeg_bin_dir = Path(r"C:\Users\User\Documents\SOVHQDawnload\ffmpeg-7.1.1-essentials_build\ffmpeg-7.1.1-essentials_build\bin")
    ffmpeg = shutil.which("ffmpeg") or str(ffmpeg_bin_dir / "ffmpeg.exe")
    ffprobe = shutil.which("ffprobe") or str(ffmpeg_bin_dir / "ffprobe.exe")
    return yt_dlp, ffmpeg, ffprobe


def _fetch_videos_manifest() -> dict[str, Any]:
    import subprocess
    import urllib.request

    try:
        proc = subprocess.run(
            ["aws", "s3", "cp", f"s3://{_VIDEOS_BUCKET}/manifest.json", "-", "--region", _VIDEOS_REGION],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=12,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return json.loads(proc.stdout)
    except Exception:
        pass

    req = urllib.request.Request(_VIDEOS_MANIFEST_URL, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _save_videos_manifest(manifest: dict[str, Any]) -> None:
    import subprocess
    import tempfile

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp:
        json.dump(manifest, tmp, indent=2, ensure_ascii=False)
        tmp_path = Path(tmp.name)

    try:
        up = subprocess.run(
            [
                "aws",
                "s3",
                "cp",
                str(tmp_path),
                f"s3://{_VIDEOS_BUCKET}/manifest.json",
                "--region",
                _VIDEOS_REGION,
                "--content-type",
                "application/json",
                "--cache-control",
                "no-cache, no-store, must-revalidate",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=20,
        )
        if up.returncode != 0:
            raise RuntimeError(up.stderr.strip() or "aws s3 cp failed")
    finally:
        tmp_path.unlink(missing_ok=True)


@app.get("/api/videos")
def api_get_videos() -> dict[str, Any]:
    try:
        return _fetch_videos_manifest()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch videos manifest: {exc}")


class UpdateVideoPayload(BaseModel):
    favourite: bool | None = None
    title: str | None = None
    tag: str | None = None


@app.patch("/api/videos/{video_id}")
def api_update_video(video_id: str, payload: UpdateVideoPayload) -> dict[str, Any]:
    with _VIDEOS_LOCK:
        try:
            manifest = _fetch_videos_manifest()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to load videos manifest: {exc}")

        videos = manifest.get("videos", [])
        if not isinstance(videos, list):
            videos = []

        target = next((v for v in videos if v.get("id") == video_id), None)
        if not target:
            raise HTTPException(status_code=404, detail=f"Video '{video_id}' not found")

        if payload.favourite is not None:
            target["favourite"] = bool(payload.favourite)
        if payload.title is not None and payload.title.strip():
            target["title"] = payload.title.strip()
        if payload.tag is not None:
            clean_tag = payload.tag.strip()
            if clean_tag:
                target["tag"] = clean_tag
            else:
                target.pop("tag", None)

        try:
            _save_videos_manifest(manifest)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to save manifest to S3: {exc}")

        return target


class AddVideoPayload(BaseModel):
    url: str
    title: str | None = None
    tag: str | None = None
    startTime: str | None = None
    endTime: str | None = None


@app.post("/api/videos")
def api_add_video(payload: AddVideoPayload) -> dict[str, Any]:
    import re
    import subprocess
    import tempfile

    source_url = payload.url.strip()
    if not source_url:
        raise HTTPException(status_code=400, detail="Video URL is required")

    yt_dlp, ffmpeg, ffprobe = _resolve_video_tools()
    if not Path(yt_dlp).exists() and not shutil.which(yt_dlp):
        raise HTTPException(status_code=500, detail=f"yt-dlp not found at {yt_dlp}")
    if not Path(ffmpeg).exists() and not shutil.which(ffmpeg):
        raise HTTPException(status_code=500, detail=f"ffmpeg not found at {ffmpeg}")

    ffmpeg_dir = str(Path(ffmpeg).resolve().parent)

    with tempfile.TemporaryDirectory(prefix="careeros_video_") as tmpdir_str:
        tmpdir = Path(tmpdir_str)

        # 1. Inspect metadata via yt-dlp --dump-json
        meta_proc = subprocess.run(
            [yt_dlp, "--dump-json", "--no-playlist", source_url],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=90,
        )
        if meta_proc.returncode != 0:
            err_msg = (meta_proc.stderr or meta_proc.stdout or "yt-dlp failed").strip().splitlines()[-1]
            raise HTTPException(status_code=400, detail=f"Could not read video link: {err_msg}")

        first_json_line = next((line for line in meta_proc.stdout.splitlines() if line.strip().startswith("{")), "")
        info = json.loads(first_json_line) if first_json_line else {}

        raw_id = str(info.get("id") or uuid.uuid4().hex[:11])
        extractor = str(info.get("extractor_key") or info.get("extractor") or "").lower()
        if "linkedin" in extractor or "linkedin.com" in source_url.lower():
            if not raw_id.startswith("li_"):
                raw_id = f"li_{raw_id}"

        safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", raw_id).strip("_") or uuid.uuid4().hex[:11]
        start_time = (payload.startTime or "").strip()
        end_time = (payload.endTime or "").strip()
        if start_time or end_time:
            clip_slug = re.sub(r"[^A-Za-z0-9]", "", f"{start_time}_{end_time}")
            if clip_slug:
                safe_id = f"{safe_id}_{clip_slug}"

        detected_title = str(info.get("title") or safe_id).strip()
        final_title = (payload.title or "").strip() or detected_title
        if (start_time or end_time) and not (payload.title or "").strip():
            clip_label = f"{start_time or '0:00'}-{end_time or 'end'}"
            final_title = f"{final_title} (clip {clip_label})"

        # 2. Download video + thumbnail via yt-dlp
        dl_template = str(tmpdir / "raw.%(ext)s")
        dl_cmd = [
            yt_dlp,
            "--no-playlist",
            "--ffmpeg-location",
            ffmpeg_dir,
            "-f",
            "bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/best[vcodec^=avc1][height<=1080]/best[ext=mp4]/best",
            "--merge-output-format",
            "mp4",
            "--write-thumbnail",
            "--convert-thumbnails",
            "jpg",
            "-o",
            dl_template,
            source_url,
        ]
        dl_proc = subprocess.run(
            dl_cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=600,
        )
        if dl_proc.returncode != 0:
            err_msg = (dl_proc.stderr or dl_proc.stdout or "Video download failed").strip().splitlines()[-1]
            raise HTTPException(status_code=500, detail=f"Video download failed: {err_msg}")

        downloaded_video = next(
            (p for p in tmpdir.glob("raw.*") if p.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"}),
            None,
        )
        if not downloaded_video or not downloaded_video.exists():
            raise HTTPException(status_code=500, detail="Downloaded video file not found")

        # 3. Process / trim / faststart video with ffmpeg
        final_mp4 = tmpdir / f"{safe_id}.mp4"
        if start_time or end_time:
            ff_cmd = [ffmpeg, "-y"]
            if start_time:
                ff_cmd += ["-ss", start_time]
            if end_time:
                ff_cmd += ["-to", end_time]
            ff_cmd += [
                "-i",
                str(downloaded_video),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "22",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                str(final_mp4),
            ]
        else:
            # Check video codec via ffprobe; copy if already h264, otherwise transcode to h264
            codec_proc = subprocess.run(
                [
                    ffprobe,
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=codec_name",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(downloaded_video),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=30,
            )
            vcodec = codec_proc.stdout.strip().lower()
            if vcodec == "h264" and downloaded_video.suffix.lower() == ".mp4":
                ff_cmd = [
                    ffmpeg,
                    "-y",
                    "-i",
                    str(downloaded_video),
                    "-c",
                    "copy",
                    "-movflags",
                    "+faststart",
                    str(final_mp4),
                ]
            else:
                ff_cmd = [
                    ffmpeg,
                    "-y",
                    "-i",
                    str(downloaded_video),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "23",
                    "-c:a",
                    "aac",
                    "-movflags",
                    "+faststart",
                    str(final_mp4),
                ]

        ff_proc = subprocess.run(ff_cmd, capture_output=True, text=True, encoding="utf-8", timeout=600)
        if ff_proc.returncode != 0 or not final_mp4.exists():
            raise HTTPException(status_code=500, detail="ffmpeg failed to process video")

        # 4. Probe exact duration via ffprobe
        dur_proc = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(final_mp4),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=30,
        )
        try:
            duration_seconds = round(float(dur_proc.stdout.strip()), 2)
        except Exception:
            duration_seconds = round(float(info.get("duration") or 0.0), 2)

        # 5. Prepare thumbnail JPG via ffmpeg (either from yt-dlp thumbnail or extracted video frame)
        final_thumb = tmpdir / f"{safe_id}.jpg"
        raw_thumb = next(
            (p for p in tmpdir.glob("raw.*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}),
            None,
        )
        if raw_thumb and raw_thumb.exists() and not (start_time or end_time):
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-i",
                    str(raw_thumb),
                    "-vf",
                    "scale='min(1280,iw)':-2",
                    "-q:v",
                    "2",
                    str(final_thumb),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=30,
            )

        if not final_thumb.exists() or final_thumb.stat().st_size == 0:
            seek_sec = min(2.0, max(0.0, duration_seconds * 0.15))
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-ss",
                    f"{seek_sec:.2f}",
                    "-i",
                    str(final_mp4),
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale='min(1280,iw)':-2",
                    "-q:v",
                    "2",
                    str(final_thumb),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=30,
            )

        if not final_thumb.exists():
            raise HTTPException(status_code=500, detail="ffmpeg failed to generate thumbnail image")

        # 6. Upload MP4 and Thumbnail JPG to S3
        video_key = f"videos/{safe_id}.mp4"
        thumb_key = f"thumbnails/{safe_id}.jpg"

        up_vid = subprocess.run(
            [
                "aws",
                "s3",
                "cp",
                str(final_mp4),
                f"s3://{_VIDEOS_BUCKET}/{video_key}",
                "--region",
                _VIDEOS_REGION,
                "--content-type",
                "video/mp4",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=300,
        )
        if up_vid.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to upload video to S3: {up_vid.stderr.strip()}")

        up_thumb = subprocess.run(
            [
                "aws",
                "s3",
                "cp",
                str(final_thumb),
                f"s3://{_VIDEOS_BUCKET}/{thumb_key}",
                "--region",
                _VIDEOS_REGION,
                "--content-type",
                "image/jpeg",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=60,
        )
        if up_thumb.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to upload thumbnail to S3: {up_thumb.stderr.strip()}")

        # 7. Update manifest.json in S3
        new_entry: dict[str, Any] = {
            "id": safe_id,
            "title": final_title,
            "durationSeconds": duration_seconds,
            "videoKey": video_key,
            "thumbnailKey": thumb_key,
            "sourceUrl": source_url,
            "addedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        clean_tag = (payload.tag or "").strip()
        if clean_tag:
            new_entry["tag"] = clean_tag

        with _VIDEOS_LOCK:
            manifest = _fetch_videos_manifest()
            videos = manifest.get("videos", [])
            if not isinstance(videos, list):
                videos = []
            # Preserve favourite flag if overwriting same id
            existing = next((v for v in videos if v.get("id") == safe_id), None)
            if existing and existing.get("favourite"):
                new_entry["favourite"] = True
            videos = [v for v in videos if v.get("id") != safe_id]
            videos.insert(0, new_entry)
            manifest["videos"] = videos
            _save_videos_manifest(manifest)

        return new_entry


@app.delete("/api/videos/{video_id}")
def api_delete_video(video_id: str) -> dict[str, Any]:
    import subprocess

    with _VIDEOS_LOCK:
        try:
            manifest = _fetch_videos_manifest()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to load videos manifest: {exc}")

        videos = manifest.get("videos", [])
        if not isinstance(videos, list):
            videos = []

        target = next((v for v in videos if v.get("id") == video_id), None)
        if not target:
            raise HTTPException(status_code=404, detail=f"Video '{video_id}' not found")

        remaining = [v for v in videos if v.get("id") != video_id]
        manifest["videos"] = remaining

        try:
            _save_videos_manifest(manifest)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to update manifest in S3: {exc}")

        for key_field in ("videoKey", "thumbnailKey"):
            obj_key = (target.get(key_field) or "").strip().lstrip("/")
            if obj_key:
                subprocess.run(
                    ["aws", "s3", "rm", f"s3://{_VIDEOS_BUCKET}/{obj_key}", "--region", _VIDEOS_REGION],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=20,
                )

        return {"deleted": True, "id": video_id, "remainingCount": len(remaining)}




class DesktopNotifyPayload(BaseModel):
    title: str
    message: str


def _flash_careeros_taskbar_window() -> None:
    """Flash/highlight the CareerOS window on the Windows Taskbar until the user clicks into it."""
    if os.name != "nt":
        return
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32

        class FLASHWINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.UINT),
                ("hwnd", wintypes.HWND),
                ("dwFlags", wintypes.DWORD),
                ("uCount", wintypes.UINT),
                ("dwTimeout", wintypes.DWORD),
            ]

        WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        FLASHW_ALL = 0x00000003
        FLASHW_TIMERNOFG = 0x0000000C

        def callback(hwnd, _lparam):
            if user32.IsWindowVisible(hwnd):
                length = user32.GetWindowTextLengthW(hwnd)
                if length > 0:
                    buf = ctypes.create_unicode_buffer(length + 1)
                    user32.GetWindowTextW(hwnd, buf, length + 1)
                    if "CareerOS" in buf.value:
                        info = FLASHWINFO(
                            ctypes.sizeof(FLASHWINFO),
                            hwnd,
                            FLASHW_ALL | FLASHW_TIMERNOFG,
                            0,
                            0,
                        )
                        user32.FlashWindowEx(ctypes.byref(info))
            return True

        user32.EnumWindows(WNDENUMPROC(callback), 0)
    except Exception:
        pass


@app.post("/api/notify")
def api_notify(payload: DesktopNotifyPayload) -> dict[str, bool]:
    import subprocess
    import xml.sax.saxutils as saxutils

    _flash_careeros_taskbar_window()

    safe_title = saxutils.escape(payload.title).replace("'", "''")
    safe_msg = saxutils.escape(payload.message).replace("'", "''")
    ps_script = (
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; "
        "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null; "
        f"$xmlStr = '<toast><visual><binding template=\"ToastGeneric\"><text>{safe_title}</text><text>{safe_msg}</text></binding></visual></toast>'; "
        "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument; "
        "$xml.LoadXml($xmlStr); "
        "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml); "
        "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('CareerOS').Show($toast)"
    )
    threading.Thread(
        target=lambda: subprocess.run(
            ["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps_script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ),
        daemon=True,
    ).start()
    return {"notified": True}


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

    global _ACTIVE_JOB
    _ACTIVE_JOB = {
        "jobId": job_id,
        "fileName": original_name,
        "stage": "converting",
        "message": f"Queued '{original_name}'...",
        "percent": 4,
        "elapsedSeconds": 0.0,
        "logs": [f"Queued {original_name}"],
    }

    def progress_callback(evt: dict[str, Any]):
        global _ACTIVE_JOB
        if _ACTIVE_JOB is not None:
            logs = list(_ACTIVE_JOB.get("logs", []))
            msg = evt.get("message", "")
            if msg and (not logs or logs[-1] != msg):
                logs = (logs + [msg])[-15:]
            _ACTIVE_JOB = {
                "jobId": job_id,
                "fileName": original_name,
                "stage": evt.get("stage", "transcribing"),
                "message": msg,
                "percent": evt.get("percent", 0),
                "elapsedSeconds": evt.get("elapsedSeconds", 0.0),
                "logs": logs,
            }
        event_queue.put(evt)

    def worker():
        global _ACTIVE_JOB
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
            _ACTIVE_JOB = None
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
