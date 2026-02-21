import { useState, useEffect } from 'react'
import DrillCatalog from './components/DrillCatalog'
import RunPanel from './components/RunPanel'
import LiveMetricsStrip from './components/LiveMetricsStrip'
import TimelineReplay from './components/TimelineReplay'
import type { DrillRun } from '@/lib/api/drills'
import { listDrillHistory } from '@/lib/api/drills'
import { History, PlayCircle, ShieldCheck, LayoutDashboard } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, Tab, TabPanel } from '@/components/ui/Tabs'
import PageHeader from '@/components/layout/PageHeader'
import { pageContainerClass, tableShellClass, tableHeadRowClass, tableHeaderCellClass, tableBodyRowClass, tableCellClass, cn } from '@/components/common/uiClassTokens'

export default function DrillDirector() {
    const [activeRun, setActiveRun] = useState<DrillRun | null>(null)
    const [history, setHistory] = useState<DrillRun[]>([])

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const data = await listDrillHistory()
                setHistory(data)
            } catch (err) {
                console.error(err)
            }
        }
        fetchHistory()
    }, [activeRun])

    return (
        <div className={pageContainerClass}>
            <PageHeader
                title="Drill Director"
                description="Safely plan, execute, and observe chaos engineering drills with real-time impact analysis."
                icon={PlayCircle}
                actions={
                    <Badge variant="outline" className="px-4 py-1.5 flex gap-2 items-center bg-[var(--surface-soft)] border-[var(--border)] shadow-sm">
                        <ShieldCheck className="w-4 h-4 text-[var(--color-emerald-400)]" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Guardrails Active</span>
                    </Badge>
                }
            />

            <Tabs aria-label="Drill Director Control Panel" className="w-full">
                <TabsList className="rounded-xl overflow-hidden mb-8 border border-[var(--border)] shadow-lg max-w-fit">
                    <Tab id="director" className="min-w-[180px] flex items-center justify-center gap-2">
                        <PlayCircle className="w-4 h-4" /> Control Room
                    </Tab>
                    <Tab id="history" className="min-w-[180px] flex items-center justify-center gap-2">
                        <History className="w-4 h-4" /> Run History
                    </Tab>
                </TabsList>

                <TabPanel id="director">
                    {activeRun ? (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-in slide-in-from-bottom-6 duration-500">
                            <div className="xl:col-span-1">
                                <RunPanel run={activeRun} onUpdate={setActiveRun} onClear={() => setActiveRun(null)} />
                            </div>
                            <div className="xl:col-span-2 space-y-8">
                                <LiveMetricsStrip run={activeRun} />
                                <TimelineReplay run={activeRun} />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-3 px-2">
                                <div className="p-2 rounded-lg bg-[var(--color-emerald-500)]/10">
                                    <LayoutDashboard className="w-5 h-5 text-[var(--color-emerald-400)]" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black tracking-tight text-[var(--text-primary)] uppercase">Scenario Catalog</h3>
                                    <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Select a drill sequence to engage</p>
                                </div>
                            </div>
                            <DrillCatalog onDrillSelect={setActiveRun} />
                        </div>
                    )}
                </TabPanel>

                <TabPanel id="history">
                    <div className={tableShellClass}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className={tableHeadRowClass}>
                                    <tr>
                                        <th className={tableHeaderCellClass}>Sequence ID</th>
                                        <th className={tableHeaderCellClass}>Drill Type</th>
                                        <th className={tableHeaderCellClass}>Target Component</th>
                                        <th className={tableHeaderCellClass}>Status</th>
                                        <th className={tableHeaderCellClass}>Verdict</th>
                                        <th className={tableHeaderCellClass}>Engagement Date</th>
                                        <th className={cn(tableHeaderCellClass, "text-right")}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {history.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-12 text-center text-[var(--text-muted)] italic bg-[var(--surface-soft)]/20">
                                                <div className="flex flex-col items-center gap-2 opacity-50">
                                                    <History className="w-8 h-8" />
                                                    <span className="font-bold uppercase tracking-widest text-xs">No historical drills found</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        history.map((run) => (
                                            <tr key={run.id} className={tableBodyRowClass}>
                                                <td className={cn(tableCellClass, "font-mono text-xs font-bold text-[var(--color-sky-400)]")}>
                                                    {run.id.split('-')[0].toUpperCase()}
                                                </td>
                                                <td className={cn(tableCellClass, "font-black tracking-tight")}>
                                                    {run.type}
                                                </td>
                                                <td className={tableCellClass}>
                                                    <code className="text-[10px] bg-[var(--surface-solid)] px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text-secondary)] font-bold">
                                                        {run.target}
                                                    </code>
                                                </td>
                                                <td className={tableCellClass}>
                                                    <Badge variant="outline" className="text-[10px] font-black uppercase bg-[var(--surface-soft)]">
                                                        {run.status}
                                                    </Badge>
                                                </td>
                                                <td className={tableCellClass}>
                                                    <Badge 
                                                        variant={run.verdict === 'Success' ? 'default' : 'destructive'} 
                                                        className={cn(
                                                            "text-[10px] font-black uppercase",
                                                            run.verdict === 'Success' && "bg-[var(--color-emerald-500)]/20 text-[var(--color-emerald-400)] border-[var(--color-emerald-500)]/30"
                                                        )}
                                                    >
                                                        {run.verdict}
                                                    </Badge>
                                                </td>
                                                <td className={cn(tableCellClass, "text-xs font-medium text-[var(--text-muted)]")}>
                                                    {new Date(run.startTime).toLocaleString()}
                                                </td>
                                                <td className={cn(tableCellClass, "text-right")}>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onPress={() => setActiveRun(run)}
                                                        className="text-[10px] font-black uppercase tracking-widest hover:bg-[var(--color-sky-500)]/10 hover:text-[var(--color-sky-400)]"
                                                    >
                                                        Review Pack
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </TabPanel>
            </Tabs>
        </div>
    )
}
