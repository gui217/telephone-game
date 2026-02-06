import { ChildFigure } from './ChildFigure'
import type { GameStepEvent } from './types'
import { cn } from './lib/utils'

/** Get the child index that should be highlighted from the latest step */
function getActiveChildIndex(steps: GameStepEvent[]): number | null {
  if (steps.length === 0) return null
  const last = steps[steps.length - 1]
  if (last.type === 'tts' || last.type === 'stt' || last.type === 'error') return last.child_index
  return null
}

export type HistoryCard = {
  label: string
  text: string
  audioBase64?: string
}

/** Latest step message for the current child (for comic bubble + fallback) */
function getLatestStepMessage(steps: GameStepEvent[]): HistoryCard | null {
  if (steps.length === 0) return null
  const last = steps[steps.length - 1]
  if (last.type === 'tts')
    return {
      label: `Child ${last.child_index + 1} says`,
      text: last.text,
      audioBase64: last.audio_base64,
    }
  if (last.type === 'stt')
    return { label: `Child ${last.child_index + 1} heard`, text: last.text }
  if (last.type === 'done') return { label: 'Final message', text: last.final_text }
  if (last.type === 'error') return { label: 'Error', text: last.message }
  return null
}

/** Full history of steps as cards (chat cards history) */
function getStepsHistory(steps: GameStepEvent[]): HistoryCard[] {
  return steps.map((step) => {
    if (step.type === 'tts')
      return {
        label: `Child ${step.child_index + 1} says`,
        text: step.text,
        audioBase64: step.audio_base64,
      }
    if (step.type === 'stt')
      return { label: `Child ${step.child_index + 1} heard`, text: step.text }
    if (step.type === 'done') return { label: 'Final message', text: step.final_text }
    if (step.type === 'error') return { label: 'Error', text: step.message }
    return { label: 'Unknown', text: '' }
  })
}

/** Comic-book style speech bubble above a child */
function ComicBubble({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-3 py-2 min-w-[80px] max-w-[180px]',
        'bg-white border-2 border-[var(--text)] rounded-2xl rounded-bl-md shadow-[3px_3px_0_var(--text)]',
        'text-sm font-medium text-[var(--text)] text-center transition-opacity duration-200',
        'z-10',
        className
      )}
    >
      <span className="line-clamp-3">{text}</span>
      {/* Tail pointing down to the child */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-full -mt-px w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-[var(--text)]"
        aria-hidden
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white"
        style={{ marginLeft: '-6px', marginTop: '-10px' }}
        aria-hidden
      />
    </div>
  )
}

export interface WhisperRowProps {
  numChildren: number
  steps: GameStepEvent[]
  running: boolean
  renderMessageCard: (card: HistoryCard) => React.ReactNode
}

export function WhisperRow({ numChildren, steps, running, renderMessageCard }: WhisperRowProps) {
  const activeIndex = getActiveChildIndex(steps)
  const latestMessage = getLatestStepMessage(steps)
  const historyCards = getStepsHistory(steps)

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow)]">
      <h2 className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        {running ? 'Whispering…' : 'The circle'}
      </h2>

      {/* Row of children with comic bubbles on active child */}
      <div className="flex flex-wrap items-end justify-center gap-4">
        {Array.from({ length: numChildren }, (_, i) => (
          <div
            key={i}
            className={cn(
              'relative flex flex-col items-center transition-all duration-300',
              activeIndex === i && 'drop-shadow-md'
            )}
          >
            {/* Comic bubble on top of active child when there is a current message */}
            {activeIndex === i && latestMessage && latestMessage.text && (
              <ComicBubble text={latestMessage.text} />
            )}
            <ChildFigure
              index={i}
              isFirst={i === 0}
              isLast={i === numChildren - 1}
              isActive={activeIndex === i}
              className="h-20 w-14 min-w-[56px] sm:h-24 sm:w-16 sm:min-w-[64px] md:h-28 md:w-20 md:min-w-[80px]"
            />
            <span
              className={cn(
                'mt-1 text-xs font-medium',
                activeIndex === i ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
              )}
            >
              {i + 1}
            </span>
          </div>
        ))}
      </div>

      {/* Chat cards history (all steps) */}
      <div className="mt-6 space-y-3 max-h-[320px] overflow-y-auto">
        {historyCards.length > 0 ? (
          historyCards.map((card, idx) => (
            <div
              key={idx}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-base)] p-4"
            >
              {renderMessageCard(card)}
            </div>
          ))
        ) : !running ? (
          <p className="text-center text-sm text-[var(--text-muted)]">
            Enter a message and click Start to see the whisper go around the circle.
          </p>
        ) : null}
      </div>

      {running && historyCards.length === 0 && (
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          Starting…
        </p>
      )}
      {running && historyCards.length > 0 && (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          Waiting for next whisper…
        </p>
      )}
    </section>
  )
}
