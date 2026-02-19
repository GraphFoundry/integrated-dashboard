export type RiskLevel = 'high' | 'medium' | 'low'

interface RiskBadgeProps {
  level: RiskLevel
  className?: string
}

const riskStyles: Record<RiskLevel, string> = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
}

const riskLabels: Record<RiskLevel, string> = {
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk',
}

export default function RiskBadge({ level, className = '' }: Readonly<RiskBadgeProps>) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${riskStyles[level]} ${className}`}
    >
      {riskLabels[level]}
    </span>
  )
}
