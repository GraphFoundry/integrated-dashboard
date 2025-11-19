interface PlaybackControlsProps {
  readonly isPlaying: boolean
  readonly isPaused: boolean
  readonly currentStageIndex: number
  readonly totalStages: number
  readonly onPlay: () => void
  readonly onPause: () => void
  readonly onNext: () => void
  readonly onReset: () => void
  readonly disabled: boolean
}

export default function PlaybackControls({
  isPlaying,
  isPaused,
  currentStageIndex,
  totalStages,
  onPlay,
  onPause,
  onNext,
  onReset,
  disabled,
}: PlaybackControlsProps) {
  const canNext = currentStageIndex < totalStages - 1 && !isPlaying
  const canReset = currentStageIndex >= 0 || isPlaying || isPaused

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-3">Playback</h3>

      {/* Progress indicator */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>
            Stage {currentStageIndex + 1} of {totalStages}
          </span>
          <span>{Math.round(((currentStageIndex + 1) / totalStages) * 100)}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((currentStageIndex + 1) / totalStages) * 100}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {/* Play/Pause */}
        {isPlaying ? (
          <button
            onClick={onPause}
            className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
            </svg>
            Pause
          </button>
        ) : (
          <button
            onClick={onPlay}
            disabled={disabled || currentStageIndex >= totalStages - 1}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            {isPaused ? 'Resume' : 'Play'}
          </button>
        )}

        {/* Next */}
        <button
          onClick={onNext}
          disabled={!canNext || disabled}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium rounded transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 10a.75.75 0 01.75-.75h12.59l-2.1-1.95a.75.75 0 111.02-1.1l3.5 3.25a.75.75 0 010 1.1l-3.5 3.25a.75.75 0 11-1.02-1.1l2.1-1.95H2.75A.75.75 0 012 10z" />
          </svg>
          Next
        </button>

        {/* Reset */}
        <button
          onClick={onReset}
          disabled={!canReset || disabled}
          className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 disabled:bg-slate-800 disabled:text-slate-500 text-red-400 font-medium rounded transition-colors flex items-center justify-center gap-2 border border-red-600/30"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
              clipRule="evenodd"
            />
          </svg>
          Reset
        </button>
      </div>

      {/* Status text */}
      <div className="mt-3 text-xs text-center">
        {isPlaying && <span className="text-blue-400">▶ Playing stage-by-stage...</span>}
        {isPaused && (
          <span className="text-yellow-400">⏸ Paused at stage {currentStageIndex + 1}</span>
        )}
        {!isPlaying && !isPaused && currentStageIndex === 0 && (
          <span className="text-slate-400">Ready to start</span>
        )}
        {!isPlaying &&
          !isPaused &&
          currentStageIndex > 0 &&
          currentStageIndex < totalStages - 1 && (
            <span className="text-slate-400">Stopped at stage {currentStageIndex + 1}</span>
          )}
        {!isPlaying && currentStageIndex >= totalStages - 1 && (
          <span className="text-green-400">✓ All stages complete</span>
        )}
      </div>
    </div>
  )
}
