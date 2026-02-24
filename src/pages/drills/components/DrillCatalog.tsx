import { useState, useEffect } from 'react'
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
import { AlertTriangle, Activity, Network, Zap, ArrowRight, ShieldAlert, Check } from 'lucide-react'
import { planDrill, type DrillRun } from '@/lib/api/drills'
import { getServices } from '@/lib/api'
import { ApiError } from '@/lib/httpClient'
import {
  glassInteractiveCardClass,
  cn,
  controlLabelClass,
  modalPanelClass,
  secondaryButtonClass,
  successButtonClass,
  controlInputBaseClass,
} from '@/components/common/uiClassTokens'

const DRILLS = [
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
    id: 'scale-stress',
    type: 'ScaleStress',
    title: 'Scale Stress',
    description:
      'Changes replica counts to simulate sudden traffic absorption or resource starvation.',
    icon: <Activity className="w-5 h-5 text-sky-400" />,
    risk: 'Medium',
    baseConfig: { replicas: 3, observeTokens: 20 },
    tone: 'sky',
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
      'Applies a stronger burst profile to pressure autoscaling and downstream dependency protections.',
    icon: <Zap className="w-5 h-5 text-emerald-400" />,
    risk: 'Medium',
    baseConfig: { rps: 300, users: 30, observeTokens: 30 },
    tone: 'emerald',
  },
]

const DEFAULT_TARGETED_LOAD_RATE = 100
const DEFAULT_TARGETED_LOAD_USERS = 10

export default function DrillCatalog({
  onDrillSelect,
}: {
  onDrillSelect: (run: DrillRun) => void
}) {
  const [selectedDrill, setSelectedDrill] = useState<(typeof DRILLS)[number] | null>(null)
  const [targetService, setTargetService] = useState('')
  const [isPlanning, setIsPlanning] = useState(false)
  const [services, setServices] = useState<any[]>([])
  const [countdown, setCountdown] = useState(0)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [targetedLoadRate, setTargetedLoadRate] = useState(DEFAULT_TARGETED_LOAD_RATE)
  const [targetedLoadUsers, setTargetedLoadUsers] = useState(DEFAULT_TARGETED_LOAD_USERS)
  const isTargetedLoadScenario = selectedDrill?.type === 'TargetedLoad' || selectedDrill?.type === 'TrafficSpike'

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await getServices()
        setServices(response.services || [])
        if (response.services?.length > 0) {
          const first = response.services[0]
          setTargetService(`${first.namespace}/${first.name}`)
        }
      } catch (err) {
        console.error('Failed to fetch services', err)
      }
    }
    fetchServices()
  }, [])

  const handlePlan = async () => {
    if (!selectedDrill) return
    setPlanError(null)
    setIsPlanning(true)
    const plannedConfig =
      (selectedDrill.type === 'TargetedLoad' || selectedDrill.type === 'TrafficSpike')
        ? {
            ...selectedDrill.baseConfig,
            rps: targetedLoadRate,
            rate: targetedLoadRate,
            users: targetedLoadUsers,
          }
        : selectedDrill.baseConfig
    try {
      const plan = await planDrill({
        type: selectedDrill.type,
        target: targetService,
        config: plannedConfig,
      })
      onDrillSelect(plan)
      setSelectedDrill(null)
      setCountdown(0)
      setIsConfirmed(false)
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

  const comboItems = services.map((s) => ({
    label: `${s.namespace}/${s.name}`,
    value: `${s.namespace}/${s.name}`,
  }))
  const targetedLoadProfileInvalid =
    isTargetedLoadScenario && (targetedLoadRate < 1 || targetedLoadUsers < 1)

  const handleSelectDrill = (drill: (typeof DRILLS)[number]) => {
    setSelectedDrill(drill)
    setPlanError(null)
    setCountdown(0)
    setIsConfirmed(false)

    if (drill.type === 'TargetedLoad' || drill.type === 'TrafficSpike') {
      const presetRate = Number((drill.baseConfig as { rps?: number }).rps ?? 100)
      const presetUsers = Number((drill.baseConfig as { users?: number }).users ?? DEFAULT_TARGETED_LOAD_USERS)
      setTargetedLoadRate(presetRate > 0 ? presetRate : DEFAULT_TARGETED_LOAD_RATE)
      setTargetedLoadUsers(presetUsers > 0 ? presetUsers : DEFAULT_TARGETED_LOAD_USERS)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {DRILLS.map((drill) => (
        <Card
          key={drill.id}
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
          isOpen={!!selectedDrill}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedDrill(null)
              setCountdown(0)
              setIsConfirmed(false)
              setPlanError(null)
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
                  Execution planning for chaos sequences
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
                  onSelectionChange={(val) => setTargetService(val as string)}
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
                  className={cn(
                    controlInputBaseClass,
                    'flex items-center bg-[var(--surface-soft)]'
                  )}
                >
                  {selectedDrill?.baseConfig.observeTokens} Seconds
                </div>
              </div>
            </div>

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

            {targetedLoadProfileInvalid && (
              <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-[var(--radius-md)] text-xs text-amber-700 shadow-sm">
                <AlertTriangle className="shrink-0 w-5 h-5 text-amber-500" />
                <div className="space-y-1">
                  <p className="font-bold uppercase tracking-wider text-amber-600">
                    Invalid Load Profile
                  </p>
                  <p className="leading-relaxed font-medium opacity-90">
                    `RATE` and `USERS` must both be greater than 0 for Targeted Load drills.
                  </p>
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
                      This sequence will simulate a failure in the analysis engine.
                    </p>
                  </div>
                }
              />
            </div>

            <div className="flex gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-[var(--radius-md)] text-xs text-rose-600 shadow-sm">
              <AlertTriangle className="shrink-0 w-5 h-5 text-rose-500" />
              <div className="space-y-1">
                <p className="font-bold uppercase tracking-wider text-rose-500">
                  Simulation Guardrail
                </p>
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
              }}
              className={secondaryButtonClass}
            >
              Cancel
            </Button>
            <Button
              onPress={handlePlan}
              isDisabled={
                isPlanning || !isConfirmed || countdown > 0 || Boolean(targetedLoadProfileInvalid)
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
