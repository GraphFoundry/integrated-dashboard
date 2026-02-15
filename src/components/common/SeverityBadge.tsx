interface SeverityBadgeProps {
  readonly severity: string
  /** Whether to show the animated pulse dot */
  readonly showPulse?: boolean
  /** Additional class names */
  readonly className?: string
}

const severityConfig: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-500', border: 'border-red-500/30' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500', border: 'border-orange-500/30' },
  medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500', border: 'border-yellow-500/30' },
  low: { bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-500', border: 'border-blue-500/30' },
}

const defaultConfig = { bg: 'bg-gray-500/20', text: 'text-gray-400', dot: 'bg-gray-500', border: 'border-gray-500/30' }

export default function SeverityBadge({ severity, showPulse = false, className = '' }: SeverityBadgeProps) {
  const config = severityConfig[severity] ?? defaultConfig

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border} ${className}`}>
      {showPulse && (
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-75`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dot}`} />
        </span>
      )}
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  )
}
