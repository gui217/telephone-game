"""
ASR (Automatic Speech Recognition) adapters.
"""
from __future__ import annotations

import io
import os
import tempfile
from abc import ABC, abstractmethod
from typing import Optional

import whisper


class ASRAdapter(ABC):
    """Base adapter for speech-to-text."""

    @abstractmethod
    def transcribe(self, audio_bytes: bytes, content_type: str = "audio/wav") -> str:
        """Convert audio to text. Returns transcribed text."""
        ...


class LocalWhisperASRAdapter(ASRAdapter):
    """Local OpenAI Whisper model (no API key)."""

    def __init__(self, model_name: str = "base"):
        self._model_name = model_name
        self._model = whisper.load_model(model_name)

    def transcribe(self, audio_bytes: bytes, content_type: str = "audio/wav") -> str:
        suffix = ".wav" if "wav" in content_type else ".mp3"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            try:
                f.write(audio_bytes)
                f.flush()
                result = self._model.transcribe(f.name, fp16=False)
                return (result.get("text") or "").strip()
            finally:
                os.unlink(f.name)
