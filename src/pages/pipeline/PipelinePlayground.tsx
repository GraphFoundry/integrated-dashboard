import { useState, useCallback, useEffect, useRef } from 'react'
import type { Scenario, FailureResponse, ScaleResponse } from '@/lib/types'
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
import { simulateFailure, simulateScale } from '@/lib/api'
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

  // Playback: advance to next enabled stage
  const advanceStage = useCallback(() => {
    setCurrentStageIndex((prev) => {
      // If prev is null, start from -1 to get first stage
      const currentIdx = prev ?? -1

      // Find next enabled stage
      const next = nextEnabledStageIndex(currentIdx, stageStatesMap, 1)

      // No more enabled stages
      if (next === null) {
        setIsPlaying(false)
        return prev
      }

      // Check stop-at condition
      if (stopAtIndex !== null && next > stopAtIndex) {
        setIsPlaying(false)
        return prev
      }

      const nextStage = PIPELINE_STAGES[next]
      if (!nextStage) return prev

      // Mark current as done if we had a previous stage
      if (prev !== null && prev >= 0 && prev < PIPELINE_STAGES.length) {
        const prevStage = PIPELINE_STAGES[prev]
        if (prevStage && stageStatesMap[prevStage.id]?.enabled) {
          updateStageStatus(prevStage.id, 'done')
        }
      }

      // Mark next as running
      updateStageStatus(nextStage.id, 'running')

      // Schedule next advancement
      playbackRef.current = setTimeout(() => {
        if (isPlaying) {
          advanceStage()
        }
      }, STAGE_DURATION_MS)

      return next
    })
  }, [stageStatesMap, stopAtIndex, updateStageStatus, isPlaying])

  // Playback controls
  const handlePlay = useCallback(() => {
    setIsPlaying(true)
    advanceStage()
  }, [advanceStage])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
    if (playbackRef.current) {
      clearTimeout(playbackRef.current)
    }
  }, [])

  const handleNext = useCallback(() => {
    if (playbackRef.current) {
      clearTimeout(playbackRef.current)
    }
    setIsPlaying(false)
    advanceStage()
  }, [advanceStage])

  const handleReset = useCallback(() => {
    setIsPlaying(false)
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

  const handleRun = async (scenario: Scenario) => {
    setLoading(true)
    setError(null)
    setResult(null)
    setScenarioType(scenario.type)
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
      } else {
        let response: FailureResponse | ScaleResponse
        if (scenario.type === 'failure') {
          response = await simulateFailure({
            serviceId: scenario.serviceId,
            maxDepth: scenario.maxDepth,
          })
        } else {
          response = await simulateScale({
            serviceId: scenario.serviceId,
            currentPods: scenario.currentPods,
            newPods: scenario.newPods,
            latencyMetric: scenario.latencyMetric,
            maxDepth: scenario.maxDepth,
          })
        }
        setResult(response)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to run simulation'
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
          <ScenarioForm onRun={handleRun} loading={loading} />

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
              />
            </>
          )}

          {!result && !loading && !error && (
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
              <div className="text-4xl mb-4">🔬</div>
              <p className="text-slate-400">Configure a scenario and click Run to see results</p>
            </div>
          )}

          {/* Alerts Integration Slot */}
          <AlertsSlot />
        </div>
      </div>
    </div>
  )
}
