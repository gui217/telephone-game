# Telephone Game (Chinese Whispers)

A web UI for the classic children’s game **Telephone Game** (also known as **Chinese Whispers**): your message is passed through a chain of “children,” each step going **text → speech (TTS) → speech → text (ASR)**. Every step is streamed back to the UI in real time via **Server-Sent Events (SSE)**.

## Features

- **Four parameters**
  - **Number of children** – length of the chain (1–20)
  - **ASR model** – e.g. **Whisper** (OpenAI)
  - **TTS model** – **Chatterbox** or **Chatterbox Turbo** (runs locally; [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox))
  - **Initial message** – either type text or **record your own voice**
- **Live progress** – each TTS and STT result is pushed to the UI over SSE as it’s ready
- **Playback** – listen to each TTS segment in the browser

## Tech stack

- **Backend:** FastAPI, OpenAI (Whisper), Chatterbox TTS (local), SSE
- **Frontend:** React, TypeScript, Vite, Tailwind CSS

*(Inspired by the stack used in [silero-vad-tuner](https://github.com/gui217/silero-vad-tuner).)*

## Prerequisites

- **Python 3.10, 3.11, or 3.12** (Chatterbox does not support Python 3.13 yet; use `python3.11 -m venv venv` if your default is 3.13)
- Node.js 18+

## Setup

### Backend

```bash
cd backend
# Use Python 3.10–3.12 (e.g. python3.11 if you have it)
python3.11 -m venv venv   # or: python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Environment variables (create `.env` or export):**

- `OPENAI_API_KEY` – for Whisper ASR ([OpenAI API](https://platform.openai.com/))
- `CHATTERBOX_PROMPT_PATH` – (optional) path to a ~10s WAV reference clip for voice cloning with Chatterbox

### Frontend

```bash
cd frontend
npm install
```

## Run locally

1. **Backend**

   ```bash
   cd backend && uvicorn main:app --reload --port 8000
   ```

2. **Frontend**

   ```bash
   cd frontend && npm run dev
   ```

3. Open **http://localhost:5173**, set the four parameters, enter text or record your voice, and click **Start game**.

## Create the GitHub repo (gui217)

From the project root, with [GitHub CLI](https://cli.github.com/) installed and logged in as **gui217**:

```bash
git init
git add .
git commit -m "Initial commit: Telephone Game UI with Whisper + Chatterbox (local)"
gh repo create gui217/telephone-game --public --source=. --push
```

Or create **https://github.com/gui217/telephone-game** manually, then:

```bash
git init
git remote add origin https://github.com/gui217/telephone-game.git
git add .
git commit -m "Initial commit: Telephone Game UI with Whisper + Chatterbox (local)"
git branch -M main
git push -u origin main
```

## API

- **POST /api/game/start** (multipart/form-data)  
  - `num_children`, `asr_model`, `tts_model`, optional `text`, optional `audio` file  
  - Response: `text/event-stream` (SSE) with events: `tts` (text + `audio_base64`), `stt` (text), `done` (final_text), `error`.
- **GET /api/models** – lists available ASR and TTS model keys.
- **GET /api/health** – health check.

## License

MIT
