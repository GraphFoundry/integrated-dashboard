import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { DrillRun } from '@/lib/api/drills'
import { Clock, CheckCircle2, XCircle, History, Play, FastForward, Info } from 'lucide-react'
import { useState } from 'react'
import { Slider } from '@/components/ui/Slider'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/common/uiClassTokens'

export default function TimelineReplay({ run }: { run: DrillRun }) {
    const steps = run.timeline || []
    const [scrubIndex, setScrubIndex] = useState(steps.length > 0 ? steps.length - 1 : 0)

    if (steps.length === 0) {
        return (
            <Card className="border-[var(--border)] bg-[var(--surface-soft)]/20 border-dashed">
                <CardContent className="h-48 flex flex-col items-center justify-center text-[var(--text-muted)] space-y-3">
                    <History className="w-8 h-8 opacity-20" />
                    <span className="text-sm font-bold uppercase tracking-widest opacity-50">Awaiting Sequence Engagement...</span>
                </CardContent>
            </Card>
        )
    }

    const currentStep = steps[scrubIndex]

    return (
        <Card className="border-[var(--border)] shadow-xl bg-[var(--surface-contrast)]/30 backdrop-blur-xl rounded-3xl overflow-hidden">
            <CardHeader className="pb-4 border-b border-[var(--border)] bg-[var(--surface-soft)]/20 px-8 py-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-[var(--color-sky-500)]/10 border border-[var(--color-sky-500)]/20">
                            <Clock className="w-5 h-5 text-[var(--color-sky-400)]" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-black tracking-tight text-[var(--text-primary)]">Sequence Timeline Replay</CardTitle>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Scrub through execution phases</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"><Play className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-[var(--color-sky-400)]"><FastForward className="w-4 h-4" /></Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
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
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Selected Step Detail */}
                        <div className="lg:col-span-1 p-5 rounded-2xl bg-[var(--surface-soft)]/50 border border-[var(--border)] shadow-inner animate-in fade-in slide-in-from-left-4 duration-500">
                            <div className="flex items-center gap-2 mb-4">
                                <span className={cn(
                                    "p-1.5 rounded-lg border",
                                    currentStep.status === 'Error' ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                )}>
                                    {currentStep.status === 'Error' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                </span>
                                <div>
                                    <h5 className="text-xs font-black uppercase tracking-widest text-[var(--text-primary)]">{currentStep.phase}</h5>
                                    <p className="text-[10px] font-bold text-[var(--text-muted)]">{new Date(currentStep.timestamp).toLocaleTimeString()}</p>
                                </div>
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-medium">
                                {currentStep.message}
                            </p>
                        </div>

                        {/* Step History List (Compact) */}
                        <div className="lg:col-span-2 relative pl-6 border-l-2 border-[var(--border)] space-y-4 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
                            {steps.map((step, idx) => (
                                <div 
                                    key={idx} 
                                    className={cn(
                                        "relative cursor-pointer transition-all duration-300",
                                        idx === scrubIndex ? "opacity-100 scale-[1.02]" : "opacity-40 hover:opacity-60"
                                    )}
                                    onClick={() => setScrubIndex(idx)}
                                >
                                    <span className={cn(
                                        "absolute -left-[33px] flex items-center justify-center w-4 h-4 rounded-full bg-[var(--surface-solid)] border",
                                        idx === scrubIndex ? "border-[var(--color-sky-400)] shadow-neon-sm scale-125" : "border-[var(--border)]"
                                    )}>
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            idx === scrubIndex ? "bg-[var(--color-sky-400)]" : "bg-[var(--border)]"
                                        )} />
                                    </span>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-tight text-[var(--text-primary)]">{step.phase}</span>
                                        <span className="text-[9px] font-bold text-[var(--text-muted)] font-mono">{new Date(step.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{step.message}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-sky-500/5 border border-sky-500/10 rounded-2xl flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.1em] text-sky-400/80">
                    <Info className="w-4 h-4" />
                    Snapshots are persisted in the Immutable Evidence Pack for historical auditability.
                </div>
            </CardContent>
        </Card>
    )
}
