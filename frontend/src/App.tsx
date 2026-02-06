import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, Mic, MicOff, Play, Volume2 } from 'lucide-react'
import { fetchModels, startGameStream } from './api'
import type { GameStepEvent, ModelsResponse } from './types'
import { cn } from './lib/utils'
import { WhisperRow } from './WhisperRow'

const DEFAULT_NUM_CHILDREN = 4
const ASR_LABELS: Record<string, string> = {
  whisper: 'Whisper (tiny)',
  'whisper-tiny': 'Whisper Tiny',
  'whisper-base': 'Whisper Base',
  'whisper-small': 'Whisper Small',
  'whisper-medium': 'Whisper Medium',
  'whisper-large': 'Whisper Large',
}
const TTS_LABELS: Record<string, string> = {
  chatterbox: 'Chatterbox (local)',
}

/** Normalize for comparison: lowercase, collapse spaces */
function normalizeForWer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Strip punctuation from a word so WER ignores punctuation differences */
function wordForWer(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Word-level Levenshtein edit distance for WER.
 * WER = (S + D + I) / N where S=substitutions, D=deletions, I=insertions, N=reference word count
 * (see https://en.wikipedia.org/wiki/Word_error_rate).
 * Punctuation is stripped from words so it does not affect the rate.
 */
function wordErrorCount(ref: string, hyp: string): { count: number; refWordCount: number } {
  const r = normalizeForWer(ref)
    .split(/\s+/)
    .map(wordForWer)
    .filter(Boolean)
  const h = normalizeForWer(hyp)
    .split(/\s+/)
    .map(wordForWer)
    .filter(Boolean)
  const R = r.length
  const H = h.length
  const dp: number[][] = Array(R + 1)
    .fill(null)
    .map(() => Array(H + 1).fill(0))
  for (let i = 0; i <= R; i++) dp[i][0] = i
  for (let j = 0; j <= H; j++) dp[0][j] = j
  for (let i = 1; i <= R; i++) {
    for (let j = 1; j <= H; j++) {
      const cost = r[i - 1] === h[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return { count: dp[R][H], refWordCount: R }
}

/** WER as a ratio in [0, ∞). Returns null if reference has no words. */
function werRatio(ref: string, hyp: string): number | null {
  const { count, refWordCount } = wordErrorCount(ref, hyp)
  return refWordCount > 0 ? count / refWordCount : null
}

function WerChart({
  points,
  className,
}: {
  points: { label: string; wer: number }[]
  className?: string
}) {
  const hasData = points.length > 0
  const pad = { top: 24, right: 8, bottom: 28, left: 48 }
  const w = 400
  const h = 140
  const innerW = w - pad.left - pad.right
  const innerH = h - pad.top - pad.bottom
  const dataMax = hasData ? Math.max(...points.map((p) => p.wer)) : 1
  const yMax = Math.max(1, dataMax)
  const scaleY = (v: number) => pad.top + innerH - (v / yMax) * innerH
  const scaleX = (i: number) =>
    pad.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2)
  return (
    <figure className={cn(className)} aria-label="WER over each whisper">
      <svg viewBox={`0 0 ${w} ${h}`} className="overflow-visible" preserveAspectRatio="xMidYMid meet">
        <text
          x={10}
          y={pad.top + innerH / 2}
          className="fill-[var(--text-muted)] text-[10px]"
          textAnchor="middle"
          transform={`rotate(-90, 10, ${pad.top + innerH / 2})`}
        >
          WER
        </text>
        <text x={pad.left - 4} y={pad.top + innerH} className="fill-[var(--text-muted)] text-[10px]" textAnchor="end">
          0
        </text>
        <text x={pad.left - 4} y={pad.top} className="fill-[var(--text-muted)] text-[10px]" textAnchor="end">
          {yMax === 1 ? '1' : yMax.toFixed(1)}
        </text>
        {hasData ? (
          <>
            <polyline
              points={points
                .map((p, i) => {
                  const x = scaleX(i)
                  const y = scaleY(p.wer)
                  return `${x},${y}`
                })
                .join(' ')}
              className="fill-none stroke-[var(--accent)] stroke-2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((p, i) => {
              const x = scaleX(i)
              const y = scaleY(p.wer)
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={4} className="fill-[var(--accent)]" />
                  <text
                    x={x}
                    y={y - 8}
                    className="fill-[var(--text)] text-[9px] font-medium"
                    textAnchor="middle"
                  >
                    {p.wer.toFixed(2)}
                  </text>
                  <text
                    x={x}
                    y={h - 6}
                    className="fill-[var(--text-muted)] text-[9px]"
                    textAnchor="middle"
                  >
                    {p.label}
                  </text>
                </g>
              )
            })}
          </>
        ) : (
          <text
            x={w / 2}
            y={h / 2}
            className="fill-[var(--text-muted)] text-sm"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            No data yet — run a game!
          </text>
        )}
      </svg>
    </figure>
  )
}

function App() {
  const [models, setModels] = useState<ModelsResponse | null>(null)
  const [numChildren, setNumChildren] = useState(DEFAULT_NUM_CHILDREN)
  const [asrModel, setAsrModel] = useState('whisper-tiny')
  const [ttsModel, setTtsModel] = useState('chatterbox')
  const [inputMode, setInputMode] = useState<'text' | 'record'>('text')
  const [text, setText] = useState('')
  const [steps, setSteps] = useState<GameStepEvent[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [autoPlayAudio, setAutoPlayAudio] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const lastProcessedStepIndexRef = useRef(0)
  const playbackQueueRef = useRef<string[]>([])
  const isPlayingRef = useRef(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const autoPlayAudioRef = useRef(autoPlayAudio)
  autoPlayAudioRef.current = autoPlayAudio

  useEffect(() => {
    fetchModels().then(setModels).catch(() => setModels({ asr: ['whisper-tiny', 'whisper-base', 'whisper-small', 'whisper-medium', 'whisper-large'], tts: ['chatterbox'] }))
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

  const processPlaybackQueue = useCallback(() => {
    if (isPlayingRef.current || playbackQueueRef.current.length === 0) return
    const base64 = playbackQueueRef.current.shift()!
    isPlayingRef.current = true
    const audio = new Audio(`data:audio/wav;base64,${base64}`)
    currentAudioRef.current = audio
    const onDone = () => {
      isPlayingRef.current = false
      currentAudioRef.current = null
      processPlaybackQueue()
    }
    audio.onended = onDone
    audio.onerror = onDone
    audio.play()
  }, [])

  useEffect(() => {
    if (steps.length === 0) {
      lastProcessedStepIndexRef.current = 0
      playbackQueueRef.current = []
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      isPlayingRef.current = false
      return
    }
    if (!autoPlayAudioRef.current) return
    const from = lastProcessedStepIndexRef.current
    for (let i = from; i < steps.length; i++) {
      const step = steps[i]
      if (step.type === 'tts' && step.audio_base64) {
        playbackQueueRef.current.push(step.audio_base64)
      }
    }
    lastProcessedStepIndexRef.current = steps.length
    processPlaybackQueue()
  }, [steps, processPlaybackQueue])

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

  const asrOptions = models?.asr ?? ['whisper-tiny', 'whisper-base', 'whisper-small', 'whisper-medium', 'whisper-large']
  const ttsOptions = models?.tts ?? ['chatterbox']

  const inputStyles =
    'w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text)] placeholder-[var(--text-muted)]/60 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors'
  const labelStyles = 'mb-1.5 block text-sm font-medium text-[var(--text-muted)]'
  const btnPrimary =
    'w-full rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50'
  const btnSecondary =
    'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent-muted)] hover:bg-[var(--bg-base)]'

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text)]" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <header className="border-b border-[var(--border)] bg-[var(--bg-surface)] px-6 py-4 shadow-[var(--shadow)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-[var(--text)]">
            <MessageCircle className="h-6 w-6 text-[var(--accent)]" />
            Telephone Game
          </h1>
          <a
            href="https://github.com/gui217/telephone-game"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--text-muted)] transition hover:text-[var(--accent)]"
          >
            GitHub
          </a>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col lg:flex-row">
        {/* Left sidebar: parameters */}
        <aside className="w-full shrink-0 border-b border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow)] lg:w-72 lg:border-b-0 lg:border-r">
          <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Parameters
          </h2>

          <div className="space-y-5">
            <label className="block">
              <span className={labelStyles}>Number of children</span>
              <input
                type="number"
                min={1}
                max={20}
                value={numChildren}
                onChange={(e) => setNumChildren(Number(e.target.value))}
                className={inputStyles}
              />
            </label>
            <label className="block">
              <span className={labelStyles}>ASR model</span>
              <select
                value={asrModel}
                onChange={(e) => setAsrModel(e.target.value)}
                className={inputStyles}
              >
                {asrOptions.map((id) => (
                  <option key={id} value={id}>
                    {ASR_LABELS[id] ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelStyles}>TTS model</span>
              <select
                value={ttsModel}
                onChange={(e) => setTtsModel(e.target.value)}
                className={inputStyles}
              >
                {ttsOptions.map((id) => (
                  <option key={id} value={id}>
                    {TTS_LABELS[id] ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={autoPlayAudio}
                onChange={(e) => setAutoPlayAudio(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
              />
              <span className={labelStyles + ' mb-0'}>Auto-play audio</span>
            </label>
          </div>

          <div className="mt-6 border-t border-[var(--border)] pt-6">
            <span className={labelStyles}>Initial message</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={cn(
                  'flex-1 rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition',
                  inputMode === 'text'
                    ? 'bg-[var(--accent)] text-white'
                    : 'border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:border-[var(--accent-muted)]'
                )}
              >
                Text
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
                  'flex items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition',
                  recording
                    ? 'bg-[var(--error)] text-white hover:opacity-90'
                    : inputMode === 'record'
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:border-[var(--accent-muted)]'
                )}
              >
                {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {recording ? 'Stop' : 'Record'}
              </button>
            </div>
            {inputMode === 'text' && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter the phrase to pass along..."
                rows={3}
                className={cn(inputStyles, 'mt-2 resize-none')}
              />
            )}
            {inputMode === 'record' && !recording && recordedBlob && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Ready ({(recordedBlob.size / 1024).toFixed(1)} KB)
              </p>
            )}
            {inputMode === 'record' && recording && (
              <p className="mt-2 flex items-center gap-2 text-xs text-[var(--accent)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                Recording…
              </p>
            )}
            {inputMode === 'record' && !recording && !recordedBlob && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">Record, then stop when done.</p>
            )}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={handleStart}
              disabled={running || (inputMode === 'text' && !text.trim()) || (inputMode === 'record' && !recordedBlob)}
              className={btnPrimary}
            >
              {running ? 'Running…' : 'Start game'}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 p-6 lg:p-8">
          {(() => {
            const initialMessage =
              inputMode === 'text'
                ? text.trim()
                : (steps.find((s) => s.type === 'stt') as { type: 'stt'; text: string } | undefined)?.text ?? ''
            const sttTexts = steps
              .filter((s): s is GameStepEvent & { type: 'stt'; text: string } => s.type === 'stt')
              .map((s) => s.text)
            const doneEvent = steps.filter((s): s is GameStepEvent & { type: 'done'; final_text: string } => s.type === 'done').pop()
            const finalMessage = doneEvent?.final_text ?? ''
            const hasSummary = initialMessage.length > 0 && (finalMessage.length > 0 || sttTexts.length > 0)
            const finalWer = hasSummary && initialMessage.length > 0 ? wordErrorCount(initialMessage, finalMessage) : null
            const refWordCount = finalWer?.refWordCount ?? 0
            const werPct = refWordCount > 0 ? ((finalWer!.count / refWordCount) * 100) : null
            const werExplanation =
              'WER is (S+D+I)/N — substitutions + deletions + insertions over reference word count (see Wikipedia).'
            const chartPoints: { label: string; wer: number }[] = []
            if (initialMessage.length > 0) {
              sttTexts.forEach((heard, i) => {
                const r = werRatio(initialMessage, heard)
                chartPoints.push({
                  label: `Child ${i + 1}`,
                  wer: r != null ? r : 0,
                })
              })
            }
            return (
              <div className="summary-entrance mb-8 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 shadow-[var(--shadow)] transition-all duration-300 hover:border-[var(--accent-muted)] hover:shadow-[0_4px_12px_rgba(44,42,38,0.08)]">
                <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Game summary</h3>
                <p className="mb-2 text-xs text-[var(--text-muted)]">{werExplanation}</p>
                {finalWer != null && refWordCount > 0 ? (
                  <p className="mb-4 text-sm text-[var(--text-muted)]">
                    <span className="font-medium text-[var(--text)]">{finalWer.count}</span> word error{finalWer.count !== 1 ? 's' : ''}
                    {werPct != null && <> ({werPct.toFixed(1)}% WER)</>}
                    {' — '}
                    initial vs final.
                  </p>
                ) : (
                  <p className="mb-4 text-sm text-[var(--text-muted)] italic">
                    📞 Run a game to see how the message changes and the Word Error Rate here.
                  </p>
                )}
                <WerChart points={chartPoints} className="mt-2 h-40 w-full max-w-xl" />
              </div>
            )
          })()}

          {error && (
            <div className="mb-6 rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error)]">
              {error}
            </div>
          )}

          <WhisperRow
            key={numChildren}
            numChildren={Math.max(1, numChildren)}
            steps={steps}
            running={running}
            renderMessageCard={(card) => {
              const isError = card.label === 'Error'
              return (
                <div>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      isError ? 'text-[var(--error)]' : 'text-[var(--accent)]'
                    )}
                  >
                    {card.label}
                  </span>
                  <p className={cn('mt-1.5 text-[var(--text)]', isError && 'text-[var(--error)]')}>
                    {card.text}
                  </p>
                  {card.audioBase64 && (
                    <AudioPlayer base64={card.audioBase64} className="mt-2" />
                  )}
                </div>
              )
            }}
          />
        </main>
      </div>
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
        className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-sm text-[var(--text)] transition hover:border-[var(--accent-muted)]"
      >
        {playing ? <Volume2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {playing ? 'Playing' : 'Play'}
      </button>
    </div>
  )
}

export default App
