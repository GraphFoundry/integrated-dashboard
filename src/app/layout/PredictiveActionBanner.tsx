import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, ArrowRight, BellOff, Gauge, Timer } from 'lucide-react'
import { getCurrentPredictiveAction } from '@/lib/api'
import type {
  PredictiveCurrentActionResponse,
  PredictiveRecommendation,
  PredictiveSeverity,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/common/uiClassTokens'

const POLL_INTERVAL_MS = 5000
const SNOOZE_MS = 60_000

type SnoozeState = {
  untilMs: number
  recommendationKey: string
  severity: PredictiveSeverity
}

function recommendationKey(recommendation: PredictiveRecommendation): string {
  return [
    recommendation.drillType,
    recommendation.target,
    String(recommendation.config.replicas ?? ''),
    recommendation.config.targetNode ?? '',
  ].join('|')
}

function severityRank(severity: PredictiveSeverity): number {
  switch (severity) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default:
      return 0
  }
}

function severityTone(severity: PredictiveSeverity): string {
  switch (severity) {
    case 'critical':
      return 'border-rose-400/45 bg-gradient-to-r from-rose-500/20 via-red-500/16 to-orange-500/16'
    case 'high':
      return 'border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-orange-500/16 to-yellow-500/16'
    case 'medium':
      return 'border-sky-400/35 bg-gradient-to-r from-sky-500/16 via-cyan-500/14 to-blue-500/14'
    default:
      return 'border-emerald-400/35 bg-gradient-to-r from-emerald-500/14 via-green-500/14 to-teal-500/14'
  }
}

function formatBottleneckLocation(payload: PredictiveCurrentActionResponse): string {
  const bottleneck = payload.primaryBottleneck
  if (!bottleneck) return 'No active bottleneck'

  if (bottleneck.type === 'capacity') {
    const serviceRef = [bottleneck.namespace, bottleneck.service].filter(Boolean).join('/')
    if (bottleneck.node && serviceRef) {
      return `${serviceRef} on ${bottleneck.node}`
    }
    return serviceRef || bottleneck.node || 'Capacity hotspot'
  }

  if (bottleneck.type === 'network') {
    const source = [bottleneck.sourceService, bottleneck.sourceNode].filter(Boolean).join('@')
    const target = [bottleneck.targetService, bottleneck.targetNode].filter(Boolean).join('@')
    if (source && target) return `${source} → ${target}`
    return source || target || 'Cross-node traffic hotspot'
  }

  return 'Active bottleneck'
}

export default function PredictiveActionBanner() {
  const navigate = useNavigate()
  const [payload, setPayload] = useState<PredictiveCurrentActionResponse | null>(null)
  const [visible, setVisible] = useState(false)
  const [snooze, setSnooze] = useState<SnoozeState | null>(null)

  useEffect(() => {
    let isMounted = true
    let timer: ReturnType<typeof setInterval> | null = null

    const poll = async () => {
      try {
        const next = await getCurrentPredictiveAction()
        if (!isMounted) return

        setPayload(next)
        const recommendation = next.recommendation
        if (!next.anomalyActive || !recommendation) {
          setVisible(false)
          return
        }

        const key = recommendationKey(recommendation)
        const activeSnooze = snooze

        if (activeSnooze && Date.now() < activeSnooze.untilMs) {
          const keyChanged = key !== activeSnooze.recommendationKey
          const isEscalated = severityRank(recommendation.severity) > severityRank(activeSnooze.severity)
          setVisible(keyChanged || isEscalated)
          return
        }

        setVisible(true)
      } catch {
        if (isMounted) {
          setVisible(false)
        }
      }
    }

    void poll()
    timer = setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      isMounted = false
      if (timer) clearInterval(timer)
    }
  }, [snooze])

  const recommendation = payload?.recommendation ?? null
  const severity = recommendation?.severity ?? 'low'
  const timeToImpact = payload?.timeToImpactSec
  const healthScore = payload?.healthScore

  const details = useMemo(() => {
    if (!payload) return []
    return [
      `Health Score ${Math.round(payload.healthScore)}/100`,
      `Bottleneck ${formatBottleneckLocation(payload)}`,
      timeToImpact != null ? `Impact in ~${timeToImpact}s` : 'Impact window stable',
    ]
  }, [payload, timeToImpact])

  if (!visible || !payload?.anomalyActive || !recommendation) {
    return null
  }

  return (
    <div className="sticky top-16 z-40 px-4 pb-4 pt-3 sm:px-6 lg:px-8">
      <div
        className={cn(
          'relative overflow-hidden rounded-[var(--radius-md)] border shadow-[0_22px_55px_rgba(2,8,23,0.35)]',
          severityTone(severity)
        )}
        role="alert"
        aria-live="assertive"
      >
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -left-10 top-0 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-black/20 blur-2xl" />
        </div>

        <div className="relative flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              Predictive Action Required
            </div>
            <h3 className="text-base font-bold tracking-tight text-[var(--text-primary)] md:text-lg">
              {recommendation.title}
            </h3>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{recommendation.message}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
              {details.map((detail) => (
                <span key={detail} className="inline-flex items-center gap-1">
                  {detail.startsWith('Health') ? (
                    <Gauge className="h-3.5 w-3.5 text-emerald-300" />
                  ) : detail.startsWith('Impact') ? (
                    <Timer className="h-3.5 w-3.5 text-amber-300" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                  )}
                  {detail}
                </span>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="success"
              onPress={() => {
                navigate('/drills', {
                  state: {
                    prefillDrill: {
                      type: recommendation.drillType,
                      target: recommendation.target,
                      config: recommendation.config,
                    },
                  },
                })
              }}
              className="h-10 px-4 text-xs font-bold uppercase tracking-wider"
            >
              Execute in Drill Director <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onPress={() => {
                setSnooze({
                  untilMs: Date.now() + SNOOZE_MS,
                  recommendationKey: recommendationKey(recommendation),
                  severity,
                })
                setVisible(false)
              }}
              className="h-10 border border-[var(--border)] bg-[var(--surface-soft)] px-4 text-xs font-semibold text-[var(--text-secondary)]"
            >
              <BellOff className="mr-1.5 h-3.5 w-3.5" />
              Snooze 60s
            </Button>
          </div>
        </div>

        {typeof healthScore === 'number' && (
          <div className="relative border-t border-white/10 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Live signal: analysis-engine health score {Math.round(healthScore)}/100
          </div>
        )}
      </div>
    </div>
  )
}
