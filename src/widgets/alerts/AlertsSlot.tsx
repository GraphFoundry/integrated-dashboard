import type { AlertsComponentProps } from './types';

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
  return (
    <div className={`bg-slate-900 border border-slate-700 rounded-lg ${expanded ? 'p-6' : 'p-4'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🚨</span>
        <h3 className="text-lg font-semibold text-white">Alerts</h3>
        <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-xs rounded">
          Integration Slot
        </span>
      </div>

      {/* Placeholder content - will be replaced by teammate's component */}
      <div className="bg-slate-800/50 border border-dashed border-slate-600 rounded-lg p-4 text-center">
        <p className="text-slate-400 text-sm mb-2">
          Alerts UI will be plugged in here by Alert Engine component
        </p>
        
        <div className="text-xs text-slate-500 space-y-1">
          <p>• Real-time alert notifications</p>
          <p>• Alert severity filtering</p>
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

      {/* Mock alerts for visual reference */}
      <div className="mt-3 space-y-2">
        <div className="bg-red-900/10 border border-red-800/30 rounded px-3 py-2 flex items-center gap-2 opacity-40">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          <span className="text-xs text-red-300">Sample: Critical latency spike</span>
          <span className="text-xs text-slate-500 ml-auto">mock</span>
        </div>
        <div className="bg-yellow-900/10 border border-yellow-800/30 rounded px-3 py-2 flex items-center gap-2 opacity-40">
          <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
          <span className="text-xs text-yellow-300">Sample: Stale graph data</span>
          <span className="text-xs text-slate-500 ml-auto">mock</span>
        </div>
      </div>
    </div>
  );
}
