#!/usr/bin/env python3
"""
CareerOS Hugging Face Model Downloader & Verifier
Pre-downloads and verifies faster-whisper and pyannote/speaker-diarization-3.1
models from Hugging Face so offline Voice Notes works out of the box.
"""

from __future__ import annotations

import argparse
import os
import platform
import sys
from pathlib import Path

os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"


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
                    val = v.strip().strip('"').strip("'")
                    if k.strip() == "HF_TOKEN" and val:
                        os.environ["HF_TOKEN"] = val
                    else:
                        os.environ.setdefault(k.strip(), val)
    return os.environ.get("HF_TOKEN")


def verify_and_download_models(
    model_size: str = "base",
    token: str | None = None,
    log_fn=print,
) -> None:
    import torch
    from faster_whisper import WhisperModel
    from pyannote.audio import Pipeline

    auth_token = (token or load_env_token() or "").strip() or None

    if torch.cuda.is_available():
        pyannote_dev = torch.device("cuda")
        whisper_dev = "cuda"
        whisper_comp = "float16"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        pyannote_dev = torch.device("mps")
        whisper_dev = "cpu"
        whisper_comp = "int8"
    else:
        pyannote_dev = torch.device("cpu")
        whisper_dev = "cpu"
        whisper_comp = "int8"

    log_fn(f"Platform: {platform.system()} ({platform.machine()})")
    log_fn(f"Hardware: PyAnnote={pyannote_dev} | Whisper={whisper_dev} ({whisper_comp})")

    log_fn(f"[1/2] Downloading & verifying faster-whisper '{model_size}' model from Hugging Face...")
    _ = WhisperModel(model_size, device=whisper_dev, compute_type=whisper_comp)
    log_fn(f"[OK] faster-whisper '{model_size}' model cached and ready!")

    if not auth_token:
        raise RuntimeError(
            "No Hugging Face token (HF_TOKEN) provided. Please enter your hf_... token to download PyAnnote speaker diarization models."
        )

    log_fn("[2/2] Downloading & verifying PyAnnote speaker-diarization-3.1 model from Hugging Face...")
    try:
        try:
            pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", token=auth_token)
        except TypeError:
            pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=auth_token)
        pipeline.to(pyannote_dev)
        dummy_wav = torch.zeros((1, 16000 * 2), dtype=torch.float32)
        _ = pipeline({"waveform": dummy_wav, "sample_rate": 16000})
        log_fn("[OK] PyAnnote speaker-diarization-3.1 model cached and verified!")
    except Exception as exc:
        msg = (
            f"PyAnnote verification failed: {exc}. "
            "Ensure your HF_TOKEN is valid and you have accepted the license terms on Hugging Face: "
            "1) https://huggingface.co/pyannote/speaker-diarization-3.1 "
            "2) https://huggingface.co/pyannote/segmentation-3.0 "
            "3) https://huggingface.co/pyannote/speaker-diarization-community-1"
        )
        raise RuntimeError(msg) from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Download and verify CareerOS Hugging Face models")
    parser.add_argument("--model", default="base", help="Whisper model size (default: base)")
    parser.add_argument("--token", default=None, help="Hugging Face Read Token (hf_...)")
    args = parser.parse_args()

    try:
        verify_and_download_models(model_size=args.model, token=args.token)
    except Exception as exc:
        print(f"\n[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
