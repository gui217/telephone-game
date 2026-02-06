"""
FastAPI backend for Telephone Game (Chinese Whispers).
Chain: TTS -> STT -> TTS -> STT ... for N children; stream each step via SSE.
"""

import base64
import json
import os
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.asr import ASRAdapter, LocalWhisperASRAdapter
from services.tts import ChatterboxTTSAdapter, ChatterboxTurboTTSAdapter, TTSAdapter

app = FastAPI(title="Telephone Game", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model registry (extensible)
ASR_MODELS: dict[str, type[ASRAdapter]] = {
    "whisper": LocalWhisperASRAdapter,
}
TTS_MODELS: dict[str, type[TTSAdapter]] = {
    "chatterbox": ChatterboxTTSAdapter,
    "chatterbox-turbo": ChatterboxTurboTTSAdapter,
}


class GameParams(BaseModel):
    """Parameters for one telephone game run."""
    num_children: int = Field(default=4, ge=1, le=20, description="Number of children in the chain")
    asr_model: str = Field(default="whisper", description="ASR model key (e.g. whisper)")
    tts_model: str = Field(default="chatterbox", description="TTS model key (chatterbox or chatterbox-turbo)")
    text: Optional[str] = Field(default=None, description="Initial message as text (omit if using audio)")


def _get_asr(asr_model: str) -> ASRAdapter:
    if asr_model not in ASR_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown ASR model: {asr_model}")
    return ASR_MODELS[asr_model]()


def _get_tts(tts_model: str, voice_uuid: Optional[str] = None) -> TTSAdapter:
    if tts_model not in TTS_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown TTS model: {tts_model}")
    return TTS_MODELS[tts_model]()


def _sse_message(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _run_telephone_stream(
    num_children: int,
    asr_model: str,
    tts_model: str,
    initial_text: str,
    _voice_uuid: Optional[str] = None,
):
    asr = _get_asr(asr_model)
    tts = _get_tts(tts_model)
    current_text = initial_text.strip()
    if not current_text:
        raise ValueError("Initial text is empty")

    for child_index in range(num_children):
        # TTS: current text -> audio
        try:
            audio_bytes = tts.synthesize(current_text)
        except Exception as e:
            yield _sse_message({
                "type": "error",
                "step": "tts",
                "child_index": child_index,
                "message": str(e),
            })
            return
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        yield _sse_message({
            "type": "tts",
            "child_index": child_index,
            "text": current_text,
            "audio_base64": audio_b64,
        })

        # STT: audio -> next text
        try:
            current_text = asr.transcribe(audio_bytes, "audio/wav")
        except Exception as e:
            yield _sse_message({
                "type": "error",
                "step": "stt",
                "child_index": child_index,
                "message": str(e),
            })
            return
        yield _sse_message({
            "type": "stt",
            "child_index": child_index,
            "text": current_text,
        })

    yield _sse_message({"type": "done", "final_text": current_text})


@app.post("/api/game/start")
async def start_game_stream(
    num_children: int = Form(4),
    asr_model: str = Form("whisper"),
    tts_model: str = Form("chatterbox"),
    text: Optional[str] = Form(None),
    audio: Optional[UploadFile] = File(None),
):
    """
    Start the telephone game. Either provide `text` or upload `audio` (will be transcribed with ASR).
    Streams progress via Server-Sent Events: tts (text + audio_base64), stt (transcribed text), done.
    """
    initial_text = (text or "").strip() or None
    if not initial_text and not audio:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'text' or 'audio' file.",
        )
    if initial_text and audio:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'text' or 'audio', not both.",
        )
    if audio:
        contents = await audio.read()
        asr = _get_asr(asr_model)
        try:
            initial_text = asr.transcribe(contents, audio.content_type or "audio/wav")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"ASR failed: {e}")
        if not initial_text:
            raise HTTPException(status_code=400, detail="No speech detected in audio.")

    return StreamingResponse(
        _run_telephone_stream(
            num_children=num_children,
            asr_model=asr_model,
            tts_model=tts_model,
            initial_text=initial_text,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/game/start/json", response_class=StreamingResponse)
async def start_game_stream_json(params: GameParams):
    """
    Start the game with JSON body (text only; for audio use POST /api/game/start with multipart).
    """
    initial_text = (params.text or "").strip()
    if not initial_text:
        raise HTTPException(status_code=400, detail="Provide 'text' in body.")
    return StreamingResponse(
        _run_telephone_stream(
            num_children=params.num_children,
            asr_model=params.asr_model,
            tts_model=params.tts_model,
            initial_text=initial_text,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/models")
async def list_models():
    """Return available ASR and TTS model keys for the UI."""
    return {
        "asr": list(ASR_MODELS.keys()),
        "tts": list(TTS_MODELS.keys()),
    }


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
