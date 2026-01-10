import { useState, useCallback, useEffect, useRef } from 'react'
import type { Scenario, FailureResponse, ScaleResponse, LastRunMeta } from '@/lib/types'
import type { StageId, StageState, StageStatus, ScenarioType } from '@/pages/pipeline/pipelineTypes'
import {
  PIPELINE_STAGES,
  nextEnabledStageIndex,
  resolveStopIndex,
  isStageSupported,
  resolveStopStageId,
  getFirstRunnableIndex,
} from '@/pages/pipeline/pipelineTypes'
import ScenarioForm from '@/pages/pipeline/components/ScenarioForm'
import TraceTimeline from '@/pages/pipeline/components/TraceTimeline'
import ResultPanels, { type DemoStopInfo } from '@/pages/pipeline/components/ResultPanels'
import StageControls from '@/pages/pipeline/components/StageControls'
import PlaybackControls from '@/pages/pipeline/components/PlaybackControls'
import ExportButtons from '@/pages/pipeline/components/ExportButtons'
import AlertsSlot from '@/widgets/alerts/AlertsSlot'
import StatusBadge from '@/components/common/StatusBadge'
import { simulateFailure, simulateScale, healthCheck } from '@/lib/api'
import failureMock from '@/mocks/failure-trace.json'
import scaleMock from '@/mocks/scale-trace.json'

type Mode = 'mock' | 'live'

// Default duration per stage in ms (used for playback simulation)
const STAGE_DURATION_MS = 400

// Initialize stage states from PIPELINE_STAGES
function createInitialStageStates(scenarioType: ScenarioType = 'failure'): StageState[] {
  return PIPELINE_STAGES.map((stage) => {
    const supported = isStageSupported(stage.id, scenarioType)
    return {
      id: stage.id,
      userEnabled: true, // Default: user wants all stages enabled
      enabled: supported, // Derived: userEnabled && supported
      status: (supported ? 'pending' : 'skipped') as StageStatus,
    }
  })
}

/**
 * Reconcile stage states when scenario type changes
 * Preserves user preferences (userEnabled) and derives enabled from userEnabled && supported
 */
function reconcileStageStatesForScenario(
  prevStates: StageState[],
  scenarioType: ScenarioType
): StageState[] {
  return prevStates.map((s) => {
    const supported = isStageSupported(s.id, scenarioType)

    // If stage just became supported and userEnabled was never explicitly set, default to true
    // Otherwise preserve existing userEnabled
    const userEnabled = s.userEnabled ?? true

    const enabled = supported && userEnabled
    const status: StageStatus = enabled ? 'pending' : 'skipped'

    return { ...s, userEnabled, enabled, status }
  })
}

export default function PipelinePlayground() {
  const [mode, setMode] = useState<Mode>('mock')
  const [scenarioType, setScenarioType] = useState<ScenarioType>('failure')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FailureResponse | ScaleResponse | null>(null)

  // Stage control state
  const [stageStates, setStageStates] = useState<StageState[]>(() =>
    createInitialStageStates('failure')
  )
  const [stopAtStage, setStopAtStage] = useState<StageId | null>(null)

  // Playback state
  const [currentStageIndex, setCurrentStageIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to track isPlaying in closures (avoids stale closure in setTimeout)
  const isPlayingRef = useRef(false)

  // Live mode: abort controller for canceling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null)

  // Live mode: health status for backend connectivity indicator
  type HealthStatus = 'checking' | 'connected' | 'unreachable'
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)

  // Proof metadata: tracks run context for operator auditability
  const [lastRunMeta, setLastRunMeta] = useState<LastRunMeta | null>(null)

  // Compute derived values
  const totalStages = PIPELINE_STAGES.length
  const disabledStages = stageStates.filter((s) => !s.enabled).map((s) => s.id)
  const stageStatesMap = stageStates.reduce<Record<StageId, StageState>>(
    (acc, s) => {
      acc[s.id] = s
      return acc
    },
    {} as Record<StageId, StageState>
  )

  // Stop at index calculation - resolves to nearest enabled stage
  const stopAtIndex = resolveStopIndex(stopAtStage, stageStatesMap)

  // Handle scenario type change - reconcile stage states and resolve stop/current
  useEffect(() => {
    // Stop any active playback when scenario changes
    setIsPlaying(false)
    if (playbackRef.current) {
      clearTimeout(playbackRef.current)
    }

    setStageStates((prev) => {
      const next = reconcileStageStatesForScenario(prev, scenarioType)
      const nextMap = next.reduce<Record<StageId, StageState>>(
        (acc, s) => {
          acc[s.id] = s
          return acc
        },
        {} as Record<StageId, StageState>
      )

      // Resolve stopAtStage from computed next state
      setStopAtStage((prevStop) => {
        const { resolved } = resolveStopStageId(prevStop, nextMap, scenarioType)
        return resolved
      })

      // Reset currentStageIndex from computed next state
      setCurrentStageIndex((prevIdx) => {
        const first = getFirstRunnableIndex(nextMap, scenarioType)
        if (first === null) return null

        if (prevIdx === null) return first

        const cur = PIPELINE_STAGES[prevIdx]
        const valid = !!cur && nextMap[cur.id]?.enabled && isStageSupported(cur.id, scenarioType)
        return valid ? prevIdx : first
      })

      return next
    })
  }, [scenarioType])

  // Cleanup playback timer on unmount
  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        clearTimeout(playbackRef.current)
      }
    }
  }, [])

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // Reset simulation state when mode changes
  useEffect(() => {
    // Clear previous results when switching modes
    setResult(null)
    setLastRunMeta(null)
    setError(null)
    setCurrentStageIndex(null)
    setIsPlaying(false)
    isPlayingRef.current = false
    if (playbackRef.current) {
      clearTimeout(playbackRef.current)
    }
    // Reset stage states to pending
    setStageStates((prev) =>
      prev.map((s) => ({
        ...s,
        status: s.enabled ? ('pending' as StageStatus) : ('skipped' as StageStatus),
      }))
    )
  }, [mode])

  // Health polling when Live mode is active
  useEffect(() => {
    if (mode !== 'live') {
      setHealthStatus(null)
      return
    }

    let isMounted = true
    const checkHealth = async () => {
      if (!isMounted) return
      setHealthStatus('checking')
      try {
        await healthCheck()
        if (isMounted) setHealthStatus('connected')
      } catch {
        if (isMounted) setHealthStatus('unreachable')
      }
    }

    // Initial check
    checkHealth()

    // Poll every 15 seconds
    const intervalId = setInterval(checkHealth, 15000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [mode])

  // Handle stage toggle
  const handleToggleStage = useCallback(
    (stageId: StageId) => {
      // Prevent toggling unsupported stages
      if (!isStageSupported(stageId, scenarioType)) return

      setStageStates((prev) =>
        prev.map((s) => {
          if (s.id === stageId) {
            const newUserEnabled = !s.userEnabled
            const newEnabled = newUserEnabled && isStageSupported(stageId, scenarioType)
            return {
              ...s,
              userEnabled: newUserEnabled,
              enabled: newEnabled,
              status: newEnabled ? ('pending' as StageStatus) : ('skipped' as StageStatus),
            }
          }
          return s
        })
      )
    },
    [scenarioType]
  )

  // Handle stop-at-stage change
  const handleStopAtChange = useCallback((stageId: StageId | null) => {
    setStopAtStage(stageId)
  }, [])

  // Update stage status helper
  const updateStageStatus = useCallback((stageId: StageId, status: StageStatus) => {
    setStageStates((prev) => prev.map((s) => (s.id === stageId ? { ...s, status } : s)))
  }, [])

  // Helper to mark a stage as done if valid and enabled
  const markStageAsDone = useCallback(
    (stageIdx: number | null) => {
      if (stageIdx === null || stageIdx < 0 || stageIdx >= PIPELINE_STAGES.length) return
      const stage = PIPELINE_STAGES[stageIdx]
      if (stage && stageStatesMap[stage.id]?.enabled) {
        updateStageStatus(stage.id, 'done')
      }
    },
    [stageStatesMap, updateStageStatus]
  )

  // Helper to stop playback
  const stopPlayback = useCallback(() => {
    setIsPlaying(false)
    isPlayingRef.current = false
  }, [])

  // Playback: advance to next enabled stage
  const advanceStage = useCallback(() => {
    setCurrentStageIndex((prev) => {
      const currentIdx = prev ?? -1
      const next = nextEnabledStageIndex(currentIdx, stageStatesMap, 1)

      // No more enabled stages OR hit stop condition - mark current as done and stop
      const shouldStop = next === null || (stopAtIndex !== null && next > stopAtIndex)
      if (shouldStop) {
        markStageAsDone(prev)
        stopPlayback()
        return prev
      }

      const nextStage = PIPELINE_STAGES[next]
      if (!nextStage) return prev

      // Mark previous stage as done
      markStageAsDone(prev)

      // Mark next as running
      updateStageStatus(nextStage.id, 'running')

      // Schedule next advancement
      playbackRef.current = setTimeout(() => {
        if (isPlayingRef.current) {
          advanceStage()
        }
      }, STAGE_DURATION_MS)

      return next
    })
  }, [stageStatesMap, stopAtIndex, updateStageStatus, markStageAsDone, stopPlayback])

  // Playback controls
  const handlePlay = useCallback(() => {
    setIsPlaying(true)
    isPlayingRef.current = true
    advanceStage()
  }, [advanceStage])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
    isPlayingRef.current = false
    if (playbackRef.current) {
      clearTimeout(playbackRef.current)
    }
  }, [])

  const handleNext = useCallback(() => {
    if (playbackRef.current) {
      clearTimeout(playbackRef.current)
    }
    setIsPlaying(false)
    isPlayingRef.current = false
    advanceStage()
  }, [advanceStage])

  const handleReset = useCallback(() => {
    setIsPlaying(false)
    isPlayingRef.current = false
    setCurrentStageIndex(null)

    // Reset stage states - mark disabled as skipped, enabled as pending
    setStageStates((prev) =>
      prev.map((s) => ({
        ...s,
        status: s.enabled ? ('pending' as StageStatus) : ('skipped' as StageStatus),
      }))
    )

    if (playbackRef.current) {
      clearTimeout(playbackRef.current)
    }
  }, [])

  // Generate a unique request ID for tracing (matches format from httpClient)
  const generateRequestId = (): string => {
    return (
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    )
  }

  // Helper to extract error message from caught error (reduces complexity in handleRun)
  const getErrorMessage = (err: unknown): string | null => {
    const error = err as {
      name?: string
      code?: string
      status?: number
      response?: { status?: number }
      message?: string
    }
    const name = error?.name
    const code = error?.code
    const status = error?.status ?? error?.response?.status

    // Abort/cancel: return null to signal ignore
    if (name === 'CanceledError' || code === 'ERR_CANCELED') {
      return null
    }

    if (status === 503) {
      return 'Predictive engine unavailable (503). Graph data may be stale or backend is degrading. Check /health and backend logs.'
    }
    if (status === 500) {
      return 'Predictive engine internal error (500). Graph Engine may be down or misconfigured. Check backend logs.'
    }
    if (status === 502 || status == null || code === 'ERR_NETWORK') {
      return 'Predictive engine unreachable. Is the backend running on :7000 and is the Vite /api proxy working?'
    }
    return error?.message || 'Failed to run simulation'
  }

  const handleRun = async (scenario: Scenario) => {
    // Abort any previous in-flight request
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    // Generate request ID BEFORE starting (so it's set even on failure)
    const runRequestId = generateRequestId()
    const runMeta: LastRunMeta = {
      requestId: runRequestId,
      startedAt: new Date().toISOString(),
      source: mode,
      scenario,
    }
    setLastRunMeta(runMeta)

    setLoading(true)
    setError(null)
    setResult(null)
    handleReset()

    try {
      if (mode === 'mock') {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 800)
        })
        if (scenario.type === 'failure') {
          setResult(failureMock as FailureResponse)
        } else {
          setResult(scaleMock as ScaleResponse)
        }
        // Set completedAt for mock mode
        setLastRunMeta((prev) => (prev ? { ...prev, completedAt: new Date().toISOString() } : null))
      } else {
        let response: FailureResponse | ScaleResponse
        if (scenario.type === 'failure') {
          response = await simulateFailure(
            {
              serviceId: scenario.serviceId,
              maxDepth: scenario.maxDepth,
            },
            { signal, requestId: runRequestId }
          )
        } else {
          response = await simulateScale(
            {
              serviceId: scenario.serviceId,
              currentPods: scenario.currentPods,
              newPods: scenario.newPods,
              latencyMetric: scenario.latencyMetric,
              maxDepth: scenario.maxDepth,
            },
            { signal, requestId: runRequestId }
          )
        }
        setResult(response)
        // Set completedAt on success
        setLastRunMeta((prev) => (prev ? { ...prev, completedAt: new Date().toISOString() } : null))
      }
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      if (errorMessage === null) {
        // Abort/cancel: ignore, but ensure UI stops loading
        setLoading(false)
        return
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Build demo stop info for ResultPanels
  const demoStopInfo: DemoStopInfo = {
    stopAtStage,
    disabledStages,
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with Mode Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Pipeline Playground</h1>
          <p className="text-slate-400 mt-1">
            Test failure and scaling scenarios with pipeline trace visualization
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Health Badge - only show in Live mode */}
          {mode === 'live' &&
            healthStatus &&
            (() => {
              let healthVariant: 'success' | 'destructive' | 'secondary' = 'secondary'
              let healthLabel = '◌ Live: Checking'
              if (healthStatus === 'connected') {
                healthVariant = 'success'
                healthLabel = '● Live: Connected'
              } else if (healthStatus === 'unreachable') {
                healthVariant = 'destructive'
                healthLabel = '○ Live: Unreachable'
              }
              return <StatusBadge variant={healthVariant}>{healthLabel}</StatusBadge>
            })()}
          <div className="flex items-center gap-2 bg-slate-900 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setMode('mock')}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                mode === 'mock' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mock
            </button>
            <button
              type="button"
              onClick={() => setMode('live')}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                mode === 'live' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Live
            </button>
          </div>
        </div>
      </div>

      {/* Live Mode Honesty Banner */}
      {mode === 'live' && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <span className="text-blue-400 text-lg">ℹ️</span>
            <p className="text-sm text-blue-200">
              <strong>Demo controls</strong> (toggle/stop/playback) simulate stage playback in the
              UI. The backend still executes the full pipeline.
            </p>
          </div>
        </div>
      )}

      {/* Mock Mode Banner */}
      {mode === 'mock' && (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <span className="text-slate-400 text-lg">📋</span>
            <p className="text-sm text-slate-300">
              <strong>Demo controls</strong> drive the mock playback.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid - 4 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Scenario Form + Stage Controls */}
        <div className="lg:col-span-1 space-y-6">
          <ScenarioForm
            onRun={handleRun}
            loading={loading}
            mode={mode}
            scenarioType={scenarioType}
            onScenarioTypeChange={setScenarioType}
          />

          {/* Stage Controls (Demo Settings) */}
          <StageControls
            stages={stageStates}
            onToggleStage={handleToggleStage}
            stopAtStage={stopAtStage}
            onStopAtStageChange={handleStopAtChange}
            scenarioType={scenarioType}
            isRunning={loading || isPlaying}
          />
        </div>

        {/* Main Content - 3 columns */}
        <div className="lg:col-span-3 space-y-6">
          {/* Playback Controls - show when we have results */}
          {result?.pipelineTrace && (
            <PlaybackControls
              isPlaying={isPlaying}
              isPaused={!isPlaying && currentStageIndex !== null}
              currentStageIndex={currentStageIndex}
              totalStages={totalStages}
              onPlay={handlePlay}
              onPause={handlePause}
              onNext={handleNext}
              onReset={handleReset}
              disabled={loading}
            />
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
              <h3 className="text-red-400 font-semibold mb-1">Error</h3>
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {loading && (
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-slate-400">Running simulation...</p>
            </div>
          )}

          {result?.pipelineTrace && (
            <>
              <TraceTimeline
                trace={result.pipelineTrace}
                currentStageIndex={currentStageIndex ?? undefined}
                stageStates={stageStatesMap}
                stopAtIndex={stopAtIndex}
              />

              {/* Export Buttons */}
              <ExportButtons trace={result.pipelineTrace} fullResponse={result} />

              <ResultPanels
                result={result}
                demoStopInfo={demoStopInfo}
                currentStageIndex={currentStageIndex ?? undefined}
                stageStates={stageStatesMap}
                lastRunMeta={lastRunMeta ?? undefined}
              />
            </>
          )}

          {/* Empty state - different for Mock vs Live */}
          {!result && !loading && !error && mode === 'mock' && (
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
              <div className="text-4xl mb-4">🔬</div>
              <p className="text-slate-400">Configure a scenario and click Run to see results</p>
            </div>
          )}

          {!result &&
            !loading &&
            !error &&
            mode === 'live' &&
            (() => {
              let statusMessage = 'Checking backend connection...'
              if (healthStatus === 'connected') {
                statusMessage =
                  'Backend is connected. Configure a scenario and click Run to fetch real predictions.'
              } else if (healthStatus === 'unreachable') {
                statusMessage =
                  'Backend is unreachable. Please ensure the Predictive Analysis Engine is running.'
              }
              return (
                <div className="bg-slate-900 border border-blue-700/50 rounded-lg p-8 text-center">
                  <div className="text-4xl mb-4">🚀</div>
                  <h3 className="text-white font-semibold mb-2">Live Mode Ready</h3>
                  <p className="text-slate-400">{statusMessage}</p>
                </div>
              )
            })()}

          {/* Alerts Integration Slot */}
          <AlertsSlot />
        </div>
      </div>
    </div>
  )
}
