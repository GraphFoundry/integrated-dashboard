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
                description="Run safe drills and watch system impact live. Orchestrate chaos sequences with precision and automated guardrails."
                icon={PlayCircle}
                actions={
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className="px-3 py-1 flex gap-2 items-center bg-[var(--surface-soft)] border-[var(--border)] shadow-sm h-10">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Guardrails Active</span>
                        </Badge>
                    </div>
                }
            />

            <Tabs aria-label="Drill Director Control Panel" className="w-full">
                <TabsList className="rounded-[var(--radius-md)] overflow-hidden mb-8 border border-[var(--border)] shadow-sm max-w-fit bg-[var(--surface-soft)]">
                    <Tab id="director" className={({ isSelected }) => cn(
                        "min-w-[160px] flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold transition-all outline-none cursor-pointer",
                        isSelected ? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    )}>
                        <LayoutDashboard className="w-4 h-4" /> Control Room
                    </Tab>
                    <Tab id="history" className={({ isSelected }) => cn(
                        "min-w-[160px] flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold transition-all outline-none cursor-pointer",
                        isSelected ? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    )}>
                        <History className="w-4 h-4" /> Run History
                    </Tab>
                </TabsList>

                <TabPanel id="director">
                    {activeRun ? (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-in fade-in duration-500">
                            <div className="xl:col-span-4">
                                <RunPanel run={activeRun} onUpdate={setActiveRun} onClear={() => setActiveRun(null)} />
                            </div>
                            <div className="xl:col-span-8 space-y-6">
                                <LiveMetricsStrip run={activeRun} />
                                <TimelineReplay run={activeRun} />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div className="flex items-center gap-3 px-1">
                                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                    <LayoutDashboard className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Scenario Catalog</h3>
                                    <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Select a drill sequence to engage</p>
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
                                                <td className={cn(tableCellClass, "font-mono text-xs font-bold text-sky-500")}>
                                                    {run.id.split('-')[0].toUpperCase()}
                                                </td>
                                                <td className={cn(tableCellClass, "font-semibold")}>
                                                    {run.type}
                                                </td>
                                                <td className={tableCellClass}>
                                                    <code className="text-[10px] bg-[var(--surface-solid)] px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text-secondary)] font-bold">
                                                        {run.target}
                                                    </code>
                                                </td>
                                                <td className={tableCellClass}>
                                                    <Badge variant="outline" className="text-[10px] font-bold uppercase bg-[var(--surface-soft)]">
                                                        {run.status}
                                                    </Badge>
                                                </td>
                                                <td className={tableCellClass}>
                                                    <Badge 
                                                        variant={run.verdict === 'Success' ? 'default' : 'destructive'} 
                                                        className={cn(
                                                            "text-[10px] font-bold uppercase",
                                                            run.verdict === 'Success' && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
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
                                                        className="text-[10px] font-bold uppercase tracking-widest hover:bg-sky-500/10 hover:text-sky-600"
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


