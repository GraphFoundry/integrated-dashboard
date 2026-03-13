import { useState, useEffect, type ReactNode } from 'react'
import { Card, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { Input } from '@/components/ui'
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  Activity,
  Network,
  Zap,
  ArrowRight,
  ShieldAlert,
  Check,
  MoveRight,
} from 'lucide-react'
import { planDrill, type DrillPrefillRequest, type DrillRun } from '@/lib/api/drills'
import { getNodes, getServices } from '@/lib/api'
import { ApiError } from '@/lib/httpClient'
import type { DiscoveredService } from '@/lib/types'
import {
  glassInteractiveCardClass,
  cn,
  controlLabelClass,
  modalPanelClass,
  secondaryButtonClass,
  successButtonClass,
  controlInputBaseClass,
} from '@/components/common/uiClassTokens'

type DrillDefinition = {
  id: string
  type: string
  title: string
  description: string
  icon: ReactNode
  risk: 'High' | 'Medium' | 'Low'
  baseConfig: Record<string, unknown> & { observeTokens: number }
  tone: 'rose' | 'sky' | 'amber' | 'emerald'
}

const DRILLS: DrillDefinition[] = [
  {
    id: 'pod-scale-up',
    type: 'PodScaleUp',
    title: 'Pod Scale Up',
    description:
      'Increase deployment replicas on the recommended service to absorb projected load before saturation.',
    icon: <Activity className="w-5 h-5 text-sky-400" />,
    risk: 'Medium',
    baseConfig: { replicas: 3, observeTokens: 30 },
    tone: 'sky',
  },
  {
    id: 'migrate-service',
    type: 'MigrateService',
    title: 'Migrate Service',
    description:
      'Move a service workload to a target node to co-locate chatty dependencies and reduce cross-node latency.',
    icon: <MoveRight className="w-5 h-5 text-amber-400" />,
    risk: 'Medium',
    baseConfig: { observeTokens: 35 },
    tone: 'amber',
  },
  {
    id: 'service-shutdown',
    type: 'ServiceShutdown',
    title: 'Service Shutdown',
    description:
      'Instantly scales down a service to 0 replicas to test failure resilience and failover logic.',
    icon: <AlertTriangle className="w-5 h-5 text-rose-400" />,
    risk: 'High',
    baseConfig: { replicas: 0, observeTokens: 30 },
    tone: 'rose',
  },
  {
    id: 'service-brownout',
    type: 'ServiceBrownout',
    title: 'Service Brownout',
    description:
      'Scales the target down to a constrained replica count (1) to validate degradation behavior before full outage.',
    icon: <Activity className="w-5 h-5 text-orange-400" />,
    risk: 'Medium',
    baseConfig: { replicas: 1, observeTokens: 30 },
    tone: 'amber',
  },
  {
    id: 'network-cut',
    type: 'NetworkCut',
    title: 'Network Cut',
    description: 'Simulates a severed connection between two dependent services via NetworkPolicy.',
    icon: <Network className="w-5 h-5 text-amber-400" />,
    risk: 'High',
    baseConfig: { observeTokens: 25 },
    tone: 'amber',
  },
  {
    id: 'network-cut-extended',
    type: 'ExtendedNetworkCut',
    title: 'Extended Network Cut',
    description:
      'Longer observation network partition drill to inspect retries, timeouts, and cascading recovery behavior.',
    icon: <Network className="w-5 h-5 text-amber-400" />,
    risk: 'High',
    baseConfig: { observeTokens: 45 },
    tone: 'amber',
  },
  {
    id: 'targeted-load',
    type: 'TargetedLoad',
    title: 'Targeted Load',
    description:
      'Generates artificial traffic spikes against a specific component to observe saturation.',
    icon: <Zap className="w-5 h-5 text-emerald-400" />,
    risk: 'Low',
    baseConfig: { rps: 100, observeTokens: 15 },
    tone: 'emerald',
  },
  {
    id: 'traffic-spike',
    type: 'TrafficSpike',
    title: 'Traffic Spike',
    description:
      'Applies a stronger burst profile to pressure service capacity and downstream protections.',
    icon: <Zap className="w-5 h-5 text-emerald-400" />,
    risk: 'Medium',
    baseConfig: { rps: 300, users: 30, observeTokens: 30 },
    tone: 'emerald',
  },
]

const HIDDEN_DRILL_IDS = new Set(['service-brownout', 'migrate-service', 'network-cut-extended', 'traffic-spike'])
const VISIBLE_DRILLS = DRILLS.filter((d) => !HIDDEN_DRILL_IDS.has(d.id))

const DEFAULT_TARGETED_LOAD_RATE = 100
const DEFAULT_TARGETED_LOAD_USERS = 10

function namespaceFromTarget(target: string): string {
  const parts = target.split('/')
  return parts.length === 2 ? parts[0] : 'default'
}

export default function DrillCatalog({
  onDrillSelect,
  disabled = false,
  prefill = null,
  prefillBannerSeenAt = null,
  onPrefillConsumed,
}: {
  onDrillSelect: (run: DrillRun) => void
  disabled?: boolean
  prefill?: DrillPrefillRequest | null
  prefillBannerSeenAt?: string | null
  onPrefillConsumed?: () => void
}) {
  const [selectedDrill, setSelectedDrill] = useState<DrillDefinition | null>(null)
  const [targetService, setTargetService] = useState('')
  const [targetNode, setTargetNode] = useState('')
  const [replicaCount, setReplicaCount] = useState(3)
  const [observeTokens, setObserveTokens] = useState(30)
  const [isPlanning, setIsPlanning] = useState(false)
  const [services, setServices] = useState<DiscoveredService[]>([])
  const [nodes, setNodes] = useState<string[]>([])
  const [countdown, setCountdown] = useState(0)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [scenarioBannerSeenAt, setScenarioBannerSeenAt] = useState<string | null>(null)
  const [targetedLoadRate, setTargetedLoadRate] = useState(DEFAULT_TARGETED_LOAD_RATE)
  const [targetedLoadUsers, setTargetedLoadUsers] = useState(DEFAULT_TARGETED_LOAD_USERS)

  const isTargetedLoadScenario = selectedDrill?.type === 'TargetedLoad' || selectedDrill?.type === 'TrafficSpike'
  const isMigrateScenario = selectedDrill?.type === 'MigrateService'
  const isPodScaleUpScenario = selectedDrill?.type === 'PodScaleUp'

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [serviceResponse, nodeResponse] = await Promise.all([getServices(), getNodes()])
        const serviceList = serviceResponse.services || []
        const nodeList = (nodeResponse.nodes || []).map((node) => node.name)

        setServices(serviceList)
        setNodes(nodeList)

        if (serviceList.length > 0) {
          const first = serviceList[0]
          setTargetService(`${first.namespace}/${first.name}`)
        }
        if (nodeList.length > 0) {
          setTargetNode(nodeList[0])
        }
      } catch (err) {
        console.error('Failed to bootstrap drill catalog', err)
      }
    }
    void bootstrap()
  }, [])

  const handleSelectDrill = (
    drill: DrillDefinition,
    options?: {
      scenarioBannerSeenAt?: string | null
    }
  ) => {
    setSelectedDrill(drill)
    setPlanError(null)
    setCountdown(0)
    setIsConfirmed(false)
    setScenarioBannerSeenAt(options?.scenarioBannerSeenAt ?? null)

    setObserveTokens(Number(drill.baseConfig.observeTokens ?? 30))

    if (drill.type === 'TargetedLoad' || drill.type === 'TrafficSpike') {
      const presetRate = Number((drill.baseConfig as { rps?: number }).rps ?? DEFAULT_TARGETED_LOAD_RATE)
      const presetUsers = Number((drill.baseConfig as { users?: number }).users ?? DEFAULT_TARGETED_LOAD_USERS)
      setTargetedLoadRate(presetRate > 0 ? presetRate : DEFAULT_TARGETED_LOAD_RATE)
      setTargetedLoadUsers(presetUsers > 0 ? presetUsers : DEFAULT_TARGETED_LOAD_USERS)
    }

    if (typeof drill.baseConfig.replicas === 'number') {
      setReplicaCount(Math.max(1, Number(drill.baseConfig.replicas)))
    }

    if (drill.type === 'MigrateService' && !targetNode && nodes.length > 0) {
      setTargetNode(nodes[0])
    }
  }

  useEffect(() => {
    if (!prefill) return

    const matchedDrill = DRILLS.find((drill) => drill.type === prefill.type)
    if (!matchedDrill) {
      setPlanError(`Recommended drill type "${prefill.type}" is not available in this catalog.`)
      onPrefillConsumed?.()
      return
    }

    handleSelectDrill(matchedDrill, { scenarioBannerSeenAt: prefillBannerSeenAt })
    setTargetService(prefill.target)

    if (typeof prefill.config.observeTokens === 'number' && prefill.config.observeTokens > 0) {
      setObserveTokens(prefill.config.observeTokens)
    }

    if (matchedDrill.type === 'PodScaleUp' && typeof prefill.config.replicas === 'number') {
      setReplicaCount(Math.max(1, prefill.config.replicas))
    }

    if (matchedDrill.type === 'MigrateService' && prefill.config.targetNode) {
      setTargetNode(prefill.config.targetNode)
    }

    onPrefillConsumed?.()
  }, [prefill, prefillBannerSeenAt, onPrefillConsumed])

  const handlePlan = async () => {
    if (!selectedDrill || !targetService) return

    setPlanError(null)
    setIsPlanning(true)

    const namespace = namespaceFromTarget(targetService)
    let plannedConfig: Record<string, unknown> = {
      ...selectedDrill.baseConfig,
      namespace,
      observeTokens,
    }

    if (isTargetedLoadScenario) {
      plannedConfig = {
        ...plannedConfig,
        rps: targetedLoadRate,
        rate: targetedLoadRate,
        users: targetedLoadUsers,
      }
    }

    if (isPodScaleUpScenario) {
      plannedConfig = {
        ...plannedConfig,
        replicas: replicaCount,
      }
    }

    if (isMigrateScenario) {
      plannedConfig = {
        ...plannedConfig,
        targetNode,
      }
    }

    try {
      const plan = await planDrill({
        type: selectedDrill.type,
        target: targetService,
        config: plannedConfig,
        bannerVerified: scenarioBannerSeenAt !== null,
      })
      onDrillSelect(plan)
      setSelectedDrill(null)
      setCountdown(0)
      setIsConfirmed(false)
      setScenarioBannerSeenAt(null)
      setTargetedLoadRate(DEFAULT_TARGETED_LOAD_RATE)
      setTargetedLoadUsers(DEFAULT_TARGETED_LOAD_USERS)
    } catch (err) {
      console.error(err)
      if (err instanceof ApiError) {
        setPlanError(`Plan request failed (${err.status || 'network'}): ${err.message}`)
      } else if (err instanceof Error) {
        setPlanError(err.message)
      } else {
        setPlanError('Plan request failed. Check backend availability and try again.')
      }
    } finally {
      setIsPlanning(false)
    }
  }

  const startCountdown = () => {
    setCountdown(3)
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const comboItems = services.map((service) => ({
    label: `${service.namespace}/${service.name}`,
    value: `${service.namespace}/${service.name}`,
  }))
  const nodeItems = nodes.map((node) => ({ label: node, value: node }))

  const targetedLoadProfileInvalid =
    isTargetedLoadScenario && (targetedLoadRate < 1 || targetedLoadUsers < 1)
  const migrateTargetInvalid = isMigrateScenario && !targetNode.trim()
  const scaleReplicaInvalid = isPodScaleUpScenario && replicaCount < 1

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-6', disabled && 'pointer-events-none opacity-50')}>
      {VISIBLE_DRILLS.map((drill) => (
        <Card
          key={drill.id}
          data-testid="drill-catalog-card"
          data-drill-type={drill.type}
          className={cn(
            glassInteractiveCardClass,
            'group relative flex flex-col justify-between cursor-pointer',
            selectedDrill?.id === drill.id &&
              'ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-[var(--background)]'
          )}
          onClick={() => handleSelectDrill(drill)}
        >
          <div className="flex flex-col h-full space-y-4">
            <div className="flex items-start justify-between">
              <div
                className={cn(
                  'p-3 rounded-xl border shadow-sm transition-all duration-300 group-hover:scale-105',
                  drill.tone === 'rose' && 'bg-rose-500/10 border-rose-500/20 text-rose-500',
                  drill.tone === 'sky' && 'bg-sky-500/10 border-sky-500/20 text-sky-500',
                  drill.tone === 'amber' && 'bg-amber-500/10 border-amber-500/20 text-amber-500',
                  drill.tone === 'emerald' &&
                    'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                )}
              >
                {drill.icon}
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5',
                  drill.risk === 'High'
                    ? 'text-rose-500 border-rose-500/20'
                    : drill.risk === 'Medium'
                      ? 'text-amber-500 border-amber-500/20'
                      : 'text-emerald-500 border-emerald-500/20'
                )}
              >
                {drill.risk} Risk
              </Badge>
            </div>

            <div className="space-y-2">
              <CardTitle className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                {drill.title}
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {drill.description}
              </CardDescription>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-[var(--border)]">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Target Time
                </span>
                <span className="text-xs font-semibold text-[var(--text-secondary)]">
                  ~{drill.baseConfig.observeTokens}s Window
                </span>
              </div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-2 group-hover:translate-x-1 transition-all">
                Configure <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </Card>
      ))}

      {selectedDrill && (
        <DialogContent
          isOpen={Boolean(selectedDrill)}
          data-testid="drill-safety-gate"
          onOpenChange={(open) => {
            if (!open) {
              setSelectedDrill(null)
              setCountdown(0)
              setIsConfirmed(false)
              setPlanError(null)
              setScenarioBannerSeenAt(null)
              setTargetedLoadRate(DEFAULT_TARGETED_LOAD_RATE)
              setTargetedLoadUsers(DEFAULT_TARGETED_LOAD_USERS)
            }
          }}
          className={modalPanelClass}
        >
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <ShieldAlert className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-[var(--text-primary)]">
                  Safety Gate
                </DialogTitle>
                <DialogDescription className="text-sm font-medium">
                  Execution planning for manual drill actioning
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="drill-target-component"
                  className={cn(controlLabelClass, 'text-[var(--text-secondary)]')}
                >
                  Target Component
                </label>
                <Combobox
                  id="drill-target-component"
                  items={comboItems}
                  value={targetService}
                  onSelectionChange={(value) => setTargetService(value as string)}
                  placeholder="Select a service..."
                  aria-label="Target Component"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="drill-observation-window"
                  className={cn(controlLabelClass, 'text-[var(--text-secondary)]')}
                >
                  Observation Window
                </label>
                <div
                  id="drill-observation-window"
                  className={cn(controlInputBaseClass, 'flex items-center bg-[var(--surface-soft)]')}
                >
                  {observeTokens} Seconds
                </div>
              </div>
            </div>

            {isPodScaleUpScenario && (
              <div className="space-y-2">
                <label
                  htmlFor="drill-replicas"
                  className={cn(controlLabelClass, 'text-[var(--text-secondary)]')}
                >
                  Desired Replicas
                </label>
                <Input
                  id="drill-replicas"
                  type="number"
                  min={1}
                  step={1}
                  value={replicaCount}
                  onChange={(e) => setReplicaCount(Math.max(0, Number(e.target.value) || 0))}
                  aria-label="Pod scale up replicas"
                />
              </div>
            )}

            {isMigrateScenario && (
              <div className="space-y-2">
                <label
                  htmlFor="drill-target-node"
                  className={cn(controlLabelClass, 'text-[var(--text-secondary)]')}
                >
                  Target Node
                </label>
                <Combobox
                  id="drill-target-node"
                  items={nodeItems}
                  value={targetNode}
                  onSelectionChange={(value) => setTargetNode(value as string)}
                  placeholder="Select a node..."
                  aria-label="Migration target node"
                />
              </div>
            )}

            {isTargetedLoadScenario && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="drill-load-rate"
                    className={cn(controlLabelClass, 'text-[var(--text-secondary)]')}
                  >
                    Load Rate (RATE)
                  </label>
                  <Input
                    id="drill-load-rate"
                    type="number"
                    min={1}
                    step={1}
                    value={targetedLoadRate}
                    onChange={(e) => setTargetedLoadRate(Math.max(0, Number(e.target.value) || 0))}
                    aria-label="Targeted load RATE"
                  />
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                    Applied to `loadgenerator` env `RATE`
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="drill-load-users"
                    className={cn(controlLabelClass, 'text-[var(--text-secondary)]')}
                  >
                    Concurrent Users (USERS)
                  </label>
                  <Input
                    id="drill-load-users"
                    type="number"
                    min={1}
                    step={1}
                    value={targetedLoadUsers}
                    onChange={(e) => setTargetedLoadUsers(Math.max(0, Number(e.target.value) || 0))}
                    aria-label="Targeted load USERS"
                  />
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                    Applied to `loadgenerator` env `USERS`
                  </p>
                </div>
              </div>
            )}

            {(targetedLoadProfileInvalid || migrateTargetInvalid || scaleReplicaInvalid) && (
              <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-[var(--radius-md)] text-xs text-amber-700 shadow-sm">
                <AlertTriangle className="shrink-0 w-5 h-5 text-amber-500" />
                <div className="space-y-1">
                  <p className="font-bold uppercase tracking-wider text-amber-600">Invalid Drill Config</p>
                  {targetedLoadProfileInvalid && (
                    <p className="leading-relaxed font-medium opacity-90">
                      `RATE` and `USERS` must both be greater than 0 for load drills.
                    </p>
                  )}
                  {migrateTargetInvalid && (
                    <p className="leading-relaxed font-medium opacity-90">
                      `targetNode` is required for `MigrateService` drills.
                    </p>
                  )}
                  {scaleReplicaInvalid && (
                    <p className="leading-relaxed font-medium opacity-90">
                      `replicas` must be greater than 0 for `PodScaleUp` drills.
                    </p>
                  )}
                </div>
              </div>
            )}

            {planError && (
              <div className="flex gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-[var(--radius-md)] text-xs text-rose-600 shadow-sm">
                <AlertTriangle className="shrink-0 w-5 h-5 text-rose-500" />
                <div className="space-y-1">
                  <p className="font-bold uppercase tracking-wider text-rose-500">Plan Failed</p>
                  <p className="leading-relaxed font-medium opacity-90">{planError}</p>
                </div>
              </div>
            )}

            <div className="bg-[var(--surface-soft)] border border-[var(--border)] p-4 rounded-[var(--radius-md)]">
              <Checkbox
                checked={isConfirmed}
                onChange={(e) => {
                  setIsConfirmed(e.target.checked)
                  if (e.target.checked) startCountdown()
                }}
                label={
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      I acknowledge the blast radius
                    </p>
                    <p className="text-xs text-[var(--text-muted)] font-medium">
                      Recovery remains operator-controlled with failsafe support.
                    </p>
                  </div>
                }
              />
            </div>

            <div className="flex gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-[var(--radius-md)] text-xs text-rose-600 shadow-sm">
              <AlertTriangle className="shrink-0 w-5 h-5 text-rose-500" />
              <div className="space-y-1">
                <p className="font-bold uppercase tracking-wider text-rose-500">Simulation Guardrail</p>
                <p className="leading-relaxed font-medium opacity-90">
                  Recovery is operator-controlled after observation. A 5-minute failsafe rollback
                  will activate if no manual recovery is triggered.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-3">
            <Button
              variant="ghost"
              onPress={() => {
                setSelectedDrill(null)
                setPlanError(null)
                setScenarioBannerSeenAt(null)
              }}
              className={secondaryButtonClass}
            >
              Cancel
            </Button>
            <Button
              onPress={handlePlan}
              data-testid="drill-engage-sequence"
              isDisabled={
                isPlanning ||
                !isConfirmed ||
                countdown > 0 ||
                !targetService ||
                Boolean(targetedLoadProfileInvalid) ||
                Boolean(migrateTargetInvalid) ||
                Boolean(scaleReplicaInvalid)
              }
              className={cn(successButtonClass, 'min-w-[180px]')}
            >
              {isPlanning ? (
                'Sequencing...'
              ) : countdown > 0 ? (
                `Unlocking in ${countdown}s`
              ) : (
                <span className="flex items-center gap-2">
                  Engage Sequence <Check className="w-4 h-4" />
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </div>
  )
}
