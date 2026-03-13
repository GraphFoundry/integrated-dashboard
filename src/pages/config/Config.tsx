import { useState, useEffect, useCallback } from 'react'
import { Settings, RotateCcw, Zap, Save, ChevronRight, Undo2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import {
  cn,
  pageContainerClass,
  glassPanelClass,
  glassSurfaceClass,
  primaryButtonClass,
  successButtonClass,
  secondaryButtonClass,
  controlInputBaseClass,
  loadingCardClass,
} from '@/components/common/uiClassTokens'
import {
  bffApi,
  type ServiceConfigInfo,
  type ConfigKeyInfo,
} from '@/lib/bffApiClient'

type DirtyMap = Record<string, Record<string, string>> // serviceId -> key -> editedValue

export default function Config() {
  const [services, setServices] = useState<ServiceConfigInfo[]>([])
  const [selectedService, setSelectedService] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState<DirtyMap>({})
  const [applying, setApplying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await bffApi.getConfigs()
      setServices(data)
      if (data.length > 0 && !selectedService) {
        setSelectedService(data[0].serviceId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configs')
    } finally {
      setLoading(false)
    }
  }, [selectedService])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  const currentService = services.find((s) => s.serviceId === selectedService)
  const serviceDirty = dirty[selectedService] || {}
  const hasDirtyKeys = Object.keys(serviceDirty).length > 0

  function handleValueChange(key: string, value: string, currentValue: string) {
    setDirty((prev) => {
      const svcDirty = { ...prev[selectedService] }
      if (value === currentValue) {
        delete svcDirty[key]
      } else {
        svcDirty[key] = value
      }
      return { ...prev, [selectedService]: svcDirty }
    })
  }

  function handleRevert(key: string) {
    setDirty((prev) => {
      const svcDirty = { ...prev[selectedService] }
      delete svcDirty[key]
      return { ...prev, [selectedService]: svcDirty }
    })
  }

  function handleResetAll() {
    if (!currentService) return
    const resetUpdates: Record<string, string> = {}
    for (const group of currentService.groups) {
      for (const key of group.keys) {
        if (key.currentValue !== key.defaultValue) {
          resetUpdates[key.key] = key.defaultValue
        }
      }
    }
    if (Object.keys(resetUpdates).length === 0) {
      toast('All values are already at defaults')
      return
    }
    setDirty((prev) => ({ ...prev, [selectedService]: resetUpdates }))
  }

  async function handleSaveOnly() {
    if (!hasDirtyKeys) return
    setSaving(true)
    try {
      for (const [key, value] of Object.entries(serviceDirty)) {
        const result = await bffApi.updateConfigKey(selectedService, key, value)
        if (!result.updated) {
          toast.error(`Failed to save ${key}: ${result.error}`)
          setSaving(false)
          return
        }
      }
      toast.success('Config saved to ConfigMap')
      setDirty((prev) => ({ ...prev, [selectedService]: {} }))
      await fetchConfigs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleApplyRuntime() {
    setApplying(true)
    setConfirmOpen(false)
    try {
      const updates = hasDirtyKeys ? serviceDirty : undefined
      const result = await bffApi.applyConfig(selectedService, updates)
      if (!result.applied) {
        toast.error(`Apply failed: ${result.error}`)
        return
      }
      if (result.reloaded) {
        toast.success('Config applied and service reloaded')
      } else {
        toast.error(result.error || 'ConfigMap updated but reload failed')
      }
      setDirty((prev) => ({ ...prev, [selectedService]: {} }))
      await fetchConfigs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className={pageContainerClass}>
        <PageHeader title="Config" description="Runtime configuration management" icon={Settings} />
        <div className={loadingCardClass}>Loading configuration...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={pageContainerClass}>
        <PageHeader title="Config" description="Runtime configuration management" icon={Settings} />
        <div className={cn(glassPanelClass, 'p-8 text-center')}>
          <p className="text-red-400">{error}</p>
          <button onClick={fetchConfigs} className={cn(secondaryButtonClass, 'mt-4')}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={pageContainerClass}>
      <Toaster position="top-right" toastOptions={{ className: '!bg-[var(--surface-elevated)] !text-[var(--text-primary)] !border !border-[var(--border)]' }} />

      <PageHeader
        title="Config"
        description="View and update runtime configuration across services without pod restarts"
        icon={Settings}
      />

      {/* Service tabs */}
      <div className={cn(glassSurfaceClass, 'flex gap-1 overflow-x-auto p-1.5')}>
        {services.map((svc) => {
          const isActive = svc.serviceId === selectedService
          const svcHasDirty = Object.keys(dirty[svc.serviceId] || {}).length > 0
          return (
            <button
              key={svc.serviceId}
              onClick={() => setSelectedService(svc.serviceId)}
              className={cn(
                'relative flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
                isActive
                  ? 'border border-cyan-300/35 bg-gradient-to-r from-cyan-400/15 to-blue-500/15 text-[var(--text-primary)] shadow-[0_4px_12px_rgba(14,116,144,0.2)]'
                  : 'border border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
              )}
            >
              {svc.displayName}
              {svcHasDirty && (
                <span className="h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" />
              )}
            </button>
          )
        })}
      </div>

      {/* Config groups */}
      {currentService && (
        <div className="space-y-4">
          {currentService.groups.map((group) => (
            <div key={group.name} className={cn(glassPanelClass, 'overflow-hidden')}>
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-6 py-4">
                <ChevronRight className="h-4 w-4 text-[var(--color-emerald-300)]" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {group.name}
                </h3>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {group.keys.map((keyInfo) => (
                  <ConfigRow
                    key={keyInfo.key}
                    keyInfo={keyInfo}
                    editedValue={serviceDirty[keyInfo.key]}
                    onChange={(val) => handleValueChange(keyInfo.key, val, keyInfo.currentValue)}
                    onRevert={() => handleRevert(keyInfo.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      {currentService && (
        <div className={cn(glassSurfaceClass, 'sticky bottom-4 flex items-center justify-between gap-4 p-4')}>
          <div className="flex items-center gap-3">
            <button onClick={handleResetAll} className={cn(secondaryButtonClass, 'flex items-center gap-2')}>
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </button>
          </div>
          <div className="flex items-center gap-3">
            {hasDirtyKeys && (
              <span className="flex items-center gap-1.5 text-sm text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                {Object.keys(serviceDirty).length} unsaved {Object.keys(serviceDirty).length === 1 ? 'change' : 'changes'}
              </span>
            )}
            <button
              onClick={handleSaveOnly}
              disabled={!hasDirtyKeys || saving}
              className={cn(primaryButtonClass, 'flex items-center gap-2')}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Only'}
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={applying}
              className={cn(successButtonClass, 'flex items-center gap-2')}
            >
              <Zap className="h-4 w-4" />
              {applying ? 'Applying...' : 'Apply Runtime'}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={cn(glassPanelClass, 'mx-4 w-full max-w-md p-6')}>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Apply Runtime Config</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              This will {hasDirtyKeys ? 'save your changes to the ConfigMap and ' : ''}trigger a config
              reload on <strong className="text-[var(--text-primary)]">{currentService?.displayName}</strong>.
              The service will pick up the new values without restarting.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmOpen(false)} className={secondaryButtonClass}>
                Cancel
              </button>
              <button onClick={handleApplyRuntime} className={cn(successButtonClass, 'flex items-center gap-2')}>
                <Zap className="h-4 w-4" />
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ConfigRow component ─────────────────────────────────────────────────────

function ConfigRow({
  keyInfo,
  editedValue,
  onChange,
  onRevert,
}: {
  keyInfo: ConfigKeyInfo
  editedValue: string | undefined
  onChange: (value: string) => void
  onRevert: () => void
}) {
  const isDirty = editedValue !== undefined
  const displayValue = editedValue ?? keyInfo.currentValue
  const isDefault = keyInfo.currentValue === keyInfo.defaultValue && !isDirty
  const inputClassName =
    keyInfo.type === 'string'
      ? 'w-80 !h-9 text-left font-mono text-sm'
      : 'w-40 !h-9 text-right font-mono text-sm'

  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{keyInfo.label}</span>
          {isDirty && <span className="h-2 w-2 rounded-full bg-amber-400" title="Modified" />}
          {isDefault && (
            <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              default
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{keyInfo.description}</p>
        <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">{keyInfo.key}</p>
      </div>

      <div className="flex items-center gap-2">
        {keyInfo.type === 'boolean' ? (
          <button
            onClick={() => onChange(displayValue === 'true' ? 'false' : 'true')}
            className={cn(
              'relative h-7 w-12 rounded-full transition-colors',
              displayValue === 'true'
                ? 'bg-emerald-500/60 border border-emerald-300/40'
                : 'bg-[var(--surface-subtle)] border border-[var(--border)]'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                displayValue === 'true' ? 'translate-x-5' : 'translate-x-0.5'
              )}
            />
          </button>
        ) : (
          <input
            type={keyInfo.type === 'number' || keyInfo.type === 'float' ? 'number' : 'text'}
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            step={keyInfo.type === 'float' ? '0.1' : undefined}
            min={keyInfo.validation?.min}
            max={keyInfo.validation?.max}
            className={cn(controlInputBaseClass, inputClassName)}
          />
        )}

        {isDirty && (
          <button
            onClick={onRevert}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
            title="Revert to saved value"
          >
            <Undo2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
