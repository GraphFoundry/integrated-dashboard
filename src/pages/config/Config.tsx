import { useState, useEffect } from 'react'
import { Settings2, Save, Edit3, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import { bffApi } from '@/lib/bffApiClient'
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
    { name: 'S_SCH_EXTENDER_DELAY_MS', value: '200', category: 'Scheduler Engine', description: 'Delay in milliseconds for the scheduler extender' },
]

export default function Config() {
    const [configs, setConfigs] = useState<ConfigItem[]>(INITIAL_CONFIGS)
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [editValue, setEditValue] = useState('')
    const [isApplying, setIsApplying] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchConfigs = async () => {
            try {
                const response = await bffApi.getConfigs()
                if (response.success && response.configs.length > 0) {
                    setConfigs(response.configs)
                }
            } catch (error) {
                console.error('Failed to fetch configs:', error)
                toast.error('Failed to load configurations from server')
            } finally {
                setIsLoading(false)
            }
        }
        fetchConfigs()
    }, [])

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
        try {
            const result = await bffApi.applyConfigs(configs)
            if (result.success) {
                toast.success(`Succesfully applied ${result.updatedCount} configs to etcd`)
            } else {
                toast.error('Failed to apply configurations')
            }
        } catch (error) {
            console.error('Apply error:', error)
            toast.error('Network error while applying configurations')
        } finally {
            setIsApplying(false)
        }
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
                        disabled={isApplying || isLoading}
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

            {isLoading ? (
                <div className="flex h-[400px] items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                        <span className="text-sm font-medium text-[var(--text-muted)]">Loading configurations...</span>
                    </div>
                </div>
            ) : (
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
            )}
        </div>
    )
}
