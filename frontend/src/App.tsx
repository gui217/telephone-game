import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, Mic, MicOff, Play, Volume2 } from 'lucide-react'
import { fetchModels, startGameStream } from './api'
import type { GameStepEvent, ModelsResponse } from './types'
import { cn } from './lib/utils'

const DEFAULT_NUM_CHILDREN = 4
const ASR_LABELS: Record<string, string> = { whisper: 'Whisper' }
const TTS_LABELS: Record<string, string> = {
  chatterbox: 'Chatterbox (local)',
  'chatterbox-turbo': 'Chatterbox Turbo (local)',
}

function App() {
  const [models, setModels] = useState<ModelsResponse | null>(null)
  const [numChildren, setNumChildren] = useState(DEFAULT_NUM_CHILDREN)
  const [asrModel, setAsrModel] = useState('whisper')
  const [ttsModel, setTtsModel] = useState('chatterbox')
  const [inputMode, setInputMode] = useState<'text' | 'record'>('text')
  const [text, setText] = useState('')
  const [steps, setSteps] = useState<GameStepEvent[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    fetchModels().then(setModels).catch(() => setModels({ asr: ['whisper'], tts: ['chatterbox', 'chatterbox-turbo'] }))
  }, [])

  const startRecording = useCallback(() => {
    chunksRef.current = []
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setRecordedBlob(blob)
      }
      mr.start()
      setRecording(true)
    }).catch((err) => setError(err.message))
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setRecording(false)
  }, [])

  const handleStart = useCallback(() => {
    if (inputMode === 'text' && !text.trim()) {
      setError('Enter some text or record your voice.')
      return
    }
    if (inputMode === 'record' && !recordedBlob) {
      setError('Record your voice first.')
      return
    }
    setError(null)
    setSteps([])
    setRunning(true)
    const audioFile = recordedBlob ? new File([recordedBlob], 'recording.webm', { type: 'audio/webm' }) : null
    startGameStream(
      {
        num_children: numChildren,
        asr_model: asrModel,
        tts_model: ttsModel,
        text: inputMode === 'text' ? text : undefined,
      },
      audioFile,
      (event) => setSteps((prev) => [...prev, event]),
      (err) => {
        setError(err.message)
        setRunning(false)
      }
    ).then(() => setRunning(false))
  }, [inputMode, text, recordedBlob, numChildren, asrModel, ttsModel])

  const asrOptions = models?.asr ?? ['whisper']
  const ttsOptions = models?.tts ?? ['resemble-ai']

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MessageCircle className="h-6 w-6 text-amber-400" />
            Telephone Game
          </h1>
          <a
            href="https://github.com/gui217/telephone-game"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white"
          >
            GitHub
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="mb-8 text-slate-400">
          Like the children&apos;s game &quot;Chinese Whispers&quot;: your message goes through several
          &quot;children&quot; (TTS → STT → TTS → STT …). Each step is streamed back in real time.
        </p>

        <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900/30 p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-slate-400">Parameters</h2>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-slate-400">Number of children</span>
              <input
                type="number"
                min={1}
                max={20}
                value={numChildren}
                onChange={(e) => setNumChildren(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">ASR model</span>
              <select
                value={asrModel}
                onChange={(e) => setAsrModel(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {asrOptions.map((id) => (
                  <option key={id} value={id}>
                    {ASR_LABELS[id] ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">TTS model</span>
              <select
                value={ttsModel}
                onChange={(e) => setTtsModel(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {ttsOptions.map((id) => (
                  <option key={id} value={id}>
                    {TTS_LABELS[id] ?? id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6">
            <span className="mb-2 block text-slate-400">Initial message</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition',
                  inputMode === 'text' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                )}
              >
                Type text
              </button>
              <button
                type="button"
                onClick={() => {
                  if (recording) {
                    stopRecording()
                  } else {
                    setInputMode('record')
                    startRecording()
                  }
                }}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
                  recording ? 'bg-red-600 text-white hover:bg-red-500' : inputMode === 'record' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                )}
              >
                {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {recording ? 'Stop recording' : 'Record voice'}
              </button>
            </div>
            {inputMode === 'text' && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter the phrase to pass along the chain..."
                rows={3}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            )}
            {inputMode === 'record' && !recording && recordedBlob && (
              <p className="mt-2 text-sm text-slate-400">Recording ready ({(recordedBlob.size / 1024).toFixed(1)} KB). Click Start to run the game.</p>
            )}
            {inputMode === 'record' && recording && (
              <p className="mt-2 flex items-center gap-2 text-sm text-amber-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                Recording...
              </p>
            )}
          </div>

          {inputMode === 'record' && !recording && !recordedBlob && (
            <p className="mt-2 text-sm text-slate-500">Click &quot;Record voice&quot; then &quot;Stop recording&quot; when done.</p>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={handleStart}
              disabled={running || (inputMode === 'text' && !text.trim()) || (inputMode === 'record' && !recordedBlob)}
              className="rounded-lg bg-amber-500 px-6 py-2.5 font-medium text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? 'Running…' : 'Start game'}
            </button>
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-red-200">
            {error}
          </div>
        )}

        {steps.length > 0 && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-slate-400">Game steps (live)</h2>
            <ul className="space-y-4">
              {steps.map((step, i) => (
                <li key={i} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  {step.type === 'tts' && (
                    <div>
                      <span className="text-xs font-medium text-amber-400">Child {step.child_index + 1} says (TTS)</span>
                      <p className="mt-1 text-slate-200">{step.text}</p>
                      {step.audio_base64 && (
                        <AudioPlayer base64={step.audio_base64} className="mt-2" />
                      )}
                    </div>
                  )}
                  {step.type === 'stt' && (
                    <div>
                      <span className="text-xs font-medium text-emerald-400">Child {step.child_index + 1} heard (STT)</span>
                      <p className="mt-1 text-slate-200">{step.text}</p>
                    </div>
                  )}
                  {step.type === 'done' && (
                    <div className="border-t border-slate-700 pt-2">
                      <span className="text-xs font-medium text-slate-400">Final message</span>
                      <p className="mt-1 font-medium text-white">{step.final_text}</p>
                    </div>
                  )}
                  {step.type === 'error' && (
                    <p className="text-red-400">{step.message}</p>
                  )}
                </li>
              ))}
            </ul>
            {running && (
              <p className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                Waiting for next step…
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function AudioPlayer({ base64, className }: { base64: string; className?: string }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const src = `data:audio/wav;base64,${base64}`

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => {
          if (!audioRef.current) {
            const a = new Audio(src)
            audioRef.current = a
            a.onended = () => {
              setPlaying(false)
              audioRef.current = null
            }
            a.play()
            setPlaying(true)
          } else {
            audioRef.current.pause()
            audioRef.current = null
            setPlaying(false)
          }
        }}
        className="flex items-center gap-1.5 rounded bg-slate-700 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-600"
      >
        {playing ? <Volume2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {playing ? 'Playing' : 'Play'}
      </button>
    </div>
  )
}

export default App
