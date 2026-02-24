import { useEffect, useRef, useState } from 'react'
import type { DrillRun } from '@/lib/api/drills'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Clock, CheckCircle2, XCircle, History, Play, FastForward, Info, Pause } from 'lucide-react'
import { Slider } from '@/components/ui/Slider'
import { Button } from '@/components/ui/button'
import { cn, glassSurfaceClass } from '@/components/common/uiClassTokens'

export default function TimelineReplay({ run }: { run: DrillRun }) {
  const steps = run.timeline || []
  const [scrubIndex, setScrubIndex] = useState(steps.length > 0 ? steps.length - 1 : 0)
  const [isPlaying, setIsPlaying] = useState(false)
  const prevRunIdRef = useRef(run.id)
  const prevStepsLengthRef = useRef(steps.length)

  useEffect(() => {
    const previousLength = prevStepsLengthRef.current
    prevStepsLengthRef.current = steps.length

    if (steps.length <= 0) {
      setScrubIndex(0)
      setIsPlaying(false)
      return
    }

    setScrubIndex((current) => {
      const maxIndex = steps.length - 1
      if (current > maxIndex) {
        return maxIndex
      }

      const wasAtTail = current >= Math.max(0, previousLength - 1)
      if (!isPlaying && steps.length > previousLength && wasAtTail) {
        return maxIndex
      }

      return current
    })
  }, [isPlaying, steps.length])

  useEffect(() => {
    setScrubIndex(steps.length > 0 ? steps.length - 1 : 0)
    setIsPlaying(false)
    prevRunIdRef.current = run.id
    prevStepsLengthRef.current = steps.length
  }, [run.id])

  useEffect(() => {
    if (!isPlaying || steps.length <= 1) {
      return
    }

    const interval = window.setInterval(() => {
      setScrubIndex((current) => {
        if (current >= steps.length - 1) {
          setIsPlaying(false)
          return current
        }
        return current + 1
      })
    }, 900)

    return () => {
      clearInterval(interval)
    }
  }, [isPlaying, steps.length])

  if (steps.length === 0) {
    return (
      <Card className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] border-dashed bg-[var(--surface-soft)]/20">
        <CardContent className="flex h-48 flex-col items-center justify-center space-y-3 text-[var(--text-muted)]">
          <History className="h-8 w-8 opacity-20" />
          <span className="text-sm font-bold uppercase tracking-widest opacity-50">
            Awaiting Sequence Initiation...
          </span>
        </CardContent>
      </Card>
    )
  }

  const boundedIndex = Math.min(Math.max(scrubIndex, 0), steps.length - 1)
  const currentStep = steps[boundedIndex]
  const atEnd = boundedIndex >= steps.length - 1

  const handlePlayToggle = () => {
    if (steps.length <= 1) return
    if (!isPlaying && atEnd) {
      setScrubIndex(0)
      setIsPlaying(true)
      return
    }
    setIsPlaying((value) => !value)
  }

  const handleFastForward = () => {
    setIsPlaying(false)
    setScrubIndex(steps.length - 1)
  }

  return (
    <Card
      className={cn(
        glassSurfaceClass,
        'relative overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-contrast)]/30 backdrop-blur-xl'
      )}
    >
      <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-soft)]/20 px-6 py-6 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-2 shadow-sm">
              <Clock className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Sequence Timeline
              </CardTitle>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Scrub through execution phases
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-solid)]/50 p-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8 rounded-lg', isPlaying && 'bg-sky-500/10 text-sky-600')}
              onPress={handlePlayToggle}
              isDisabled={steps.length <= 1}
              aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-sky-400"
              onPress={handleFastForward}
              isDisabled={atEnd}
              aria-label="Jump to latest event"
            >
              <FastForward className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        <div className="space-y-5">
          <Slider
            label="Timeline Position"
            min={0}
            max={steps.length - 1}
            value={boundedIndex}
            onChange={(val) => {
              setIsPlaying(false)
              setScrubIndex(Number(val.target.value))
            }}
            className="px-1"
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="animate-in fade-in rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 p-5 shadow-inner duration-300 lg:col-span-5">
              <div className="mb-4 flex items-center gap-3">
                <div
                  className={cn(
                    'rounded-lg border p-1.5',
                    currentStep.status === 'Error'
                      ? 'border-rose-500/20 bg-rose-500/10 text-rose-600'
                      : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                  )}
                >
                  {currentStep.status === 'Error' ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    {currentStep.phase}
                  </h5>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    {new Date(currentStep.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <p className="break-words text-xs font-medium leading-relaxed text-[var(--text-secondary)]">
                {currentStep.message}
              </p>
            </div>

            <div className="lg:col-span-7">
              <div className="relative max-h-[260px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/20 p-3 pr-2">
                <div className="space-y-2">
                  {steps.map((step, idx) => {
                    const selected = idx === boundedIndex
                    return (
                      <button
                        key={`${step.timestamp}-${idx}`}
                        type="button"
                        className={cn(
                          'grid w-full grid-cols-[28px_minmax(0,1fr)] items-stretch gap-3 rounded-lg p-2 text-left transition-all duration-200',
                          selected
                            ? 'bg-sky-500/8 ring-1 ring-sky-500/20'
                            : 'hover:bg-[var(--surface-soft)]/60'
                        )}
                        onClick={() => {
                          setIsPlaying(false)
                          setScrubIndex(idx)
                        }}
                      >
                        <span className="relative flex min-h-[40px] self-stretch items-start justify-center pt-2">
                          {idx > 0 && (
                            <span className="pointer-events-none absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-[var(--border)]" />
                          )}
                          {idx < steps.length - 1 && (
                            <span className="pointer-events-none absolute left-1/2 bottom-0 top-4 w-px -translate-x-1/2 bg-[var(--border)]" />
                          )}
                          <span
                            className={cn(
                              'z-10 flex h-4 w-4 items-center justify-center rounded-full border bg-[var(--surface-solid)] transition-all',
                              selected ? 'border-sky-500 shadow-sm' : 'border-[var(--border)]'
                            )}
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                selected ? 'bg-sky-400' : 'bg-[var(--border)]'
                              )}
                            />
                          </span>
                        </span>

                        <span className={cn('block min-w-0', !selected && 'opacity-80')}>
                          <span className="mb-0.5 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-tight text-[var(--text-primary)]">
                              {step.phase}
                            </span>
                            <span className="font-mono text-[9px] font-bold text-[var(--text-muted)] opacity-70">
                              {new Date(step.timestamp).toLocaleTimeString()}
                            </span>
                          </span>
                          <span className="block break-words text-[10px] font-medium leading-relaxed text-[var(--text-muted)]">
                            {step.message}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-sky-500/10 bg-sky-500/5 p-4 text-[10px] font-bold uppercase tracking-wider text-sky-700 shadow-sm">
          <Info className="h-4 w-4 shrink-0" />
          Snapshots are persisted in the Evidence Pack for historical auditability.
        </div>
      </CardContent>
    </Card>
  )
}
