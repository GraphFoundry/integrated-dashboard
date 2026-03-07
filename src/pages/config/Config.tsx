import { useState } from 'react'
import { Settings2, Save, Edit3, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import {
    cn,
    pageContainerClass,
    tableShellClass,
} from '@/components/common/uiClassTokens'

interface ConfigItem {
    name: string
    value: string
    category: string
    description?: string
}

const INITIAL_CONFIGS: ConfigItem[] = [
    // Graph Service
    { name: 'VITE_GRAPH_CACHE_REFRESH_MS', value: '5000', category: 'Service Graph Engine', description: 'Interval for syncing graph data with telemetry' },
    { name: 'NODE_DISCOVERY_DEPTH', value: '2', category: 'Service Graph Engine', description: 'Maximum depth for automated node discovery' },

    // Scheduler
    { name: 'S_SCH_EXTENDER_DELAY_MS', value: '200', category: 'Scheduler Engine', description: 'Delay in milliseconds for the scheduler extender' },
    { name: 'S_SCH_BACKOFF_COUNT', value: '5', category: 'Scheduler Engine', description: 'Maximum number of retries before backoff' },
    { name: 'S_SCH_SYNC_PERIOD_SEC', value: '30', category: 'Scheduler Engine', description: 'Synchronization period in seconds' },

    // Alert Engine
    { name: 'ALERT_THRESHOLD_CPU', value: '85%', category: 'Alert Engine', description: 'CPU usage threshold for triggering alerts' },
    { name: 'WEBHOOK_REPLAY_WINDOW_SEC', value: '300', category: 'Alert Engine', description: 'Window for replaying webhooks in case of failure' },
    { name: 'ALERT_STALE_TIMEOUT_SEC', value: '600', category: 'Alert Engine', description: 'Time before an unacknowledged alert is marked as stale' },

    // Predictive Engine
    { name: 'PRED_LEARNING_RATE', value: '0.01', category: 'Analysis Engine', description: 'Learning rate for the prediction model' },
    { name: 'PRED_HORIZON_SEC', value: '3600', category: 'Analysis Engine', description: 'Time horizon for future predictions' },
    { name: 'PRED_SAMPLE_SIZE', value: '1000', category: 'Analysis Engine', description: 'Number of samples used for each prediction run' },
]

export default function Config() {
    const [configs, setConfigs] = useState<ConfigItem[]>(INITIAL_CONFIGS)
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [editValue, setEditValue] = useState('')
    const [isApplying, setIsApplying] = useState(false)

    const handleEdit = (index: number) => {
        setEditingIndex(index)
        setEditValue(configs[index].value)
    }

    const handleCancel = () => {
        setEditingIndex(null)
        setEditValue('')
    }

    const handleSave = (index: number) => {
        const newConfigs = [...configs]
        newConfigs[index].value = editValue
        setConfigs(newConfigs)
        setEditingIndex(null)
        toast.success(`${configs[index].name} updated locally`)
    }

    const handleApply = async () => {
        setIsApplying(true)
        await new Promise((resolve) => setTimeout(resolve, 1500))
        setIsApplying(false)
        toast.success('Configurations applied to the cluster successfully')
    }

    // Group configs by category
    const categories = Array.from(new Set(configs.map(c => c.category)))

    return (
        <div className={pageContainerClass}>
            <PageHeader
                title="Configuration"
                description="Manage system-wide environment variables and engine settings"
                icon={Settings2}
                actions={
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={isApplying}
                        className={cn(
                            'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all',
                            'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-900/20',
                            'hover:from-cyan-400 hover:to-blue-500 hover:shadow-cyan-400/30',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        <Save className={cn('h-4 w-4', isApplying && 'animate-pulse')} />
                        {isApplying ? 'Applying...' : 'Apply Changes'}
                    </button>
                }
            />

            <div className="space-y-8">
                {categories.map((category) => (
                    <div key={category} className="space-y-3">
                        <h2 className="px-2 text-sm font-bold uppercase tracking-widest text-[var(--text-muted)]">
                            {category}
                        </h2>
                        <div className={tableShellClass}>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-[var(--border)]">
                                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] w-1/2">
                                                Config Name
                                            </th>
                                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                                Current Value
                                            </th>
                                            <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                                Action
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {configs
                                            .map((c, i) => ({ ...c, originalIndex: i }))
                                            .filter((config) => config.category === category)
                                            .map((config) => (
                                                <tr
                                                    key={config.name}
                                                    className="group transition-colors hover:bg-[var(--surface-subtle)]/30"
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                                                                {config.name}
                                                            </span>
                                                            {config.description && (
                                                                <span className="mt-0.5 text-xs text-[var(--text-muted)]">
                                                                    {config.description}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {editingIndex === config.originalIndex ? (
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={editValue}
                                                                    onChange={(e) => setEditValue(e.target.value)}
                                                                    className="w-full rounded-lg border border-cyan-500/50 bg-[var(--surface)] px-3 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                                                                    autoFocus
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') handleSave(config.originalIndex)
                                                                        if (e.key === 'Escape') handleCancel()
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <span className="font-mono text-sm text-[var(--text-secondary)]">
                                                                {config.value}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {editingIndex === config.originalIndex ? (
                                                            <div className="flex justify-end gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSave(config.originalIndex)}
                                                                    className="rounded-lg p-1 text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                                                                    title="Save"
                                                                >
                                                                    <Check className="h-4 w-4" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleCancel}
                                                                    className="rounded-lg p-1 text-rose-400 hover:bg-rose-400/10 transition-colors"
                                                                    title="Cancel"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEdit(config.originalIndex)}
                                                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
                                                                title="Edit configuration"
                                                            >
                                                                <Edit3 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
