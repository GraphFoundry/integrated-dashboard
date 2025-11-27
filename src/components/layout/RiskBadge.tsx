export type RiskLevel = 'high' | 'medium' | 'low'

interface RiskBadgeProps {
  level: RiskLevel
  className?: string
}

const riskStyles: Record<RiskLevel, string> = {
  high: 'bg-red-900/30 text-red-300 border-red-700',
  medium: 'bg-yellow-900/30 text-yellow-300 border-yellow-700',
  low: 'bg-green-900/30 text-green-300 border-green-700',
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
