import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, FileText, Download, RotateCcw, Activity, ShieldCheck, ChevronRight } from 'lucide-react'
import { type DrillRun, runDrill, abortDrillRun, getDrillRun } from '@/lib/api/drills'
import { glassPanelClass, cn } from '@/components/common/uiClassTokens'

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
        <Card className={cn(glassPanelClass, "h-full shadow-xl relative overflow-hidden border-primary/20 flex flex-col")}>
            {isRunning && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-emerald-500 animate-pulse z-20" />}

            <CardHeader className="pb-6 border-b border-[var(--border)] bg-[var(--surface-soft)]/30">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Activity className="w-4 h-4 text-[var(--color-emerald-400)]" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Active Sequence</span>
                        </div>
                        <CardTitle className="text-2xl font-black tracking-tight text-[var(--text-primary)]">{run.type}</CardTitle>
                    </div>
                    <Badge variant={run.status === 'Planned' ? 'secondary' : run.status.includes('Fail') ? 'destructive' : 'default'} className="px-3 py-1 shadow-neon-sm">
                        {run.status}
                    </Badge>
                </div>
                <CardDescription className="text-sm flex items-center gap-2 bg-[var(--surface-contrast)]/50 p-2 rounded-lg border border-[var(--border)] mt-4">
                    <span className="text-[var(--text-muted)] font-medium">Target:</span>
                    <code className="text-[var(--color-emerald-300)] font-mono text-xs font-bold">{run.target}</code>
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-8 py-8 flex-1">
                {/* Stepper */}
                <div className="relative">
                    <div className="absolute top-4 left-0 w-full h-0.5 bg-[var(--border)] z-0" />
                    <div className="flex justify-between relative z-10">
                        {STEPS.map((step, idx) => {
                            const isPast = run.timeline?.some(s => s.phase === step.id)
                            const isCurrent = currentPhase === step.id
                            return (
                                <div key={step.id} className="flex flex-col items-center gap-2">
                                    <div className={cn(
                                        "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500 bg-[var(--surface-solid)]",
                                        isPast ? "border-[var(--color-emerald-500)] text-[var(--color-emerald-500)]" : "border-[var(--border)] text-[var(--text-muted)]",
                                        isCurrent && "border-[var(--color-sky-400)] text-[var(--color-sky-400)] scale-110 shadow-neon-sm"
                                    )}>
                                        {isPast && !isCurrent ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                                    </div>
                                    <span className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider",
                                        isCurrent ? "text-[var(--color-sky-400)]" : isPast ? "text-[var(--color-emerald-500)]" : "text-[var(--text-muted)]"
                                    )}>{step.label}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {run.status === 'Planned' && (
                    <div className="bg-sky-500/5 text-sky-300 p-5 rounded-2xl border border-sky-500/20 text-sm shadow-inner animate-in fade-in slide-in-from-bottom-2">
                        <h4 className="font-bold mb-3 flex items-center gap-2 text-sky-400">
                            <ShieldCheck className="w-5 h-5" /> Ready for Execution
                        </h4>
                        <ul className="space-y-3 opacity-90">
                            <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-sky-500" /> Action: {run.type === 'ServiceShutdown' ? 'Kill all pods' : 'Modify resource limits'}</li>
                            <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-sky-500" /> Reversible: Yes (Automatic Rollback)</li>
                            <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-sky-500" /> Observe Window: {run.config.observeTokens ?? 15} seconds</li>
                        </ul>
                    </div>
                )}

                {isRunning && (
                    <div className="flex flex-col items-center justify-center p-10 space-y-6 bg-[var(--surface-soft)]/20 rounded-3xl border border-[var(--border)] border-dashed animate-in zoom-in duration-500">
                        <div className="relative">
                            <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full animate-pulse" />
                            <Loader2 className="w-16 h-12 text-[var(--color-emerald-400)] animate-spin relative z-10" />
                        </div>
                        <div className="text-center space-y-2">
                            <span className="text-xl font-black text-[var(--text-primary)] block tracking-tight">Sequence Engaged</span>
                            <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-widest">Orchestrating state changes...</span>
                        </div>
                    </div>
                )}

                {isCompleted && (
                    <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
                        <div className={cn(
                            "p-5 rounded-2xl border text-sm flex items-start gap-4 shadow-xl",
                            run.verdict === 'Success' ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-rose-500/5 border-rose-500/20 text-rose-400"
                        )}>
                            <div className="p-2 rounded-full bg-current/10">
                                {run.verdict === 'Success' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                            </div>
                            <div>
                                <h4 className="font-black text-lg uppercase tracking-tight mb-1">Drill {run.verdict}</h4>
                                <p className="opacity-80 leading-relaxed font-medium">The chaos sequence has finished. System baseline state has been verified and fully restored.</p>
                            </div>
                        </div>

                        <div className="bg-[var(--surface-soft)] p-6 rounded-2xl border border-[var(--border)] space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" /> Immutable Evidence Pack
                            </h4>
                            <div className="grid grid-cols-2 gap-3 text-[11px]">
                                <div className="bg-[var(--surface-solid)] p-3 rounded-xl border border-[var(--border)]">
                                    <span className="block text-[var(--text-muted)] mb-1 font-bold uppercase tracking-tighter">Snapshot ID</span>
                                    <span className="font-mono font-black text-sm text-[var(--text-primary)]">{run.id.split('-')[0]}</span>
                                </div>
                                <div className="bg-[var(--surface-solid)] p-3 rounded-xl border border-[var(--border)]">
                                    <span className="block text-[var(--text-muted)] mb-1 font-bold uppercase tracking-tighter">Drill Duration</span>
                                    <span className="font-black text-sm text-[var(--text-primary)]">{(run.config.observeTokens ?? 15) + 5}s</span>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" className="w-full text-[10px] h-10 font-bold uppercase tracking-widest">
                                <Download className="w-3.5 h-3.5 mr-2" /> Download Report (JSON)
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-6 pb-8 border-t border-[var(--border)] bg-[var(--surface-soft)]/20">
                {run.status === 'Planned' && (
                    <Button 
                        onPress={handleStart}
                        className="w-full h-14 text-lg font-black uppercase tracking-widest shadow-neon"
                        variant="default"
                    >
                        Initiate Sequence
                    </Button>
                )}

                {isRunning && (
                    <Button 
                        onPress={handleAbort}
                        className="w-full h-14 text-lg font-black uppercase tracking-widest shadow-neon-rose"
                        variant="destructive"
                    >
                        Emergency Rollback
                    </Button>
                )}

                {isCompleted && (
                    <div className="grid grid-cols-2 gap-3 w-full">
                        <Button variant="outline" className="w-full h-12 font-bold" onPress={onClear}>
                            Exit Room
                        </Button>
                        <Button variant="secondary" className="w-full h-12 font-bold flex gap-2" onPress={() => onUpdate({ ...run, status: 'Planned', verdict: 'Pending', timeline: [] })}>
                            <RotateCcw className="w-4 h-4" /> Reset
                        </Button>
                    </div>
                )}
            </CardFooter>
        </Card>
    )
}
