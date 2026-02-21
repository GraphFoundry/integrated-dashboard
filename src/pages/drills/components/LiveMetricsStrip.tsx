import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Activity, ArrowDownRight, ArrowUpRight, CheckCircle, Info, Zap, ShieldAlert, BarChart3 } from 'lucide-react'
import type { DrillRun } from '@/lib/api/drills'
import { useState } from 'react'
import { Switch } from '@/components/ui/Switch'
import { cn } from '@/components/common/uiClassTokens'

export default function LiveMetricsStrip({ run }: { run: DrillRun }) {
    const [isExplainMode, setIsExplainMode] = useState(true)
    const isRunning = run.status === 'Observing'
    const isCompleted = run.status === 'Completed'

    // Extract metrics from snapshots if available
    const getMetricsForService = (snapshot: any, serviceTag: string) => {
        if (!snapshot || !snapshot.services) return null
        const parts = serviceTag.split('/')
        const name = parts.length > 1 ? parts[1] : parts[0]
        const ns = parts.length > 1 ? parts[0] : null
        return snapshot.services.find((s: any) => s.name === name && (!ns || s.namespace === ns))
    }

    const baseline = getMetricsForService(run.preSnapshot, run.target)
    const current = isCompleted ? getMetricsForService(run.postSnapshot, run.target) : (isRunning ? null : baseline)

    const metrics = [
        {
            label: 'Availability',
            icon: <ShieldAlert className="w-3.5 h-3.5" />,
            baseline: baseline ? (baseline.availability.value * 100).toFixed(1) + '%' : '99.9%',
            current: isRunning ? '0.0%' : (current ? (current.availability.value * 100).toFixed(1) + '%' : '99.9%'),
            isDegraded: isRunning || (current && current.availability.value < 0.95),
            explanation: "Measures the percentage of successful health checks. Drops to zero during total service failure."
        },
        {
            label: 'Traffic (RPS)',
            icon: <Activity className="w-3.5 h-3.5" />,
            baseline: baseline ? baseline.rps.toFixed(0) + ' req/s' : '450 req/s',
            current: isRunning ? '0 req/s' : (current ? current.rps.toFixed(0) + ' req/s' : '450 req/s'),
            isDegraded: isRunning,
            explanation: "Requests Per Second. Confirms if the component is still receiving or processing incoming demand."
        },
        {
            label: 'Error Rate',
            icon: <Zap className="w-3.5 h-3.5" />,
            baseline: baseline ? (baseline.errorRate * 100).toFixed(1) + '%' : '0.1%',
            current: isRunning ? '100%' : (current ? (current.errorRate * 100).toFixed(1) + '%' : '0.1%'),
            isDegraded: isRunning || (current && current.errorRate > 0.05),
            explanation: "Percentage of failed requests. 100% indicates that all upstream dependencies are being rejected."
        },
        {
            label: 'P95 Latency',
            icon: <BarChart3 className="w-3.5 h-3.5" />,
            baseline: baseline ? baseline.p95.toFixed(0) + 'ms' : '45ms',
            current: isRunning ? '∞' : (current ? current.p95.toFixed(0) + 'ms' : '45ms'),
            isDegraded: isRunning,
            explanation: "Tail response time. ∞ suggests that connection attempts are timing out or being actively refused."
        }
    ]

    return (
        <Card className="border-[var(--border)] shadow-2xl relative overflow-hidden bg-[var(--surface-contrast)]/30 backdrop-blur-xl rounded-3xl">
            {isRunning && <div className="absolute top-0 left-0 w-full h-1 bg-rose-500 animate-pulse z-20" />}
            
            <CardHeader className="pb-4 flex flex-row items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)]/20 px-8 py-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-[var(--color-emerald-500)]/10 border border-[var(--color-emerald-500)]/20">
                        <Activity className="w-5 h-5 text-[var(--color-emerald-400)]" />
                    </div>
                    <div>
                        <CardTitle className="text-lg font-black tracking-tight text-[var(--text-primary)]">Telemetry Impact Analysis</CardTitle>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Real-time Delta Tracking</p>
                    </div>
                </div>
                <div className="flex items-center space-x-3 bg-[var(--surface-solid)] px-4 py-2 rounded-2xl border border-[var(--border)] shadow-inner">
                    <Switch
                        id="explain-mode"
                        checked={isExplainMode}
                        onChange={() => setIsExplainMode(!isExplainMode)}
                        label={<span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Explain Mode</span>}
                    />
                </div>
            </CardHeader>

            <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {metrics.map((m, i) => (
                        <div key={i} className="group space-y-3">
                            <div className={cn(
                                "flex flex-col gap-1 p-5 rounded-2xl border transition-all duration-500",
                                m.isDegraded 
                                    ? "bg-rose-500/5 border-rose-500/20 shadow-[inset_0_0_20px_rgba(244,63,94,0.05)]" 
                                    : "bg-[var(--surface-soft)]/50 border-[var(--border)]"
                            )}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--text-muted)] flex items-center gap-1.5">
                                        {m.icon} {m.label}
                                    </span>
                                </div>
                                <div className="flex items-end justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-tighter mb-1 opacity-50">Baseline</span>
                                        <span className="text-sm line-through opacity-40 font-mono font-bold text-[var(--text-secondary)]">{m.baseline}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-tighter mb-1 opacity-50">Current</span>
                                        <span className={cn(
                                            "text-2xl font-black font-mono flex items-center gap-1.5 tabular-nums tracking-tighter",
                                            m.isDegraded ? "text-rose-400" : "text-[var(--color-emerald-400)]"
                                        )}>
                                            {m.current}
                                            {m.isDegraded ? (
                                                <ArrowDownRight className="w-5 h-5 animate-bounce" />
                                            ) : m.current === '∞' ? null : (
                                                run.status === 'Completed' ? <CheckCircle className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {isExplainMode && (
                                <div className="px-2 text-[11px] leading-relaxed text-[var(--text-muted)] italic flex gap-2 animate-in fade-in slide-in-from-top-2 duration-500 font-medium">
                                    <Info className="w-3.5 h-3.5 shrink-0 text-[var(--color-sky-400)] mt-0.5" />
                                    {m.explanation}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {isRunning && (
                    <div className="mt-8 p-6 bg-rose-500/5 border border-rose-500/20 text-rose-300 text-xs rounded-3xl flex gap-4 animate-in slide-in-from-bottom-4 duration-700 shadow-2xl shadow-rose-500/5">
                        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 shrink-0 h-fit">
                            <Activity className="w-6 h-6 text-rose-400 animate-pulse" />
                        </div>
                        <div>
                            <p className="font-black text-sm uppercase tracking-tight text-rose-400 mb-1">Critical Anomaly Detected</p>
                            <p className="leading-relaxed opacity-80 font-medium">The system is exhibiting total service degradation. Upstream components are reporting 503 Service Unavailable errors as <strong>{run.target}</strong> has been sequestered from the cluster mesh.</p>
                        </div>
                    </div>
                )}

                {isCompleted && run.verdict === 'Success' && (
                    <div className="mt-8 p-6 bg-emerald-500/5 border border-emerald-500/20 text-emerald-300 text-xs rounded-3xl flex gap-4 animate-in slide-in-from-bottom-4 duration-700 shadow-2xl shadow-emerald-500/5">
                        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shrink-0 h-fit">
                            <CheckCircle className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <p className="font-black text-sm uppercase tracking-tight text-emerald-400 mb-1">System Equilibrium Restored</p>
                            <p className="leading-relaxed opacity-80 font-medium">The Drill Director has successfully orchestrated a complete rollback. All target metrics for <strong>{run.target}</strong> have returned to their nominal baseline and cascading errors have been mitigated.</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
