import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import {
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import { AlertTriangle, Activity, Network, Zap, ArrowRight, ShieldAlert, Check, Info } from 'lucide-react'
import { planDrill, type DrillRun } from '@/lib/api/drills'
import { glassInteractiveCardClass, cn, controlLabelClass } from '@/components/common/uiClassTokens'
import { predictiveApi } from '@/lib/predictiveApiClient'

const DRILLS = [
    {
        type: 'ServiceShutdown',
        title: 'Service Shutdown',
        description: 'Instantly scales down a service to 0 replicas to test failure resilience and failover logic.',
        icon: <AlertTriangle className="w-5 h-5 text-rose-400" />,
        risk: 'High',
        baseConfig: { replicas: 0, observeTokens: 30 },
        tone: 'rose'
    },
    {
        type: 'ScaleStress',
        title: 'Scale Stress',
        description: 'Changes replica counts to simulate sudden traffic absorption or resource starvation.',
        icon: <Activity className="w-5 h-5 text-sky-400" />,
        risk: 'Medium',
        baseConfig: { replicas: 3, observeTokens: 20 },
        tone: 'sky'
    },
    {
        type: 'NetworkCut',
        title: 'Network Cut',
        description: 'Simulates a severed connection between two dependent services via NetworkPolicy.',
        icon: <Network className="w-5 h-5 text-amber-400" />,
        risk: 'High',
        baseConfig: { observeTokens: 25 },
        tone: 'amber'
    },
    {
        type: 'TargetedLoad',
        title: 'Targeted Load',
        description: 'Generates artificial traffic spikes against a specific component to observe saturation.',
        icon: <Zap className="w-5 h-5 text-emerald-400" />,
        risk: 'Low',
        baseConfig: { rps: 100, observeTokens: 15 },
        tone: 'emerald'
    }
]

export default function DrillCatalog({ onDrillSelect }: { onDrillSelect: (run: DrillRun) => void }) {
    const [selectedDrill, setSelectedDrill] = useState<typeof DRILLS[0] | null>(null)
    const [targetService, setTargetService] = useState('')
    const [isPlanning, setIsPlanning] = useState(false)
    const [services, setServices] = useState<any[]>([])
    const [countdown, setCountdown] = useState(0)
    const [isConfirmed, setIsConfirmed] = useState(false)

    useEffect(() => {
        const fetchServices = async () => {
            try {
                const response = await predictiveApi.get('/services')
                setServices(response.data.services || [])
                if (response.data.services?.length > 0) {
                    const first = response.data.services[0]
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
        setIsPlanning(true)
        try {
            const plan = await planDrill({
                type: selectedDrill.type,
                target: targetService,
                config: selectedDrill.baseConfig
            })
            onDrillSelect(plan)
        } catch (err) {
            console.error(err)
            onDrillSelect({
                id: 'draft-' + Math.random().toString(36).substr(2, 9),
                type: selectedDrill.type,
                target: targetService,
                status: 'Planned',
                startTime: new Date().toISOString(),
                config: selectedDrill.baseConfig,
                verdict: 'Pending',
                createdAt: new Date().toISOString(),
                timeline: []
            })
        } finally {
            setIsPlanning(false)
            setSelectedDrill(null)
            setCountdown(0)
            setIsConfirmed(false)
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

    const comboItems = services.map(s => ({
        label: `${s.namespace}/${s.name}`,
        value: `${s.namespace}/${s.name}`
    }))

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {DRILLS.map((drill) => (
                <Card
                    key={drill.type}
                    className={cn(
                        glassInteractiveCardClass,
                        "cursor-pointer group flex flex-col justify-between border-opacity-50 transition-all duration-300"
                    )}
                    onClick={() => setSelectedDrill(drill)}
                >
                    <div className="flex flex-col h-full">
                        <CardHeader className="flex flex-row items-start justify-between pb-4 space-y-0 px-0 pt-0">
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "p-3 rounded-xl border shadow-sm transition-transform duration-300 group-hover:scale-110",
                                    drill.tone === 'rose' && "bg-rose-500/10 border-rose-500/20",
                                    drill.tone === 'sky' && "bg-sky-500/10 border-sky-500/20",
                                    drill.tone === 'amber' && "bg-amber-500/10 border-amber-500/20",
                                    drill.tone === 'emerald' && "bg-emerald-500/10 border-emerald-500/20"
                                )}>
                                    {drill.icon}
                                </div>
                                <div>
                                    <CardTitle className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{drill.title}</CardTitle>
                                    <div className="mt-1">
                                        <Badge variant={drill.risk === 'High' ? 'destructive' : drill.risk === 'Medium' ? 'secondary' : 'outline'} className="text-[10px] uppercase px-2 py-0">
                                            {drill.risk} Risk
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="px-0 py-2 flex-1">
                            <CardDescription className="text-sm leading-relaxed text-[var(--text-secondary)]">
                                {drill.description}
                            </CardDescription>
                        </CardContent>
                        <CardFooter className="px-0 pt-6 flex justify-end">
                            <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-emerald-400)] flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                                Configure Sequence <ArrowRight className="w-4 h-4" />
                            </div>
                        </CardFooter>
                    </div>
                </Card>
            ))}

            <DialogTrigger isOpen={!!selectedDrill} onOpenChange={(open) => {
                if (!open) {
                    setSelectedDrill(null)
                    setCountdown(0)
                    setIsConfirmed(false)
                }
            }}>
                <Button className="hidden">Trigger</Button>
                <DialogContent>
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                <ShieldAlert className="w-6 h-6 text-amber-500" />
                            </div>
                            <DialogTitle>Safety Gate: {selectedDrill?.title}</DialogTitle>
                        </div>
                        <DialogDescription>
                            Execution planning for chaos drills requires explicit confirmation of the blast radius.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-6 space-y-6">
                        <div className="space-y-3">
                            <label className={controlLabelClass}>
                                Target Component
                            </label>
                            <Combobox
                                items={comboItems}
                                value={targetService}
                                onSelectionChange={(val) => setTargetService(val as string)}
                                placeholder="Select a service..."
                            />
                            <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                                <Info className="w-3 h-3" /> 
                                This drill will target the deployment in the specified namespace.
                            </p>
                        </div>

                        <div className="bg-[var(--surface-soft)] border border-[var(--border)] p-4 rounded-xl space-y-4">
                            <div className="flex items-start gap-3">
                                <Checkbox
                                    checked={isConfirmed}
                                    onChange={(e) => {
                                        setIsConfirmed(e.target.checked)
                                        if (e.target.checked) startCountdown()
                                    }}
                                    label="I acknowledge that this sequence will simulate a failure in the analysis engine."
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl text-xs text-rose-300 shadow-inner">
                            <AlertTriangle className="shrink-0 w-5 h-5 text-rose-400" />
                            <div>
                                <p className="font-bold mb-1 uppercase tracking-tight text-rose-400">Simulation Guardrail</p>
                                <p className="leading-relaxed opacity-80">The system will automatically restore services after the observation window (30s) or upon manual abort.</p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onPress={() => setSelectedDrill(null)}>Cancel</Button>
                        <Button
                            onPress={handlePlan}
                            isDisabled={isPlanning || !isConfirmed || countdown > 0}
                            className="min-w-[160px] font-bold"
                            variant={isConfirmed ? "success" : "secondary"}
                        >
                            {isPlanning ? 'Planning...' : countdown > 0 ? `Unlocking in ${countdown}s...` : (
                                <span className="flex items-center gap-2">
                                    <Check className="w-4 h-4 font-bold" /> Generate Run Plan
                                </span>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </DialogTrigger>
        </div>
    )
}
