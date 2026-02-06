/**
 * Child figure using the bot whisper JPEG illustration.
 * Active state shown with a ring.
 */
export function ChildFigure({
  index,
  isFirst,
  isLast,
  isActive,
  className = '',
}: {
  index: number
  isFirst: boolean
  isLast: boolean
  isActive: boolean
  skinIndex?: number
  hairIndex?: number
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      {isActive && (
        <span
          className="absolute inset-0 rounded-full border-2 border-[var(--accent)] opacity-60 animate-pulse pointer-events-none"
          style={{ borderStyle: 'dashed' }}
          aria-hidden
        />
      )}
      <img
        src="/bot_whisper.jpg"
        alt=""
        className="h-full w-full object-contain rounded-[var(--radius)]"
        aria-hidden
      />
    </div>
  )
}
