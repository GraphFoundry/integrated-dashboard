import type { AlertsComponentProps } from '@/widgets/alerts/types'
import { useAlerts } from '@/widgets/alerts/useAlerts'
import { useMemo, useState } from 'react'

/**
 * AlertsSlot - Integration mount point for teammate's Alert Engine UI
 *
 * This component provides a stable insertion point for the Alert Engine team
 * to plug in their alerts component. The actual implementation will be provided
 * by the alert-engine module.
 *
 * TEAMMATE INTEGRATION INSTRUCTIONS:
 * 1. Create your AlertsPanel component implementing AlertsComponentProps
 * 2. Replace the placeholder content with your component
 * 3. Connect to your alert data source (WebSocket, polling, etc.)
 *
 * Example:
 * ```tsx
 * import AlertsPanel from '@alert-engine/ui';
 *
 * export default function AlertsSlot(props: AlertsComponentProps) {
 *   return <AlertsPanel {...props} />;
 * }
 * ```
 */
export default function AlertsSlot({ serviceId, expanded = false }: AlertsComponentProps) {
  const { alerts, loading, connected, acknowledge, setFilters, loadMore, hasMore, loadingMore } = useAlerts()
  const [severity, setSeverity] = useState<string | undefined>(undefined)
  const [svc, setSvc] = useState<string | undefined>(serviceId)
  const [q, setQ] = useState<string | undefined>(undefined)

  function applyFilters() {
    setFilters({ severity, serviceId: svc, q })
  }

  function clearFilters() {
    setSeverity(undefined)
    setSvc(undefined)
    setQ(undefined)
    setFilters({})
  }

  function AlertsList() {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [detail, setDetail] = useState<any | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)

    async function openDetail(id: string) {
      setSelectedId(id)
      setDetailLoading(true)
      try {
        const d = await fetchDetail(id)
        setDetail(d)
      } finally {
        setDetailLoading(false)
      }
    }

    if (loading) {
      return <div className="text-sm text-slate-400">Loading alerts…</div>
    }

    if (alerts.length === 0) {
      return <div className="text-sm text-slate-400">No active alerts</div>
    }

    return (
      <>
        <div className="mt-3 space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`rounded px-3 py-2 flex items-center gap-2 cursor-pointer ${
                a.severity === 'critical'
                  ? 'bg-red-900/10 border border-red-800/30'
                  : a.severity === 'warning'
                  ? 'bg-yellow-900/10 border border-yellow-800/30'
                  : 'bg-slate-800/20 border border-slate-700/30'
              }`}
              onClick={() => openDetail(a.id)}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-yellow-500' : 'bg-slate-500'
                }`}
              />

              <div className="flex-1 text-left">
                <div className="text-sm text-white font-medium">{a.title}</div>
                <div className="text-xs text-slate-400">{a.message}</div>
              </div>

              <div className="text-right text-xs text-slate-500">
                <div>{new Date(a.timestamp).toLocaleString()}</div>
                <div className="mt-1">
                  {a.acknowledged ? (
                    <span className="text-green-400">Acknowledged</span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        acknowledge(a.id).catch(() => {
                          /* error handled in hook */
                        })
                      }}
                      className="text-blue-400 hover:underline"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-center">
          {hasMore ? (
            <button
              onClick={() => loadMore()}
              disabled={loadingMore}
              className="text-sm text-blue-400 hover:underline disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          ) : (
            <div className="text-sm text-slate-500">No more alerts</div>
          )}
        </div>

        {/* Detail drawer */}
        {selectedId && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className="flex-1 bg-black/40"
              onClick={() => {
                setSelectedId(null)
                setDetail(null)
              }}
            />
            <div className="w-96 bg-slate-900 border-l border-slate-700 p-4 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-white">Alert detail</h4>
                <button
                  onClick={() => {
                    setSelectedId(null)
                    setDetail(null)
                  }}
                  className="text-slate-400 text-xs hover:underline"
                >
                  Close
                </button>
              </div>

              {detailLoading && <div className="text-sm text-slate-400">Loading…</div>}

              {detail && (
                <pre className="text-xs text-slate-300 bg-slate-800/40 p-2 rounded text-left max-h-[60vh] overflow-auto">
                  {JSON.stringify(detail, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className={`bg-slate-900 border border-slate-700 rounded-lg ${expanded ? 'p-6' : 'p-4'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🚨</span>
        <h3 className="text-lg font-semibold text-white">Alerts</h3>
        <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-xs rounded">
          Integration Slot
        </span>

        <div className="ml-auto text-xs text-slate-400">
          <span className={`mr-2 ${connected ? 'text-green-400' : 'text-yellow-400'}`}>
            {connected ? 'Live' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Filter controls */}
      <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-4">
        <div className="flex gap-3 items-center">
          <select
            value={severity ?? ''}
            onChange={(e) => setSeverity(e.target.value || undefined)}
            className="bg-slate-900 text-slate-200 text-sm rounded px-2 py-1"
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>

          <input
            value={svc ?? ''}
            onChange={(e) => setSvc(e.target.value || undefined)}
            placeholder="Service ID"
            className="bg-slate-900 text-slate-200 text-sm rounded px-2 py-1"
          />

          <input
            value={q ?? ''}
            onChange={(e) => setQ(e.target.value || undefined)}
            placeholder="Search"
            className="bg-slate-900 text-slate-200 text-sm rounded px-2 py-1 flex-1"
          />

          <button
            onClick={applyFilters}
            className="text-sm text-blue-400 hover:underline"
          >
            Apply
          </button>

          <button
            onClick={clearFilters}
            className="text-sm text-slate-400 hover:underline"
          >
            Clear
          </button>
        </div>

        <div className="text-xs text-slate-500 mt-3">
          <p>• Real-time alert notifications</p>
          <p>• Acknowledgment workflow</p>
          {serviceId && (
            <p className="text-blue-400">
              Filtered for: <code className="bg-slate-700 px-1 rounded">{serviceId}</code>
            </p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-600">
            See: <code>src/widgets/alerts/types.ts</code> for interface spec
          </p>
        </div>
      </div>

      {/* Alerts list (fetched via REST + live via WebSocket) */}
      <AlertsList />
    </div>
  )
}
