import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { DrillRun } from '@/lib/api/drills'
import { Clock, CheckCircle2, XCircle, History, Play, FastForward, Info } from 'lucide-react'
import { useState } from 'react'
import { Slider } from '@/components/ui/Slider'
import { Button } from '@/components/ui/button'
import { cn, glassSurfaceClass } from '@/components/common/uiClassTokens'

export default function TimelineReplay({ run }: { run: DrillRun }) {
    const steps = run.timeline || []
    const [scrubIndex, setScrubIndex] = useState(steps.length > 0 ? steps.length - 1 : 0)

    if (steps.length === 0) {
        return (
            <Card className="border-[var(--border)] bg-[var(--surface-soft)]/20 border-dashed rounded-[var(--radius-lg)] overflow-hidden">
                <CardContent className="h-48 flex flex-col items-center justify-center text-[var(--text-muted)] space-y-3">
                    <History className="w-8 h-8 opacity-20" />
                    <span className="text-sm font-bold uppercase tracking-widest opacity-50">Awaiting Sequence Initiation...</span>
                </CardContent>
            </Card>
        )
    }

    const currentStep = steps[scrubIndex]

    return (
        <Card className={cn(glassSurfaceClass, "relative overflow-hidden bg-[var(--surface-contrast)]/30 backdrop-blur-xl rounded-[var(--radius-lg)]")}>
            <CardHeader className="pb-6 border-b border-[var(--border)] bg-[var(--surface-soft)]/20 px-6 py-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 shadow-sm">
                            <Clock className="w-5 h-5 text-sky-600" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Sequence Timeline</CardTitle>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Scrub through execution phases</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-[var(--surface-solid)]/50 p-1 rounded-xl border border-[var(--border)]">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"><Play className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-sky-600"><FastForward className="w-3.5 h-3.5" /></Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
                {/* Scrubbing Control */}
                <div className="space-y-6">
                    <Slider
                        label="Timeline Position"
                        min={0}
                        max={steps.length - 1}
                        value={scrubIndex}
                        onChange={(val) => setScrubIndex(Number(val.target.value))}
                        className="px-2"
                    />
                    
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Selected Step Detail */}
                        <div className="lg:col-span-5 p-5 rounded-xl bg-[var(--surface-soft)]/50 border border-[var(--border)] shadow-inner animate-in fade-in duration-500">
                            <div className="flex items-center gap-3 mb-4">
                                <div className={cn(
                                    "p-1.5 rounded-lg border",
                                    currentStep.status === 'Error' ? "bg-rose-500/10 border-rose-500/20 text-rose-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                )}>
                                    {currentStep.status === 'Error' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                </div>
                                <div className="space-y-0.5">
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">{currentStep.phase}</h5>
                                    <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{new Date(currentStep.timestamp).toLocaleTimeString()}</p>
                                </div>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-medium">
                                {currentStep.message}
                            </p>
                        </div>

                        {/* Step History List (Compact) */}
                        <div className="lg:col-span-7 relative pl-6 border-l-2 border-[var(--border)] space-y-4 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                            {steps.map((step, idx) => (
                                <div 
                                    key={idx} 
                                    className={cn(
                                        "relative cursor-pointer transition-all duration-300",
                                        idx === scrubIndex ? "opacity-100 scale-[1.01]" : "opacity-40 hover:opacity-70"
                                    )}
                                    onClick={() => setScrubIndex(idx)}
                                >
                                    <span className={cn(
                                        "absolute -left-[33px] flex items-center justify-center w-4 h-4 rounded-full bg-[var(--surface-solid)] border transition-all",
                                        idx === scrubIndex ? "border-sky-500 shadow-sm scale-110" : "border-[var(--border)]"
                                    )}>
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            idx === scrubIndex ? "bg-sky-500" : "bg-[var(--border)]"
                                        )} />
                                    </span>
                                    <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[10px] font-bold uppercase tracking-tight text-[var(--text-primary)]">{step.phase}</span>
                                        <span className="text-[9px] font-bold text-[var(--text-muted)] font-mono opacity-60">{new Date(step.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-muted)] font-medium truncate">{step.message}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-sky-500/5 border border-sky-500/10 rounded-xl flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-sky-600 shadow-sm">
                    <Info className="w-4 h-4 shrink-0" />
                    Snapshots are persisted in the Immutable Evidence Pack for historical auditability.
                </div>
            </CardContent>
        </Card>
    )
}


