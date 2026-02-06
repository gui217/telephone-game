"""
TTS (Text-to-Speech) adapters.
Uses Chatterbox locally: https://github.com/resemble-ai/chatterbox
"""
from __future__ import annotations

import io
import os
from abc import ABC, abstractmethod
from typing import Optional

import torch
import torchaudio

# Lazy import chatterbox so backend starts even if not installed yet
def _get_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class TTSAdapter(ABC):
    """Base adapter for text-to-speech."""

    @abstractmethod
    def synthesize(self, text: str) -> bytes:
        """Convert text to audio. Returns raw WAV bytes."""
        ...


class ChatterboxTTSAdapter(TTSAdapter):
    """
    Local Chatterbox TTS (open-source from Resemble AI).
    pip install chatterbox-tts
    """

    def __init__(self, device: Optional[str] = None, audio_prompt_path: Optional[str] = None):
        self._device = device or _get_device()
        self._audio_prompt_path = audio_prompt_path or os.environ.get("CHATTERBOX_PROMPT_PATH")
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        from chatterbox.tts import ChatterboxTTS
        self._model = ChatterboxTTS.from_pretrained(device=self._device)
        return self._model

    def synthesize(self, text: str) -> bytes:
        model = self._load_model()
        kwargs = {}
        if self._audio_prompt_path and os.path.isfile(self._audio_prompt_path):
            kwargs["audio_prompt_path"] = self._audio_prompt_path
        wav = model.generate(text, **kwargs)
        # wav is (1, samples) tensor; model.sr is sample rate
        buf = io.BytesIO()
        torchaudio.save(buf, wav.cpu(), model.sr, format="wav")
        buf.seek(0)
        return buf.read()
