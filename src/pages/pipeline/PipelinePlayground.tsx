import { useState, useCallback, useEffect, useRef } from 'react'
import type { Scenario, FailureResponse, ScaleResponse } from '@/lib/types'
import ScenarioForm from '@/pages/pipeline/components/ScenarioForm'
import TraceTimeline from '@/pages/pipeline/components/TraceTimeline'
import ResultPanels, { type DemoStopInfo } from '@/pages/pipeline/components/ResultPanels'
import StageControls, {
  PIPELINE_STAGES,
  type StageId,
  type StageState,
  type StageStatus,
} from '@/pages/pipeline/components/StageControls'
import PlaybackControls from '@/pages/pipeline/components/PlaybackControls'
import ExportButtons from '@/pages/pipeline/components/ExportButtons'
import AlertsSlot from '@/widgets/alerts/AlertsSlot'
import { simulateFailure, simulateScale } from '@/lib/api'
import failureMock from '@/mocks/failure-trace.json'
import scaleMock from '@/mocks/scale-trace.json'

type Mode = 'mock' | 'live'
type ScenarioType = 'failure' | 'scale'

// Default duration per stage in ms (used for playback simulation)
const STAGE_DURATION_MS = 400

// Initialize stage states from PIPELINE_STAGES
function createInitialStageStates(): StageState[] {
  return PIPELINE_STAGES.map((stage) => ({
    id: stage.id,
    status: 'pending' as StageStatus,
    enabled: true,
  }))
}

export default function PipelinePlayground() {
  const [mode, setMode] = useState<Mode>('mock')
  const [scenarioType, setScenarioType] = useState<ScenarioType>('failure')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FailureResponse | ScaleResponse | null>(null)

  // Stage control state
  const [stageStates, setStageStates] = useState<StageState[]>(createInitialStageStates)
  const [stopAtStage, setStopAtStage] = useState<StageId | null>(null)

  // Playback state
  const [currentStageIndex, setCurrentStageIndex] = useState(-1)
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

  // Stop at index calculation
  const stopAtIndex = stopAtStage ? PIPELINE_STAGES.findIndex((s) => s.id === stopAtStage) : null

  // Cleanup playback timer on unmount
  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        clearTimeout(playbackRef.current)
      }
    }
  }, [])

  // Handle stage toggle
  const handleToggleStage = useCallback((stageId: StageId) => {
    setStageStates((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, enabled: !s.enabled } : s))
    )
  }, [])

  // Handle stop-at-stage change
  const handleStopAtChange = useCallback((stageId: StageId | null) => {
    setStopAtStage(stageId)
  }, [])

  // Update stage status helper
  const updateStageStatus = useCallback((stageId: StageId, status: StageStatus) => {
    setStageStates((prev) => prev.map((s) => (s.id === stageId ? { ...s, status } : s)))
  }, [])

  // Playback: advance to next stage
  const advanceStage = useCallback(() => {
    setCurrentStageIndex((prev) => {
      const next = prev + 1

      // Check bounds
      if (next >= PIPELINE_STAGES.length) {
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

      const stageState = stageStatesMap[nextStage.id]

      // Skip disabled stages
      if (!stageState?.enabled) {
        updateStageStatus(nextStage.id, 'skipped')
        return next
      }

      // Mark as running
      updateStageStatus(nextStage.id, 'running')

      // Schedule completion
      playbackRef.current = setTimeout(() => {
        updateStageStatus(nextStage.id, 'done')
      }, STAGE_DURATION_MS)

      return next
    })
  }, [stopAtIndex, stageStatesMap, updateStageStatus])

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
    advanceStage()
  }, [advanceStage])

  const handleReset = useCallback(() => {
    setIsPlaying(false)
    setCurrentStageIndex(-1)
    setStageStates(createInitialStageStates())
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
              isPaused={!isPlaying && currentStageIndex > -1}
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
                currentStageIndex={currentStageIndex}
                stageStates={stageStatesMap}
                stopAtIndex={stopAtIndex}
              />

              {/* Export Buttons */}
              <ExportButtons trace={result.pipelineTrace} fullResponse={result} />

              <ResultPanels result={result} demoStopInfo={demoStopInfo} />
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
