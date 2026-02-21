import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, FileText, Download, RotateCcw, Activity, ShieldCheck, ChevronRight } from 'lucide-react'
import { type DrillRun, runDrill, abortDrillRun, getDrillRun } from '@/lib/api/drills'
import { glassPanelClass, cn, primaryButtonClass, secondaryButtonClass } from '@/components/common/uiClassTokens'

const STEPS = [
    { id: 'Validate', label: 'Validate' },
    { id: 'Warmup', label: 'Snapshot' },
    { id: 'Action', label: 'Execute' },
    { id: 'Observation', label: 'Observe' },
    { id: 'Recovery', label: 'Recover' },
    { id: 'Finalize', label: 'Finalize' }
]

export default function RunPanel({
    run,
    onUpdate,
    onClear
}: {
    run: DrillRun
    onUpdate: (run: DrillRun) => void
    onClear: () => void
}) {
    const [isRunning, setIsRunning] = useState(run.status === 'Running' || run.status === 'Observing' || run.status === 'Recovering')

    useEffect(() => {
        let interval: number
        if (isRunning) {
            interval = window.setInterval(async () => {
                try {
                    const updated = await getDrillRun(run.id)
                    onUpdate(updated)
                    if (['Completed', 'Aborted', 'Failed'].includes(updated.status)) {
                        setIsRunning(false)
                    }
                } catch (e) {
                    console.error('Failed to poll run', e)
                }
            }, 2000)
        }
        return () => clearInterval(interval)
    }, [run.id, isRunning, onUpdate])

    const handleStart = async () => {
        try {
            await runDrill(run.id)
            setIsRunning(true)
            onUpdate({ ...run, status: 'Running' })
        } catch (e) {
            console.error(e)
        }
    }

    const handleAbort = async () => {
        try {
            await abortDrillRun(run.id)
        } catch (e) {
            console.error(e)
        }
    }

    const isCompleted = ['Completed', 'Aborted', 'Failed'].includes(run.status)
    const currentPhase = run.timeline?.[run.timeline.length - 1]?.phase || 'Pending'

    return (
        <Card className={cn(glassPanelClass, "h-full relative overflow-hidden flex flex-col")}>
            {isRunning && <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 animate-pulse z-20" />}

            <CardHeader className="pb-6 border-b border-[var(--border)] bg-[var(--surface-soft)]/30 px-6 pt-6">
                <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-1">
                            <Activity className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Active Sequence</span>
                        </div>
                        <CardTitle className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{run.type}</CardTitle>
                    </div>
                    <Badge variant={run.status === 'Planned' ? 'secondary' : run.status.includes('Fail') ? 'destructive' : 'default'} className="px-2 py-0.5 text-[10px] font-bold uppercase">
                        {run.status}
                    </Badge>
                </div>
                <div className="flex items-center justify-between bg-[var(--surface-solid)] p-3 rounded-xl border border-[var(--border)]">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Target</span>
                        <code className="text-emerald-600 font-mono text-xs font-bold">{run.target}</code>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Run ID</span>
                        <span className="text-xs font-bold text-[var(--text-secondary)] font-mono">#{run.id.split('-')[0].toUpperCase()}</span>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-8 py-8 px-6 flex-1">
                {/* Stepper */}
                <div className="relative px-2">
                    <div className="absolute top-4 left-6 right-6 h-0.5 bg-[var(--border)] z-0" />
                    <div className="flex justify-between relative z-10">
                        {STEPS.map((step, idx) => {
                            const isPast = run.timeline?.some(s => s.phase === step.id)
                            const isCurrent = currentPhase === step.id
                            return (
                                <div key={step.id} className="flex flex-col items-center gap-2">
                                    <div className={cn(
                                        "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 bg-[var(--surface-solid)]",
                                        isPast ? "border-emerald-500 text-emerald-500" : "border-[var(--border)] text-[var(--text-muted)]",
                                        isCurrent && "border-sky-500 text-sky-500 scale-110 shadow-sm"
                                    )}>
                                        {isPast && !isCurrent ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                                    </div>
                                    <span className={cn(
                                        "text-[9px] font-bold uppercase tracking-wider",
                                        isCurrent ? "text-sky-600" : isPast ? "text-emerald-600" : "text-[var(--text-muted)]"
                                    )}>{step.label}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {run.status === 'Planned' && (
                    <div className="bg-sky-500/5 text-sky-700 p-5 rounded-xl border border-sky-500/10 text-sm animate-in fade-in duration-500">
                        <h4 className="font-bold text-xs uppercase tracking-wider mb-3 flex items-center gap-2 text-sky-600">
                            <ShieldCheck className="w-4 h-4" /> Readiness Checklist
                        </h4>
                        <ul className="space-y-2.5">
                            <li className="flex items-center gap-2 text-xs font-medium"><ChevronRight className="w-3 h-3 text-sky-500" /> Action: {run.type === 'ServiceShutdown' ? 'Service Termination' : 'Resource Modification'}</li>
                            <li className="flex items-center gap-2 text-xs font-medium"><ChevronRight className="w-3 h-3 text-sky-500" /> Automatic Rollback: Verified</li>
                            <li className="flex items-center gap-2 text-xs font-medium"><ChevronRight className="w-3 h-3 text-sky-500" /> Observation: {run.config.observeTokens ?? 15}s window</li>
                        </ul>
                    </div>
                )}

                {isRunning && (
                    <div className="flex flex-col items-center justify-center p-8 space-y-4 bg-[var(--surface-soft)]/20 rounded-2xl border border-[var(--border)] border-dashed animate-in zoom-in duration-500">
                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        <div className="text-center">
                            <span className="text-sm font-bold text-[var(--text-primary)] block uppercase tracking-wider">Sequence Engaged</span>
                            <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-widest">Applying state changes...</span>
                        </div>
                    </div>
                )}

                {isCompleted && (
                    <div className="space-y-6 animate-in fade-in duration-500">
                        <div className={cn(
                            "p-5 rounded-xl border text-sm flex items-start gap-4 shadow-sm",
                            run.verdict === 'Success' ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-700" : "bg-rose-500/5 border-rose-500/10 text-rose-700"
                        )}>
                            <div className={cn(
                                "p-2 rounded-lg",
                                run.verdict === 'Success' ? "bg-emerald-500/10" : "bg-rose-500/10"
                            )}>
                                {run.verdict === 'Success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                            </div>
                            <div>
                                <h4 className="font-bold text-base uppercase tracking-tight mb-1">Sequence {run.verdict}</h4>
                                <p className="opacity-80 leading-relaxed font-medium text-xs">The sequence has concluded. System baseline state has been verified and fully restored.</p>
                            </div>
                        </div>

                        <div className="bg-[var(--surface-soft)]/50 p-5 rounded-xl border border-[var(--border)] space-y-4">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" /> Evidence Pack
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[var(--surface-solid)] p-3 rounded-lg border border-[var(--border)]">
                                    <span className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Duration</span>
                                    <span className="font-bold text-sm text-[var(--text-primary)]">{(run.config.observeTokens ?? 15) + 5}s</span>
                                </div>
                                <div className="bg-[var(--surface-solid)] p-3 rounded-lg border border-[var(--border)]">
                                    <span className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Status</span>
                                    <span className="font-bold text-sm text-emerald-600 uppercase">Archived</span>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" className="w-full text-[10px] h-10 rounded-lg font-bold uppercase tracking-wider bg-[var(--surface-solid)]">
                                <Download className="w-3.5 h-3.5 mr-2" /> Download Report
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3 p-6 border-t border-[var(--border)] bg-[var(--surface-soft)]/20">
                {run.status === 'Planned' && (
                    <Button 
                        onPress={handleStart}
                        className={cn(primaryButtonClass, "w-full h-12 uppercase tracking-widest text-xs")}
                    >
                        Initiate Sequence
                    </Button>
                )}

                {isRunning && (
                    <Button 
                        onPress={handleAbort}
                        className="w-full h-12 text-xs font-bold uppercase tracking-widest rounded-lg border border-rose-200 bg-rose-500 text-white hover:bg-rose-600"
                    >
                        Emergency Rollback
                    </Button>
                )}

                {isCompleted && (
                    <div className="grid grid-cols-2 gap-3 w-full">
                        <Button variant="outline" className={secondaryButtonClass} onPress={onClear}>
                            Exit Room
                        </Button>
                        <Button variant="secondary" className={cn(secondaryButtonClass, "flex gap-2")} onPress={() => onUpdate({ ...run, status: 'Planned', verdict: 'Pending', timeline: [] })}>
                            <RotateCcw className="w-4 h-4" /> Reset
                        </Button>
                    </div>
                )}
            </CardFooter>
        </Card>
    )
}


