#!/usr/bin/env python3
"""
CareerOS Offline Voice Note Transcriber Engine
Uses faster-whisper for speech-to-text and pyannote.audio for speaker diarization.
Includes in-memory model caching and real-time progress callbacks for the CareerOS GUI.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Callable, Any

import soundfile as sf
import torch

os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# In-memory caches so models stay warm across transcriptions in the desktop session
_MODEL_LOCK = threading.Lock()
_WHISPER_CACHE: dict[tuple[str, str, str], Any] = {}
_PYANNOTE_CACHE: dict[tuple[str, str], Any] = {}


def load_env_token() -> str | None:
    """Load HF_TOKEN from environment or CareerOS/.env file."""
    candidates = [
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent / ".env",
    ]
    for env_file in candidates:
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8-sig").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return os.environ.get("HF_TOKEN")


def get_optimal_devices() -> tuple[torch.device, str, str]:
    """
    Detect optimal hardware devices for PyAnnote and faster-whisper across Windows & Mac.
    - NVIDIA GPU (CUDA): used by both PyAnnote and faster-whisper.
    - Apple Silicon Mac (MPS): used by PyAnnote; faster-whisper uses CPU int8.
    - CPU fallback: used by both.
    """
    if torch.cuda.is_available():
        pyannote_device = torch.device("cuda")
        whisper_device = "cuda"
        whisper_compute = "float16"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        pyannote_device = torch.device("mps")
        whisper_device = "cpu"
        whisper_compute = "int8"
    else:
        pyannote_device = torch.device("cpu")
        whisper_device = "cpu"
        whisper_compute = "int8"
    return pyannote_device, whisper_device, whisper_compute


def get_system_status() -> dict[str, Any]:
    """Return hardware, FFmpeg, and HF token readiness for the CareerOS status bar."""
    token = load_env_token()
    pyannote_dev, whisper_dev, whisper_comp = get_optimal_devices()
    ffmpeg_path = shutil.which("ffmpeg")
    return {
        "platform": f"{platform.system()} ({platform.machine()})",
        "pyannoteDevice": str(pyannote_dev),
        "whisperDevice": whisper_dev,
        "whisperCompute": whisper_comp,
        "ffmpegAvailable": ffmpeg_path is not None,
        "hfTokenConfigured": bool(token and len(token.strip()) > 5),
        "cachedWhisperModels": [k[0] for k in _WHISPER_CACHE.keys()],
        "pyannoteCached": len(_PYANNOTE_CACHE) > 0,
    }


def format_timestamp(seconds: float) -> str:
    """Format seconds into HH:MM:SS or MM:SS."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hrs > 0:
        return f"{hrs:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"


def convert_to_wav(input_path: Path) -> Path:
    """Convert any audio/video format (.m4a, .mp3, .aac, .wav, .mp4, .ogg, .flac, .webm) to 16kHz mono WAV via FFmpeg."""
    temp_wav = Path(tempfile.gettempdir()) / f"careeros_vn_{os.getpid()}_{int(time.time() * 1000)}_{input_path.stem}.wav"
    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        str(temp_wav),
    ]
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg audio conversion failed: {res.stderr.strip()}")
    return temp_wav


def load_waveform_tensor(wav_path: Path) -> tuple[torch.Tensor, int, float]:
    """Load WAV via soundfile into a PyTorch tensor and return (waveform, sample_rate, duration_seconds)."""
    data, sample_rate = sf.read(str(wav_path), dtype="float32", always_2d=True)
    duration = float(data.shape[0]) / float(sample_rate) if sample_rate > 0 else 0.0
    waveform = torch.from_numpy(data.T)
    return waveform, sample_rate, duration


def get_whisper_model(model_size: str, device: str, compute_type: str) -> Any:
    """Load or retrieve cached faster-whisper model."""
    from faster_whisper import WhisperModel

    key = (model_size, device, compute_type)
    with _MODEL_LOCK:
        if key not in _WHISPER_CACHE:
            _WHISPER_CACHE[key] = WhisperModel(model_size, device=device, compute_type=compute_type)
        return _WHISPER_CACHE[key]


def get_pyannote_pipeline(token: str, device: torch.device):
    """Load or retrieve cached PyAnnote speaker diarization pipeline (supports pyannote 3.x and 4.x)."""
    from pyannote.audio import Pipeline

    key = (token[:10], str(device))
    with _MODEL_LOCK:
        if key not in _PYANNOTE_CACHE:
            try:
                pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", token=token)
            except TypeError:
                pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=token)
            pipeline.to(device)
            _PYANNOTE_CACHE[key] = pipeline
        return _PYANNOTE_CACHE[key]


def get_speaker_for_time(annotation: Any, time_point: float) -> str:
    """Find which speaker was active at a given time point."""
    if annotation is None:
        return "SPEAKER_00"
    for segment, _, speaker in annotation.itertracks(yield_label=True):
        if segment.start <= time_point <= segment.end:
            return speaker
    nearest_speaker = "SPEAKER_00"
    min_dist = float("inf")
    for segment, _, speaker in annotation.itertracks(yield_label=True):
        dist = min(abs(segment.start - time_point), abs(segment.end - time_point))
        if dist < min_dist:
            min_dist = dist
            nearest_speaker = speaker
    return nearest_speaker


ProgressCallback = Callable[[dict[str, Any]], None]


def transcribe_audio(
    audio_path: Path,
    model_size: str = "base",
    token: str | None = None,
    diarize: bool = True,
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    """
    Run the full voice note transcription + speaker diarization flow and emit progress events.
    """
    started_at = time.time()
    resolved_token = token or load_env_token()
    pyannote_dev, whisper_dev, whisper_comp = get_optimal_devices()

    def emit(stage: str, message: str, percent: int, extra: dict[str, Any] | None = None):
        if on_progress:
            payload = {
                "type": "progress",
                "stage": stage,
                "message": message,
                "percent": percent,
                "elapsedSeconds": round(time.time() - started_at, 1),
            }
            if extra:
                payload.update(extra)
            on_progress(payload)

    emit(
        "converting",
        f"Preparing audio (converting '{audio_path.name}' to 16kHz mono WAV via FFmpeg)...",
        8,
    )
    converted_wav = convert_to_wav(audio_path)
    annotation = None
    diarization_used = False
    diarization_warning: str | None = None

    try:
        waveform, sample_rate, duration_seconds = load_waveform_tensor(converted_wav)
        emit(
            "converting",
            f"Audio ready ({format_timestamp(duration_seconds)} duration, 16kHz mono).",
            15,
            {"durationSeconds": round(duration_seconds, 2)},
        )

        if diarize:
            if not resolved_token:
                diarization_warning = "No HF_TOKEN found in .env. Running without speaker detection."
                emit("diarizing", diarization_warning, 30)
            else:
                emit(
                    "diarizing",
                    f"[1/3] Detecting speakers with PyAnnote (on {pyannote_dev})...",
                    22,
                )
                try:
                    pipeline = get_pyannote_pipeline(resolved_token, pyannote_dev)
                    diarization_out = pipeline({"waveform": waveform, "sample_rate": sample_rate})
                    annotation = getattr(diarization_out, "speaker_diarization", diarization_out)
                    diarization_used = True
                    emit("diarizing", "Speaker detection complete!", 45)
                except Exception as exc:
                    diarization_warning = f"Speaker diarization failed ({exc}); falling back to single-speaker transcription."
                    emit("diarizing", diarization_warning, 45)
        else:
            emit("diarizing", "[1/3] Skipping speaker diarization (disabled).", 40)

        emit(
            "transcribing",
            f"[2/3] Transcribing speech with faster-whisper ('{model_size}' model on {whisper_dev}/{whisper_comp})...",
            50,
        )
        whisper_model = get_whisper_model(model_size, whisper_dev, whisper_comp)
        segments_iter, info = whisper_model.transcribe(
            str(converted_wav),
            beam_size=5,
            word_timestamps=True,
        )

        emit(
            "transcribing",
            f"Detected language '{info.language}' (confidence {info.language_probability:.2f}). Decoding audio segments...",
            58,
        )

        all_segments = []
        for seg in segments_iter:
            all_segments.append(seg)
            if duration_seconds > 0:
                ratio = min(1.0, max(0.0, seg.end / duration_seconds))
                pct = 58 + int(ratio * 30)
                emit(
                    "transcribing",
                    f"Transcribing [{format_timestamp(seg.start)} -> {format_timestamp(seg.end)}]: {seg.text.strip()[:70]}",
                    pct,
                )

        emit("aligning", "[3/3] Aligning transcript with speakers...", 92)

        structured_turns: list[dict[str, Any]] = []
        output_lines: list[str] = []
        speakers_seen: list[str] = []

        current_speaker: str | None = None
        current_chunk: list[str] = []
        chunk_start = 0.0
        chunk_end = 0.0

        def flush_turn(start_t: float, end_t: float, spk: str, words: list[str]):
            text = " ".join(words).strip()
            if not text:
                return
            start_fmt = format_timestamp(start_t)
            end_fmt = format_timestamp(end_t)
            if spk not in speakers_seen:
                speakers_seen.append(spk)
            turn_index = len(structured_turns)
            structured_turns.append(
                {
                    "id": f"turn-{turn_index}",
                    "start": round(start_t, 2),
                    "end": round(end_t, 2),
                    "startFormatted": start_fmt,
                    "endFormatted": end_fmt,
                    "speaker": spk,
                    "text": text,
                }
            )
            output_lines.append(f"[{start_fmt} -> {end_fmt}] {spk}: {text}\n")

        for seg in all_segments:
            seg_mid = (seg.start + seg.end) / 2.0
            speaker = get_speaker_for_time(annotation, seg_mid) if diarization_used else "SPEAKER_00"
            cleaned = seg.text.strip()
            if not cleaned:
                continue

            if speaker != current_speaker:
                if current_speaker is not None and current_chunk:
                    flush_turn(chunk_start, chunk_end, current_speaker, current_chunk)
                current_speaker = speaker
                current_chunk = [cleaned]
                chunk_start = seg.start
                chunk_end = seg.end
            else:
                current_chunk.append(cleaned)
                chunk_end = seg.end

        if current_speaker is not None and current_chunk:
            flush_turn(chunk_start, chunk_end, current_speaker, current_chunk)

        raw_transcript = "".join(output_lines)
        elapsed = round(time.time() - started_at, 1)

        emit("complete", f"Transcription complete in {elapsed}s!", 100)

        return {
            "segments": structured_turns,
            "rawTranscript": raw_transcript,
            "speakers": speakers_seen,
            "language": info.language,
            "languageProbability": round(float(info.language_probability), 3),
            "durationSeconds": round(duration_seconds, 2),
            "durationFormatted": format_timestamp(duration_seconds),
            "modelSize": model_size,
            "diarized": diarization_used,
            "diarizationWarning": diarization_warning,
            "elapsedSeconds": elapsed,
            "hardware": {
                "pyannote": str(pyannote_dev),
                "whisper": whisper_dev,
                "compute": whisper_comp,
            },
        }
    finally:
        try:
            converted_wav.unlink(missing_ok=True)
        except Exception:
            pass
